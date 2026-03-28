#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"

BASE_DIR="/home/app/timepilot"
ENV_DIR=""
APP_USER="app"
APP_GROUP="app"
REPO_URL=""
BRANCH_DEV="main"
BRANCH_PROD="main"
INSTANCES="dev,prod"
DEV_PORT="9001"
PROD_PORT="9002"
SKIP_START="false"
FORCE_ENV="false"
NODE_MAJOR="20"
LOG_DIR="/var/log/timepilot"
LOG_FILE=""

log() {
  printf '[%s] %s\n' "$SCRIPT_NAME" "$*"
}

die() {
  printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  sudo ./scripts/ops/install-ubuntu.sh --repo-url <url> [options]

Required:
  --repo-url <url>          Git URL for the TimePilot repository.

Options:
  --base-dir <path>         Base path for app directories (default: /home/app/timepilot)
  --branch-dev <branch>     Git branch for dev instance (default: main)
  --branch-prod <branch>    Git branch for prod instance (default: main)
  --instances <csv>         Comma-separated instances (default: dev,prod)
  --dev-port <port>         Port for dev instance (default: 9001)
  --prod-port <port>        Port for prod instance (default: 9002)
  --log-dir <path>          Installer log directory (default: /var/log/timepilot)
  --app-user <user>         Linux user to run service (default: app)
  --app-group <group>       Linux group to run service (default: app)
  --skip-start              Install/update only; do not start/restart services
  --force-env               Recreate env skeleton files if they already exist
  --help                    Show this help

Examples:
  sudo ./scripts/ops/install-ubuntu.sh --repo-url https://github.com/timepilot/platform.git
  sudo ./scripts/ops/install-ubuntu.sh --repo-url git@github.com:timepilot/platform.git --branch-dev develop --branch-prod main
USAGE
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Run this script with sudo/root."
  fi
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || die "Required command '$name' not found"
}

validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || die "Port must be numeric: $port"
  (( port >= 1 && port <= 65535 )) || die "Port must be in range 1-65535: $port"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo-url)
        REPO_URL="${2:-}"
        shift 2
        ;;
      --base-dir)
        BASE_DIR="${2:-}"
        shift 2
        ;;
      --branch-dev)
        BRANCH_DEV="${2:-}"
        shift 2
        ;;
      --branch-prod)
        BRANCH_PROD="${2:-}"
        shift 2
        ;;
      --instances)
        INSTANCES="${2:-}"
        shift 2
        ;;
      --dev-port)
        DEV_PORT="${2:-}"
        shift 2
        ;;
      --prod-port)
        PROD_PORT="${2:-}"
        shift 2
        ;;
      --log-dir)
        LOG_DIR="${2:-}"
        shift 2
        ;;
      --app-user)
        APP_USER="${2:-}"
        shift 2
        ;;
      --app-group)
        APP_GROUP="${2:-}"
        shift 2
        ;;
      --skip-start)
        SKIP_START="true"
        shift
        ;;
      --force-env)
        FORCE_ENV="true"
        shift
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done

  [[ -n "$REPO_URL" ]] || die "--repo-url is required"
  validate_port "$DEV_PORT"
  validate_port "$PROD_PORT"
  ENV_DIR="$BASE_DIR/environments"
}

setup_logging() {
  mkdir -p "$LOG_DIR"
  chmod 750 "$LOG_DIR"

  LOG_FILE="$LOG_DIR/install-$(date -u +%Y%m%dT%H%M%SZ).log"
  touch "$LOG_FILE"
  chmod 640 "$LOG_FILE"

  exec > >(tee -a "$LOG_FILE") 2>&1
  log "Writing installer logs to $LOG_FILE"
}

collect_service_diagnostics() {
  local instance="$1"

  log "Diagnostics: systemctl status timepilot@$instance"
  systemctl status "timepilot@$instance" --no-pager || true

  log "Diagnostics: recent journal for timepilot@$instance"
  journalctl -u "timepilot@$instance" -n 120 --no-pager || true
}

collect_runtime_diagnostics() {
  local -a instances=()

  if command -v systemctl >/dev/null 2>&1; then
    mapfile -t instances < <(parse_instances)
    for instance in "${instances[@]}"; do
      collect_service_diagnostics "$instance"
    done
  fi

  log "Diagnostics: version summary"
  command -v node >/dev/null 2>&1 && node --version || true
  command -v npm >/dev/null 2>&1 && npm --version || true
  command -v git >/dev/null 2>&1 && git --version || true
}

on_error() {
  local line="$1"
  local command="$2"
  local code="$3"

  set +e
  printf '[%s] ERROR: command failed on line %s with exit code %s\n' "$SCRIPT_NAME" "$line" "$code" >&2
  printf '[%s] ERROR: failed command: %s\n' "$SCRIPT_NAME" "$command" >&2
  if [[ -n "$LOG_FILE" ]]; then
    printf '[%s] ERROR: diagnostics log: %s\n' "$SCRIPT_NAME" "$LOG_FILE" >&2
  fi
  collect_runtime_diagnostics
  exit "$code"
}

ensure_ubuntu() {
  [[ -f /etc/os-release ]] || die "Cannot detect OS"
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "This installer supports Ubuntu only"
}

apt_install() {
  export DEBIAN_FRONTEND=noninteractive
  log "Updating apt metadata"
  apt-get update -y

  log "Installing base dependencies"
  apt-get install -y \
    ca-certificates \
    curl \
    git \
    jq \
    build-essential \
    postgresql-client \
    redis-tools
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
    if [[ "$major" =~ ^[0-9]+$ ]] && (( major >= NODE_MAJOR )); then
      log "Node.js $(node -v) already installed"
      return
    fi
  fi

  log "Installing Node.js ${NODE_MAJOR}.x from NodeSource"
  # Purge system Node.js packages to avoid dpkg file-overwrite conflicts (e.g. libnode-dev)
  apt-get purge -y nodejs nodejs-doc libnode-dev 'libnode[0-9]*' 2>/dev/null || true
  apt-get autoremove -y 2>/dev/null || true
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
}

ensure_user_group() {
  if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
    log "Creating group: $APP_GROUP"
    groupadd --system "$APP_GROUP"
  fi

  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    log "Creating user: $APP_USER"
    useradd --system --create-home --home-dir "/home/$APP_USER" --gid "$APP_GROUP" "$APP_USER"
  fi
}

clone_or_update_repo() {
  local instance="$1"
  local branch="$2"
  local app_dir="$BASE_DIR/$instance"

  mkdir -p "$BASE_DIR"

  if [[ -d "$app_dir/.git" ]]; then
    log "Updating repository in $app_dir (branch: $branch)"
    sudo -u "$APP_USER" git -C "$app_dir" fetch --all --prune
    sudo -u "$APP_USER" git -C "$app_dir" checkout "$branch"
    sudo -u "$APP_USER" git -C "$app_dir" pull --ff-only origin "$branch"
  else
    log "Cloning repository into $app_dir (branch: $branch)"
    sudo -u "$APP_USER" git clone --branch "$branch" --single-branch "$REPO_URL" "$app_dir"
  fi

  log "Installing dependencies in $app_dir"
  if [[ -f "$app_dir/package-lock.json" ]]; then
    sudo -u "$APP_USER" bash -lc "cd '$app_dir' && npm ci"
  else
    sudo -u "$APP_USER" bash -lc "cd '$app_dir' && npm install"
  fi

  log "Building application in $app_dir"
  sudo -u "$APP_USER" bash -lc "cd '$app_dir' && npm run build"

  log "Running database migrations in $app_dir"
  sudo -u "$APP_USER" bash -lc "cd '$app_dir' && npm run migrate"
}

upsert_env_var() {
  local file_path="$1"
  local key="$2"
  local value="$3"
  local escaped

  escaped="$(printf '%s' "$value" | sed -e 's/[\\&|]/\\\\&/g')"

  if grep -Eq "^${key}=" "$file_path"; then
    sed -i -E "s|^${key}=.*|${key}=${escaped}|" "$file_path"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file_path"
  fi
}

write_env_file() {
  local instance="$1"
  local port="$2"
  local app_dir="$BASE_DIR/$instance"
  local env_file="$ENV_DIR/$instance.env"
  local template_file="$app_dir/.env.example"

  if [[ -f "$env_file" && "$FORCE_ENV" != "true" ]]; then
    log "Keeping existing env file: $env_file"
    return
  fi

  [[ -f "$template_file" ]] || die "Missing template file for $instance instance: $template_file"

  log "Writing env file from template $template_file -> $env_file"
  cp "$template_file" "$env_file"

  upsert_env_var "$env_file" "NODE_ENV" "production"
  upsert_env_var "$env_file" "PORT" "$port"
  upsert_env_var "$env_file" "API_BASE_URL" "http://127.0.0.1:$port"
  upsert_env_var "$env_file" "CLIENT_BASE_URL" "http://127.0.0.1:3001"

  upsert_env_var "$env_file" "GOOGLE_CALLBACK_URL" "http://127.0.0.1:$port/api/auth/google/callback"
  upsert_env_var "$env_file" "APPLE_CALLBACK_URL" "http://127.0.0.1:$port/api/auth/apple/callback"
  upsert_env_var "$env_file" "MICROSOFT_CALLBACK_URL" "http://127.0.0.1:$port/api/auth/microsoft/callback"

  upsert_env_var "$env_file" "APP_DIR" "$app_dir"
  upsert_env_var "$env_file" "NODE_BIN" "/usr/bin/node"

  chown "$APP_USER:$APP_GROUP" "$env_file"
  chmod 640 "$env_file"
}

install_systemd_template() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local template_source="$script_dir/timepilot@.service.template"
  local service_target="/etc/systemd/system/timepilot@.service"

  [[ -f "$template_source" ]] || die "Missing template file: $template_source"

  sed \
    -e "s|__APP_USER__|$APP_USER|g" \
    -e "s|__APP_GROUP__|$APP_GROUP|g" \
    -e "s|__ENV_DIR__|$ENV_DIR|g" \
    "$template_source" > "$service_target"

  chmod 644 "$service_target"
  log "Installed systemd template: $service_target"
}

instance_port() {
  local instance="$1"
  case "$instance" in
    dev)
      echo "$DEV_PORT"
      ;;
    prod)
      echo "$PROD_PORT"
      ;;
    *)
      die "Unsupported instance '$instance'. Supported values are dev and prod."
      ;;
  esac
}

instance_branch() {
  local instance="$1"
  case "$instance" in
    dev)
      echo "$BRANCH_DEV"
      ;;
    prod)
      echo "$BRANCH_PROD"
      ;;
    *)
      die "Unsupported instance '$instance'. Supported values are dev and prod."
      ;;
  esac
}

parse_instances() {
  local -a raw=()
  local -a parsed=()
  IFS=',' read -r -a raw <<< "$INSTANCES"

  for instance in "${raw[@]}"; do
    local trimmed
    trimmed="$(echo "$instance" | xargs)"
    [[ -n "$trimmed" ]] || continue
    case "$trimmed" in
      dev|prod)
        parsed+=("$trimmed")
        ;;
      *)
        die "Unsupported instance '$trimmed'. Supported values are dev and prod."
        ;;
    esac
  done

  (( ${#parsed[@]} > 0 )) || die "No valid instances provided. Use --instances dev,prod"

  printf '%s\n' "${parsed[@]}"
}

contains_placeholder_secrets() {
  local env_file="$1"
  grep -E '^SESSION_SECRET=(CHANGE_ME|CHANGE_ME_TO_A_LONG_RANDOM_SECRET|your_session_secret_key_change_in_production)$' "$env_file" >/dev/null 2>&1
}

start_instances() {
  local -a instances=()
  mapfile -t instances < <(parse_instances)

  systemctl daemon-reload

  for instance in "${instances[@]}"; do
    local trimmed="$instance"
    local env_file="$ENV_DIR/$trimmed.env"

    [[ -f "$env_file" ]] || die "Missing env file for instance '$trimmed': $env_file"

    if contains_placeholder_secrets "$env_file"; then
      log "Skipping start for $trimmed because SESSION_SECRET is still a placeholder in $env_file"
      continue
    fi

    log "Enabling and restarting timepilot@$trimmed"
    systemctl enable "timepilot@$trimmed"
    systemctl restart "timepilot@$trimmed"
  done
}

health_check_instances() {
  local -a instances=()
  mapfile -t instances < <(parse_instances)

  for instance in "${instances[@]}"; do
    local trimmed="$instance"
    local port
    port="$(instance_port "$trimmed")"
    local env_file="$ENV_DIR/$trimmed.env"

    if contains_placeholder_secrets "$env_file"; then
      log "Skipping health check for $trimmed because service start was skipped"
      continue
    fi

    log "Health checking $trimmed on 127.0.0.1:$port/health"
    curl --fail --silent --show-error "http://127.0.0.1:$port/health" >/dev/null
  done
}

main() {
  parse_args "$@"
  require_root
  setup_logging
  trap 'on_error "$LINENO" "$BASH_COMMAND" "$?"' ERR

  log "Starting TimePilot Ubuntu installer"
  log "Configuration: base_dir=$BASE_DIR env_dir=$ENV_DIR instances=$INSTANCES dev_port=$DEV_PORT prod_port=$PROD_PORT"
  log "Configuration: repo_url=$REPO_URL branch_dev=$BRANCH_DEV branch_prod=$BRANCH_PROD app_user=$APP_USER app_group=$APP_GROUP"

  ensure_ubuntu

  require_command curl
  require_command git
  require_command sed
  require_command xargs
  require_command systemctl

  apt_install
  ensure_node
  ensure_user_group

  mkdir -p "$BASE_DIR/dev" "$BASE_DIR/prod" "$ENV_DIR"
  chown -R "$APP_USER:$APP_GROUP" "$BASE_DIR"

  local -a instances=()
  mapfile -t instances < <(parse_instances)

  for instance in "${instances[@]}"; do
    clone_or_update_repo "$instance" "$(instance_branch "$instance")"
    write_env_file "$instance" "$(instance_port "$instance")"
  done

  install_systemd_template

  if [[ "$SKIP_START" == "true" ]]; then
    log "--skip-start set; services were not started"
  else
    start_instances
    health_check_instances
  fi

  log "Done."
  log "Installer log saved to $LOG_FILE"
  log "Edit env files under $ENV_DIR, then run: systemctl restart timepilot@dev timepilot@prod"
}

main "$@"
