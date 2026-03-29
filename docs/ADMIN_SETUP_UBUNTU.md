# Ubuntu Admin Setup (systemd multi-instance)

This runbook installs TimePilot on Ubuntu with two backend service instances and two client UI service instances using systemd templates:
- backend dev on port 9001
- backend prod on port 9002
- client dev on port 10002
- client prod on port 10003

HAProxy is intentionally out of scope.

For SSH key and SSH clone bootstrap steps, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What this setup creates

- Code directories:
  - /home/app/timepilot/dev
  - /home/app/timepilot/prod
- Persistent environment files:
  - /home/app/timepilot/environments/dev.env
  - /home/app/timepilot/environments/prod.env
- systemd template unit:
  - /etc/systemd/system/timepilot@.service
  - /etc/systemd/system/timepilot-client@.service
- Instance services:
  - timepilot@dev
  - timepilot@prod
  - timepilot-client@dev
  - timepilot-client@prod

Environment files live outside release directories so deploy/update operations do not overwrite secrets or instance config.

## Prerequisites

- Ubuntu host with sudo/root access
- Git access to your repository (HTTPS or SSH)
- PostgreSQL and Redis reachable from the host

## First install

From your repository root on the Ubuntu host:

```bash
sudo bash scripts/ops/install-ubuntu.sh \
  --repo-url https://github.com/timepilot/platform.git
```

The installer writes a timestamped log file under /var/log/timepilot by default.

Custom log path example:

```bash
sudo bash scripts/ops/install-ubuntu.sh \
  --repo-url https://github.com/timepilot/platform.git \
  --log-dir /var/log/timepilot/installer
```

If you use an SSH repo URL and your key is on a non-service login user, pass `--git-user <linux-login-user>` so clone/fetch runs under that account.

Optional branch control:

```bash
sudo bash scripts/ops/install-ubuntu.sh \
  --repo-url https://github.com/timepilot/platform.git \
  --branch-dev develop \
  --branch-prod main
```

Optional port control:

```bash
sudo bash scripts/ops/install-ubuntu.sh \
  --repo-url https://github.com/timepilot/platform.git \
  --dev-port 9001 \
  --prod-port 9002 \
  --dev-client-port 10002 \
  --prod-client-port 10003
```

If you want to prepare files first and start services later:

```bash
sudo bash scripts/ops/install-ubuntu.sh \
  --repo-url https://github.com/timepilot/platform.git \
  --skip-start
```

## Configure env files

Edit both files and replace placeholder values before starting:

- /home/app/timepilot/environments/dev.env
- /home/app/timepilot/environments/prod.env

These files are generated from each instance's .env.example template and then patched with instance-specific values (ports, callback URLs, APP_DIR, NODE_BIN).

Required fields include:
- DATABASE_URL
- REDIS_URL
- SESSION_SECRET
- NODE_ENV
- PORT
- API_BASE_URL
- CLIENT_BASE_URL
- APP_DIR
- NODE_BIN

Notes:
- Default ports are dev=9001 and prod=9002.
- Default client ports are dev=10002 and prod=10003.
- The installer will not auto-start an instance if SESSION_SECRET still has placeholder content.
- The installer runs `npm run migrate` only when `DATABASE_URL`, `REDIS_URL`, and `SESSION_SECRET` are set; otherwise it logs a skip and you can rerun after updating env files.

## Service operations

Status:

```bash
sudo systemctl status timepilot@dev
sudo systemctl status timepilot@prod
sudo systemctl status timepilot-client@dev
sudo systemctl status timepilot-client@prod
```

Start/stop/restart one instance:

```bash
sudo systemctl start timepilot@dev
sudo systemctl stop timepilot@dev
sudo systemctl restart timepilot@dev
sudo systemctl restart timepilot-client@dev
```

Restart both:

```bash
sudo systemctl restart timepilot@dev timepilot@prod
sudo systemctl restart timepilot-client@dev timepilot-client@prod
```

Enable on boot:

```bash
sudo systemctl enable timepilot@dev timepilot@prod
sudo systemctl enable timepilot-client@dev timepilot-client@prod
```

Logs:

```bash
sudo journalctl -u timepilot@dev -f
sudo journalctl -u timepilot@prod -f
sudo journalctl -u timepilot-client@dev -f
sudo journalctl -u timepilot-client@prod -f
```

Health checks:

```bash
curl http://127.0.0.1:9001/health
curl http://127.0.0.1:9002/health
curl http://127.0.0.1:10002/health
curl http://127.0.0.1:10003/health
```

## Updating code for dev/prod

Re-run installer. It will fetch and fast-forward the configured branches and rebuild in each instance folder.

```bash
sudo bash scripts/ops/install-ubuntu.sh \
  --repo-url https://github.com/timepilot/platform.git
```

Behavior on rerun:
- Existing env files are preserved.
- Use --force-env only if you explicitly want to regenerate env skeletons.
- Service unit is refreshed and systemd daemon is reloaded.

## Diagnostics and logs

Installer logs:

```bash
sudo ls -ltr /var/log/timepilot
sudo tail -n 200 /var/log/timepilot/install-*.log
```

On failure, the installer automatically prints:
- systemd status for each selected instance
- recent journal output for each selected instance
- runtime version summary (node, npm, git)

Service logs remain available via journalctl:

```bash
sudo journalctl -u timepilot@dev -n 200 --no-pager
sudo journalctl -u timepilot@prod -n 200 --no-pager
sudo journalctl -u timepilot-client@dev -n 200 --no-pager
sudo journalctl -u timepilot-client@prod -n 200 --no-pager
```

## Rollback basic flow

Rollback one instance to a known commit/tag:

```bash
sudo -u app git -C /home/app/timepilot/prod checkout <commit-or-tag>
sudo -u app bash -lc 'cd /home/app/timepilot/prod && npm install && npm run build'
sudo systemctl restart timepilot@prod
```
