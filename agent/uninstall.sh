#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Julian van der Welle
# Remove the NodeLink agent.  sudo bash uninstall.sh [--purge]   (--purge also deletes config + user)
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
PURGE=0; [ "${1:-}" = "--purge" ] && PURGE=1
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
  systemctl disable --now nodelink-agent.service 2>/dev/null || true
  rm -f /etc/systemd/system/nodelink-agent.service
  systemctl daemon-reload
fi
rm -rf /opt/nodelink-agent /var/lib/nodelink-agent
rm -f /usr/local/bin/nodelink-agent
if [ "$PURGE" = 1 ]; then
  rm -rf /etc/nodelink-agent
  id nodelink-agent >/dev/null 2>&1 && userdel nodelink-agent || true
  echo "NodeLink agent removed (config and user deleted)."
else
  echo "NodeLink agent removed. Config kept at /etc/nodelink-agent (use --purge to delete it)."
fi
