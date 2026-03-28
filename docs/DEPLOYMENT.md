# TimePilot Deployment README

This guide covers production-style deployment on Ubuntu using:
- SSH-based GitHub access
- Separate dev/prod code folders
- One templated systemd service file with multiple instances
- Externalized env files that survive code updates

For service-level operations details, see [docs/ADMIN_SETUP_UBUNTU.md](docs/ADMIN_SETUP_UBUNTU.md).

## 1. Generate SSH key on Ubuntu

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

Accept defaults unless you need a custom path.

## 2. Start SSH agent and add key

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

## 3. Copy your public key

```bash
cat ~/.ssh/id_ed25519.pub
```

Copy the full output.

## 4. Add key to GitHub

Go to:
- https://github.com/settings/keys

Then:
1. Click `New SSH key`
2. Choose `Authentication key`
3. Paste your public key
4. Save

## 5. Verify SSH access

```bash
ssh -T git@github.com
```

When prompted, type `yes` to trust the host.

Expected result:

```text
Hi <username>! You've successfully authenticated, but GitHub does not provide shell access.
```

## 6. Prepare deployment folders and clone

```bash
sudo mkdir -p /home/app/timepilot
sudo chown -R app:app /home/app/timepilot
cd /home/app/timepilot

git clone git@github.com:Zunair/timepilot-platform.git ./prod
git clone git@github.com:Zunair/timepilot-platform.git ./dev

git config --global --add safe.directory /home/app/timepilot/prod
git config --global --add safe.directory /home/app/timepilot/dev
```

Notes:
- The second path argument (`./prod` and `./dev`) creates two independent working trees.

## 7. Install and automate as services

From either clone, run the installer with SSH repo URL:

```bash
cd /home/app/timepilot/prod
sudo bash scripts/ops/install-ubuntu.sh \
  --repo-url git@github.com:Zunair/timepilot-platform.git \
  --git-user <your-linux-login-user>
```

Use `--git-user` when your GitHub SSH key is on your login account (for example `ubuntu`) and not on the service account (`app`).
Use the Linux account name, not your GitHub username or email.

This will:
- install dependencies
- update/pull both instance folders
- build and migrate
- install `/etc/systemd/system/timepilot@.service`
- manage `timepilot@dev` and `timepilot@prod`
- write installer logs to `/var/log/timepilot`

## 8. Configure persistent env files

Edit:
- /home/app/timepilot/environments/dev.env
- /home/app/timepilot/environments/prod.env

Minimum required values:
- DATABASE_URL
- REDIS_URL
- SESSION_SECRET
- API_BASE_URL
- CLIENT_BASE_URL
- PORT
- APP_DIR
- NODE_BIN

Migration note:
- The installer runs `npm run migrate` only when `DATABASE_URL`, `REDIS_URL`, and `SESSION_SECRET` are set.
- If these are missing, the installer logs a migration skip and continues. After updating env files, rerun the installer to execute migrations.

Optional notification values:
- Leave all `TWILIO_*` variables unset to disable SMS notifications.
- If you set `TWILIO_ACCOUNT_SID`, it must be a real Twilio Account SID starting with `AC`.
- Do not leave placeholder values such as `your_twilio_account_sid` in deployed env files. The server now fails fast on invalid Twilio config.

Default port mapping:
- dev: 9001
- prod: 9002

## 9. Validate service health

```bash
sudo systemctl status timepilot@dev
sudo systemctl status timepilot@prod

curl http://127.0.0.1:9001/health
curl http://127.0.0.1:9002/health
```

## 10. Fast diagnostics

Installer logs:

```bash
sudo ls -ltr /var/log/timepilot
sudo tail -n 200 /var/log/timepilot/install-*.log
```

Service logs:

```bash
sudo journalctl -u timepilot@dev -n 200 --no-pager
sudo journalctl -u timepilot@prod -n 200 --no-pager
```
