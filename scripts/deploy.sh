#!/usr/bin/env bash
# One-shot deploy: push a temp SSH key via EC2 Instance Connect, pull latest
# main, rebuild changed services, restart.
#
# Requires: aws CLI with permission for ec2-instance-connect:SendSSHPublicKey,
# and a local SSH public key (default ~/.ssh/id_ed25519.pub).
#
# Override via env: INSTANCE_ID, REGION, HOST, SSH_USER, SSH_KEY, PROJECT_DIR.

set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:-i-0c598ee9c0087a563}"
REGION="${REGION:-ap-northeast-1}"
HOST="${HOST:-57.180.82.227}"
SSH_USER="${SSH_USER:-ec2-user}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
PROJECT_DIR="${PROJECT_DIR:-bim-mep-poc}"

log() { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }

log "pushing temp SSH key to $INSTANCE_ID via EC2 Instance Connect"
aws ec2-instance-connect send-ssh-public-key \
  --region "$REGION" \
  --instance-id "$INSTANCE_ID" \
  --instance-os-user "$SSH_USER" \
  --ssh-public-key "file://${SSH_KEY}.pub" >/dev/null

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

log "deploying to $SSH_USER@$HOST:~/$PROJECT_DIR"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" bash -s <<EOF
set -euo pipefail
cd ~/$PROJECT_DIR
echo "[remote] current: \$(git rev-parse --short HEAD)"
git fetch --quiet origin main
echo "[remote] target:  \$(git rev-parse --short origin/main)"
git reset --hard origin/main
sudo docker compose up -d --build --remove-orphans
sudo docker compose ps
EOF

log "smoke-test endpoints"
curl -fsS -o /dev/null -w "  dashboard:       %{http_code}\n" --max-time 15 "http://$HOST:5173/"
curl -fsS -o /dev/null -w "  api/v1/devices:  %{http_code}\n" --max-time 15 "http://$HOST:3000/api/v1/devices?limit=1"

log "done"
