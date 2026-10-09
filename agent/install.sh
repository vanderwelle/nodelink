#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Julian van der Welle
# NodeLink agent installer — Raspberry Pi 5 (arm64) and x86-64 mini PCs, Debian / Raspberry Pi OS / Ubuntu.
#   curl -fsSL https://raw.githubusercontent.com/vanderwelle/nodelink/main/agent/install.sh | sudo bash
# or from a checkout:   sudo bash agent/install.sh
# Options: --no-start (install but don't start)   --uninstall [--purge]
set -euo pipefail

REPO_RAW="${NODELINK_AGENT_RAW:-https://raw.githubusercontent.com/vanderwelle/nodelink/main/agent}"
PREFIX="${NODELINK_AGENT_PREFIX:-/opt/nodelink-agent}"
CONF_DIR="${NODELINK_AGENT_CONF_DIR:-/etc/nodelink-agent}"
UNIT="/etc/systemd/system/nodelink-agent.service"
BIN="/usr/local/bin/nodelink-agent"
USER_NAME="nodelink-agent"
DATA_DIR="${ALGORAND_DATA:-/var/lib/algorand}"
START=1

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

# Directory of this script when run from a checkout; empty when piped from curl.
SRC_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ "${1:-}" = "--uninstall" ]; then
  shift
  if [ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/uninstall.sh" ]; then exec bash "$SRC_DIR/uninstall.sh" "$@"; fi
  curl -fsSL "$REPO_RAW/uninstall.sh" | bash -s -- "$@"
  exit $?
fi
for a in "$@"; do
  case "$a" in
    --no-start) START=0 ;;
    *) die "unknown option: $a" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[ "$(uname -s)" = "Linux" ] || die "Linux only"
case "$(uname -m)" in
  aarch64|arm64) ARCH="arm64 (Raspberry Pi 5 / ARM)" ;;
  x86_64|amd64) ARCH="x86-64" ;;
  armv7l|armv6l) ARCH="32-bit ARM (works, but Algorand recommends a 64-bit OS)" ;;
  *) ARCH="$(uname -m) (untested)" ;;
esac
say "NodeLink agent installer — $ARCH"

PY=/usr/bin/python3
[ -x "$PY" ] || die "python3 not found. Install it: sudo apt-get install -y python3"
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' || die "Python 3.9+ required (found $("$PY" -V))"

# --- fetch files (from this checkout if present, else GitHub raw) ---
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
for f in nodelink_agent.py nodelink-agent.service agent.example.ini; do
  if [ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/$f" ]; then
    cp "$SRC_DIR/$f" "$TMP/$f"
  else
    curl -fsSL "$REPO_RAW/$f" -o "$TMP/$f" || die "download failed: $REPO_RAW/$f (the repo is private until it is made public — see README for the manual method)"
  fi
done
"$PY" -m py_compile "$TMP/nodelink_agent.py" || die "downloaded agent does not compile"

# --- user ---
if ! id "$USER_NAME" >/dev/null 2>&1; then
  say "creating system user $USER_NAME (no login, no home)"
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$USER_NAME"
fi

# --- program ---
install -d -m 0755 "$PREFIX"
install -m 0644 "$TMP/nodelink_agent.py" "$PREFIX/nodelink_agent.py"
cat > "$BIN" <<WRAP
#!/bin/sh
exec $PY -S $PREFIX/nodelink_agent.py --config "\${NODELINK_AGENT_CONFIG:-$CONF_DIR/agent.ini}" "\$@"
WRAP
chmod 0755 "$BIN"

# --- config (never overwritten) ---
install -d -m 0700 -o "$USER_NAME" -g "$USER_NAME" "$CONF_DIR"
if [ ! -f "$CONF_DIR/agent.ini" ]; then
  sed "s|^data_dir = .*|data_dir = $DATA_DIR|" "$TMP/agent.example.ini" > "$CONF_DIR/agent.ini"
  say "wrote config template $CONF_DIR/agent.ini"
else
  say "keeping existing $CONF_DIR/agent.ini"
fi
chown "$USER_NAME:$USER_NAME" "$CONF_DIR/agent.ini"
chmod 0600 "$CONF_DIR/agent.ini"

# --- read access to the node (algod writes its token files 0644; add the group only if needed) ---
if [ -d "$DATA_DIR" ]; then
  if ! runuser -u "$USER_NAME" -- test -r "$DATA_DIR/algod.token" 2>/dev/null; then
    if getent group algorand >/dev/null; then
      warn "$USER_NAME cannot read $DATA_DIR/algod.token — adding it to group 'algorand' (read access)"
      usermod -aG algorand "$USER_NAME"
    else
      warn "$USER_NAME cannot read $DATA_DIR/algod.token; fix permissions or set token_file in the config"
    fi
  fi
else
  warn "$DATA_DIR not found — is the node installed (nodekit bootstrap)? Set [node] data_dir in $CONF_DIR/agent.ini"
fi
# Raspberry Pi: vcgencmd get_throttled needs /dev/vchiq (group 'video')
if command -v vcgencmd >/dev/null 2>&1 && getent group video >/dev/null; then
  usermod -aG video "$USER_NAME"
fi

# --- systemd ---
if [ -d /run/systemd/system ] && command -v systemctl >/dev/null; then
  install -m 0644 "$TMP/nodelink-agent.service" "$UNIT"
  systemctl daemon-reload
  systemctl enable nodelink-agent.service >/dev/null 2>&1
  if [ "$START" = 1 ]; then systemctl restart nodelink-agent.service; say "service started"; fi
else
  warn "systemd not detected — installed the program only. Run: $BIN run"
fi

say "installed. Next:"
cat <<NEXT
   1. sudo nano $CONF_DIR/agent.ini      # add Telegram bot_token + chat_id and/or Discord webhook_url
   2. sudo systemctl restart nodelink-agent
   3. sudo nodelink-agent test-alert     # sends one test message to your channels
   4. sudo nodelink-agent status         # one-shot node status
   Logs: journalctl -u nodelink-agent -f      Uninstall: sudo bash install.sh --uninstall
NEXT
echo
"$BIN" status || warn "the node has active alerts (listed above) — they will be sent once a channel is configured"
