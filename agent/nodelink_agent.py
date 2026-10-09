#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Julian van der Welle
"""
NodeLink agent: a tiny, read-only watchdog for NodeKit-installed Algorand nodes.

* Python 3.9+ standard library only. One file. No pip.
* Reads the LOCAL algod REST API (localhost) with the token from the data directory;
  falls back to `goal node status` only when REST is unreachable.
* Sends alerts only to YOUR Telegram bot / Discord webhook. Optional low-frequency reads from
  Nodely's public API for a reference round. Nothing else leaves the machine.

Usage:  nodelink-agent [--config PATH] {status,test-alert,run,check-config}
"""
from __future__ import annotations

import argparse
import configparser
import json
import logging
import os
import random
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import time
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple

VERSION = "0.1.0"
DEFAULT_CONFIG = "/etc/nodelink-agent/agent.ini"
SECONDS_PER_ROUND = 2.8
USER_AGENT = f"nodelink-agent/{VERSION}"
log = logging.getLogger("nodelink-agent")

# Public reference endpoints (Nodely free tier), chosen by the node's genesis id.
REFERENCE = {
    "mainnet-v1.0": ("https://mainnet-api.4160.nodely.dev", "https://mainnet-idx.4160.nodely.dev"),
    "testnet-v1.0": ("https://testnet-api.4160.nodely.dev", "https://testnet-idx.4160.nodely.dev"),
}

# --------------------------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------------------------

DEFAULTS: Dict[str, Dict[str, str]] = {
    "node": {
        # NodeKit (`nodekit bootstrap`) only supports this data dir; algod.net / algod.token live here.
        "data_dir": "/var/lib/algorand",
        "algod_url": "",          # override; default: read <data_dir>/algod.net (port can change on restart)
        "token_file": "",         # override; default: <data_dir>/algod.token
        "use_admin_token": "auto",  # auto|yes|no — admin token is used ONLY for GET /v2/participation
        "goal_path": "goal",
        "accounts": "",           # comma-separated; empty = auto-detect from keys installed on this node
    },
    "agent": {
        "node_name": "",          # default: hostname
        "poll_interval": "30",
        "state_file": "/var/lib/nodelink-agent/state.json",
        "log_level": "info",
        "isolate_tls": "yes",     # do HTTPS (Nodely/Telegram/Discord) in a short-lived child process
    },
    "reference": {
        "enabled": "yes",         # compare against a public round from Nodely
        "interval": "300",        # seconds between reference reads (60 while out of sync)
        "algod_url": "",          # default by genesis id (Nodely)
        "indexer_url": "",
        "proposals": "yes",       # daily summary: count blocks proposed in 24h (1 indexer read/account/day)
    },
    "thresholds": {
        "lag_rounds": "20",
        "lag_clear_rounds": "5",
        "stall_seconds": "60",
        "stall_clear_seconds": "15",
        "partkey_warn_days": "7",
        "partkey_crit_days": "1",
        "temp_warn_c": "75",
        "temp_warn_clear_c": "70",
        "temp_crit_c": "80",
        "temp_crit_clear_c": "77",
        "disk_warn_pct": "10",
        "disk_crit_pct": "5",
        "disk_warn_gb": "20",
        "disk_crit_gb": "5",
        "disk_clear_margin_pct": "2",
        "debounce_polls": "2",
        "renotify_hours": "12",
    },
    "alerts": {
        "alert_on_startup": "yes",
        "daily_summary": "yes",
        "daily_summary_hour": "9",
    },
    "telegram": {"bot_token": "", "chat_id": "", "api_base": "https://api.telegram.org"},
    "discord": {"webhook_url": ""},
    "system": {"thermal_root": "/sys/class/thermal", "proc_root": "/proc", "vcgencmd": "vcgencmd", "throttle_check_interval": "300"},
}

SECRET_KEYS = (("telegram", "bot_token"), ("discord", "webhook_url"))


class Config:
    def __init__(self, path: Optional[str]):
        self.path = path
        self.cp = configparser.ConfigParser(interpolation=None)
        self.cp.read_dict(DEFAULTS)
        self.warnings: List[str] = []
        if path:
            if not os.path.exists(path):
                raise SystemExit(f"config not found: {path}")
            self.cp.read(path)
            mode = stat.S_IMODE(os.stat(path).st_mode)
            if mode & 0o077 and self.has_secrets():
                self.warnings.append(f"{path} is readable by other users (mode {oct(mode)}); run: chmod 600 {path}")

    def get(self, section: str, key: str) -> str:
        return self.cp.get(section, key, fallback=DEFAULTS.get(section, {}).get(key, "")).strip()

    def num(self, section: str, key: str) -> float:
        return float(self.get(section, key))

    def flag(self, section: str, key: str) -> bool:
        return self.get(section, key).lower() in ("1", "yes", "true", "on")

    def has_secrets(self) -> bool:
        return any(self.cp.get(s, k, fallback="").strip() for s, k in SECRET_KEYS)

    def secrets(self) -> List[str]:
        out = [self.cp.get(s, k, fallback="").strip() for s, k in SECRET_KEYS]
        return [x for x in out if len(x) >= 6]

    @property
    def node_name(self) -> str:
        return self.get("agent", "node_name") or socket.gethostname()

    @property
    def accounts(self) -> List[str]:
        return [a.strip() for a in self.get("node", "accounts").split(",") if a.strip()]


class RedactFilter(logging.Filter):
    """Never let a bot token / webhook URL reach the journal."""

    def __init__(self, secrets: List[str]):
        super().__init__()
        self.secrets = secrets

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        for s in self.secrets:
            msg = msg.replace(s, "***")
        msg = re.sub(r"bot\d+:[A-Za-z0-9_-]{20,}", "bot***", msg)
        msg = re.sub(r"discord(app)?\.com/api/webhooks/\S+", "discord.com/api/webhooks/***", msg)
        record.msg, record.args = msg, None
        return True


# --------------------------------------------------------------------------------------------
# HTTP (stdlib)
# --------------------------------------------------------------------------------------------

class HttpError(Exception):
    def __init__(self, status: int, body: str = "", retry_after: Optional[float] = None):
        super().__init__(f"HTTP {status}")
        self.status, self.body, self.retry_after = status, body, retry_after


def _retry_after(v: Optional[str]) -> Optional[float]:
    return float(v) if v and v.replace(".", "", 1).isdigit() else None


def local_get(base: str, path: str, headers: Dict[str, str], timeout: float = 5.0) -> Any:
    """Minimal HTTP/1.1 GET over a plain socket for the localhost algod.
    Avoids importing http.client/urllib/ssl in the always-on path (keeps the daemon at ~12 MB RSS)."""
    m = re.match(r"^http://(\[[^\]]+\]|[^:/]+)(?::(\d+))?$", base)
    if not m:
        raise ValueError(f"unsupported algod url {base!r} (expected http://host:port)")
    host, port = m.group(1).strip("[]"), int(m.group(2) or 80)
    lines = [f"GET {path} HTTP/1.1", f"Host: {host}:{port}", f"User-Agent: {USER_AGENT}", "Accept: application/json", "Connection: close"]
    lines += [f"{k}: {v}" for k, v in headers.items()]
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
        chunks = []
        while True:
            b = sock.recv(65536)
            if not b:
                break
            chunks.append(b)
    raw = b"".join(chunks)
    head, _, body = raw.partition(b"\r\n\r\n")
    hl = head.decode("latin-1").split("\r\n")
    try:
        status = int(hl[0].split()[1])
    except (IndexError, ValueError):
        raise ConnectionError("bad HTTP response") from None
    hdr = {k.strip().lower(): v.strip() for k, _, v in (h.partition(":") for h in hl[1:])}
    if hdr.get("transfer-encoding", "").lower() == "chunked":
        out, rest = b"", body
        while rest:
            size_s, _, rest = rest.partition(b"\r\n")
            size = int(size_s.split(b";")[0] or b"0", 16)
            if size == 0:
                break
            out, rest = out + rest[:size], rest[size + 2 :]
        body = out
    if status >= 400:
        raise HttpError(status, body[:2000].decode("utf-8", "replace"), _retry_after(hdr.get("retry-after")))
    return json.loads(body) if body.strip() else None


# In the long-running daemon, remote HTTPS calls run in a short-lived child process so OpenSSL and
# the CA store (~15 MB) never stay resident. Secrets go to the child on stdin, never on argv.
ISOLATE_TLS = False


def http_json(url: str, *, headers: Optional[Dict[str, str]] = None, data: Any = None, timeout: float = 8.0) -> Any:
    if ISOLATE_TLS:
        return _http_json_child(url, headers, data, timeout)
    return _http_json_inproc(url, headers, data, timeout)


def _http_json_child(url: str, headers: Optional[Dict[str, str]], data: Any, timeout: float) -> Any:
    req = json.dumps({"url": url, "headers": headers or {}, "data": data, "timeout": timeout})
    try:
        p = subprocess.run([sys.executable, "-S", os.path.abspath(__file__), "_https"], input=req, capture_output=True, text=True, timeout=timeout + 10)
    except subprocess.TimeoutExpired:
        raise TimeoutError("remote request timed out") from None
    try:
        res = json.loads(p.stdout)
    except ValueError:
        raise ConnectionError("https helper failed") from None
    if res.get("error") == "http":
        raise HttpError(res["status"], res.get("body", ""), res.get("retry_after"))
    if res.get("error"):
        raise ConnectionError(res["error"])
    return res.get("json")


def _https_helper() -> int:
    """Child side of _http_json_child: one request, JSON in on stdin, JSON out on stdout."""
    req = json.loads(sys.stdin.read())
    try:
        out = {"json": _http_json_inproc(req["url"], req["headers"], req["data"], req["timeout"])}
    except HttpError as e:
        out = {"error": "http", "status": e.status, "body": e.body, "retry_after": e.retry_after}
    except Exception as e:  # noqa: BLE001
        out = {"error": type(e).__name__}
    sys.stdout.write(json.dumps(out))
    return 0


def _http_json_inproc(url: str, headers: Optional[Dict[str, str]], data: Any, timeout: float) -> Any:
    """HTTPS for the rare remote calls (Nodely reference, Telegram, Discord); urllib/ssl load lazily."""
    import urllib.error
    import urllib.request

    body = None
    h = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    h.update(headers or {})
    if data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=h, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as r:
            raw = r.read()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        text = e.read(2000).decode("utf-8", "replace") if e.fp else ""
        raise HttpError(e.code, text, _retry_after(e.headers.get("Retry-After") if e.headers else None)) from None


_SSL: Any = None


def _ssl_context() -> Any:
    """One shared TLS context (loading the CA store per request would cost ~4 MB each time)."""
    global _SSL
    if _SSL is None:
        import ssl

        _SSL = ssl.create_default_context()
    return _SSL


# --------------------------------------------------------------------------------------------
# local algod
# --------------------------------------------------------------------------------------------


def read_text(path: str) -> Optional[str]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return None


class LocalAlgod:
    """REST client for the algod on this machine. Same discovery as NodeKit:
    endpoint from <data>/algod.net (0.0.0.0/[::] -> 127.0.0.1), token from <data>/algod.token."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.data_dir = cfg.get("node", "data_dir")
        self._url: Optional[str] = None
        self._token: Optional[str] = None
        self._admin: Optional[str] = None
        self.admin_mode = cfg.get("node", "use_admin_token").lower()

    def url(self, refresh: bool = False) -> Optional[str]:
        if self.cfg.get("node", "algod_url"):
            return self.cfg.get("node", "algod_url").rstrip("/")
        if refresh or self._url is None:
            net = read_text(os.path.join(self.data_dir, "algod.net"))
            if not net:
                self._url = None
            else:
                net = net.replace("0.0.0.0", "127.0.0.1", 1).replace("[::]", "127.0.0.1", 1)
                self._url = net if net.startswith("http") else f"http://{net}"
        return self._url

    def token(self, refresh: bool = False) -> str:
        if refresh or self._token is None:
            path = self.cfg.get("node", "token_file") or os.path.join(self.data_dir, "algod.token")
            self._token = read_text(path) or ""
        return self._token

    def admin_token(self) -> Optional[str]:
        if self.admin_mode == "no":
            return None
        if self._admin is None:
            self._admin = read_text(os.path.join(self.data_dir, "algod.admin.token")) or ""
        return self._admin or None

    def get(self, path: str, admin: bool = False, timeout: float = 5.0) -> Any:
        for attempt in (0, 1):
            base = self.url(refresh=attempt == 1)
            if not base:
                raise ConnectionError("algod.net not found (is algod running?)")
            tok = self.admin_token() if admin else self.token(refresh=attempt == 1)
            try:
                if base.startswith("https://"):
                    return http_json(base + path, headers={"X-Algo-API-Token": tok or ""}, timeout=timeout)
                return local_get(base, path, {"X-Algo-API-Token": tok or ""}, timeout=timeout)
            except HttpError as e:
                if e.status == 401 and attempt == 0:
                    continue  # token rotated: re-read files once
                raise
            except (OSError, ValueError):
                if attempt == 0 and not self.cfg.get("node", "algod_url"):
                    continue  # algod restarted on a new port: re-read algod.net once
                raise
        raise ConnectionError("unreachable")

    def pid_alive(self) -> Tuple[Optional[int], bool, Optional[float]]:
        """(pid, alive, rss_mb) from <data>/algod.pid + /proc."""
        proc = self.cfg.get("system", "proc_root")
        pid_s = read_text(os.path.join(self.data_dir, "algod.pid"))
        if not pid_s or not pid_s.isdigit():
            return None, False, None
        pid = int(pid_s)
        comm = read_text(os.path.join(proc, str(pid), "comm"))
        if comm is None:
            return pid, False, None
        rss = None
        st = read_text(os.path.join(proc, str(pid), "status")) or ""
        m = re.search(r"VmRSS:\s+(\d+)\s+kB", st)
        if m:
            rss = int(m.group(1)) / 1024
        return pid, comm.startswith("algod"), rss

    def goal_status(self) -> Optional[Dict[str, Any]]:
        """Fallback only: parse `goal node status` (spawns a process; not used while REST works)."""
        goal = shutil.which(self.cfg.get("node", "goal_path"))
        if not goal:
            return None
        try:
            out = subprocess.run([goal, "node", "status", "-d", self.data_dir], capture_output=True, text=True, timeout=15).stdout
        except (OSError, subprocess.SubprocessError):
            return None
        return parse_goal_status(out)


def _dur(s: str) -> Optional[float]:
    """'1.234s' / '2m3.5s' / '1h2m3s' / '0s' -> seconds."""
    total, found = 0.0, False
    for v, u in re.findall(r"([\d.]+)(h|ms|m|s)", s):
        found = True
        total += float(v) * {"h": 3600, "m": 60, "s": 1, "ms": 0.001}[u]
    return total if found else None


def parse_goal_status(out: str) -> Optional[Dict[str, Any]]:
    kv = {}
    for line in out.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            kv[k.strip().lower()] = v.strip()
    if "last committed block" not in kv:
        return None
    return {
        "last-round": int(kv["last committed block"]),
        "time-since-last-round": int((_dur(kv.get("time since last block", "0s")) or 0) * 1e9),
        "catchup-time": int((_dur(kv.get("sync time", "0s")) or 0) * 1e9),
        "catchpoint": kv.get("catchpoint", ""),
        "genesis-id": kv.get("genesis id"),
    }


# --------------------------------------------------------------------------------------------
# system metrics (all /proc and /sys reads; vcgencmd only every few minutes, only if present)
# --------------------------------------------------------------------------------------------


def read_temperature(root: str) -> Tuple[Optional[float], Optional[str]]:
    best: Tuple[Optional[float], Optional[str]] = (None, None)
    try:
        zones = sorted(z for z in os.listdir(root) if z.startswith("thermal_zone"))
    except OSError:
        return best
    for z in zones:
        raw = read_text(os.path.join(root, z, "temp"))
        if not raw or not raw.lstrip("-").isdigit():
            continue
        t = int(raw) / 1000.0
        kind = read_text(os.path.join(root, z, "type")) or z
        cpuish = any(k in kind.lower() for k in ("cpu", "x86_pkg", "soc", "k10temp", "coretemp"))
        if best[0] is None or cpuish and not _cpuish(best[1]) or (cpuish == _cpuish(best[1]) and t > best[0]):
            best = (t, kind)
    return best


def _cpuish(kind: Optional[str]) -> bool:
    return bool(kind) and any(k in kind.lower() for k in ("cpu", "x86_pkg", "soc", "k10temp", "coretemp"))  # type: ignore[union-attr]


THROTTLE_BITS = {0: "under-voltage now", 1: "ARM frequency capped now", 2: "throttled now", 3: "soft temperature limit now"}


def read_throttled(vcgencmd: str) -> Optional[int]:
    exe = shutil.which(vcgencmd)
    if not exe:
        return None
    try:
        out = subprocess.run([exe, "get_throttled"], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    m = re.search(r"throttled=(0x[0-9a-fA-F]+)", out)
    return int(m.group(1), 16) if m else None


def read_system(cfg: Config, data_dir: str) -> Dict[str, Any]:
    proc = cfg.get("system", "proc_root")
    s: Dict[str, Any] = {}
    la = (read_text(os.path.join(proc, "loadavg")) or "").split()
    if len(la) >= 3:
        s["load1"], s["load5"], s["load15"] = (float(x) for x in la[:3])
    s["cpus"] = os.cpu_count() or 1
    mem: Dict[str, int] = {}
    for line in (read_text(os.path.join(proc, "meminfo")) or "").splitlines():
        p = line.split()
        if len(p) >= 2 and p[1].isdigit():
            mem[p[0].rstrip(":")] = int(p[1]) * 1024
    if "MemTotal" in mem:
        s["mem_total"], s["mem_available"] = mem["MemTotal"], mem.get("MemAvailable", mem.get("MemFree", 0))
    try:
        st = os.statvfs(data_dir)
        s["disk_total"], s["disk_free"] = st.f_blocks * st.f_frsize, st.f_bavail * st.f_frsize
    except OSError:
        pass
    s["temp_c"], s["temp_zone"] = read_temperature(cfg.get("system", "thermal_root"))
    return s


# --------------------------------------------------------------------------------------------
# collector
# --------------------------------------------------------------------------------------------


def short(addr: str) -> str:
    return f"{addr[:6]}…{addr[-4:]}" if len(addr) > 12 else addr


def human_secs(s: Optional[float]) -> str:
    if s is None:
        return "?"
    s = max(0, int(s))
    if s >= 86400:
        return f"{s // 86400}d {s % 86400 // 3600}h"
    if s >= 3600:
        return f"{s // 3600}h {s % 3600 // 60}m"
    if s >= 60:
        return f"{s // 60}m {s % 60}s"
    return f"{s}s"


class Collector:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.algod = LocalAlgod(cfg)
        self.genesis_id: Optional[str] = None
        self.ref: Dict[str, Any] = {}  # round, at, lag, error
        self.throttle_at = 0.0
        self.throttled: Optional[int] = None

    def _genesis(self) -> Optional[str]:
        if self.genesis_id is None:
            try:
                with open(os.path.join(self.algod.data_dir, "genesis.json"), encoding="utf-8") as f:
                    g = json.load(f)
                self.genesis_id = f"{g.get('network')}-{g.get('id')}"
            except (OSError, ValueError):
                pass
        return self.genesis_id

    def ref_urls(self) -> Tuple[Optional[str], Optional[str]]:
        a, i = self.cfg.get("reference", "algod_url"), self.cfg.get("reference", "indexer_url")
        d = REFERENCE.get(self._genesis() or "", (None, None))
        return (a or d[0]), (i or d[1])

    def collect(self, force_reference: bool = False) -> Dict[str, Any]:
        now = time.time()
        snap: Dict[str, Any] = {"ts": now, "node": self.cfg.node_name, "errors": [], "accounts": []}
        pid, alive, rss = self.algod.pid_alive()
        snap.update(algod_pid=pid, algod_process=alive, algod_rss_mb=rss)

        status = None
        try:
            status = self.algod.get("/v2/status")
            snap["source"] = "rest"
        except Exception as e:  # noqa: BLE001 — any failure means "fall back"
            snap["errors"].append(f"algod REST: {type(e).__name__}: {e}")
            status = self.algod.goal_status()
            snap["source"] = "goal" if status else None
        snap["algod_up"] = status is not None
        snap["genesis_id"] = self._genesis() or (status or {}).get("genesis-id")
        if status:
            snap["last_round"] = int(status.get("last-round", 0))
            snap["time_since_last_round"] = int(status.get("time-since-last-round", 0)) / 1e9
            snap["catchup_time"] = int(status.get("catchup-time", 0)) / 1e9
            snap["catchpoint"] = status.get("catchpoint") or ""
            snap["catching_up"] = snap["catchup_time"] > 0 or bool(snap["catchpoint"])
        if snap["source"] == "rest":
            try:
                v = self.algod.get("/versions")
                b = (v or {}).get("build", {})
                snap["version"] = f"{b.get('major')}.{b.get('minor')}.{b.get('build_number')}" if b else None
            except Exception:  # noqa: BLE001
                pass
            self._accounts(snap)
        self._reference(snap, force_reference)
        snap["system"] = read_system(self.cfg, self.algod.data_dir)
        tci = self.cfg.num("system", "throttle_check_interval")
        if force_reference or now - self.throttle_at >= tci:
            self.throttle_at = now
            self.throttled = read_throttled(self.cfg.get("system", "vcgencmd"))
        snap["system"]["throttled"] = self.throttled
        return snap

    def _accounts(self, snap: Dict[str, Any]) -> None:
        keys: Optional[List[Dict[str, Any]]] = None
        if self.algod.admin_token():
            try:
                keys = self.algod.get("/v2/participation", admin=True) or []
            except HttpError as e:
                if e.status == 404:
                    keys = []  # algod returns 404 when no keys are installed
                else:
                    snap["errors"].append(f"participation keys: HTTP {e.status}")
            except Exception as e:  # noqa: BLE001
                snap["errors"].append(f"participation keys: {type(e).__name__}")
        snap["partkeys_known"] = keys is not None
        snap["partkeys"] = [
            {"address": k.get("address"), "vote_last_valid": (k.get("key") or {}).get("vote-last-valid"), "vote_key": (k.get("key") or {}).get("vote-participation-key")}
            for k in (keys or [])
        ]
        accounts = self.cfg.accounts or sorted({k["address"] for k in snap["partkeys"] if k.get("address")})
        rnd = snap.get("last_round", 0)
        for addr in accounts:
            try:
                a = self.algod.get(f"/v2/accounts/{addr}?exclude=all")
            except Exception as e:  # noqa: BLE001
                snap["errors"].append(f"account {short(addr)}: {e}")
                continue
            part = a.get("participation") or {}
            vlv = part.get("vote-last-valid")
            on_node: Optional[bool] = None
            if keys is not None and part.get("vote-participation-key"):
                on_node = any(k["address"] == addr and k["vote_key"] == part["vote-participation-key"] for k in snap["partkeys"])
            left = (vlv - rnd) if vlv is not None and rnd else None
            snap["accounts"].append(
                {
                    "address": addr,
                    "status": a.get("status"),
                    "incentive_eligible": bool(a.get("incentive-eligible")),
                    "balance": a.get("amount", 0),
                    "last_proposed": a.get("last-proposed"),
                    "last_heartbeat": a.get("last-heartbeat"),
                    "vote_last_valid": vlv,
                    "rounds_left": left,
                    "seconds_left": left * SECONDS_PER_ROUND if left is not None else None,
                    "key_on_node": on_node,
                }
            )

    def _reference(self, snap: Dict[str, Any], force: bool) -> None:
        if not self.cfg.flag("reference", "enabled"):
            return
        url, _ = self.ref_urls()
        if not url:
            return
        interval = self.cfg.num("reference", "interval")
        if self.ref.get("lag", 0) and self.ref.get("lag", 0) > self.cfg.num("thresholds", "lag_clear_rounds"):
            interval = min(interval, 60)  # recover quickly once we know we are behind
        now = time.time()
        if force or now - self.ref.get("at", 0) >= interval:
            self.ref["at"] = now
            try:
                r = http_json(url + "/v2/status", timeout=8)
                self.ref.update(round=int(r["last-round"]), error=None)
                if "last_round" in snap:
                    self.ref["lag"] = max(0, self.ref["round"] - snap["last_round"])
            except Exception as e:  # noqa: BLE001
                self.ref["error"] = f"{type(e).__name__}"
        snap["ref_round"] = self.ref.get("round")
        snap["ref_age"] = now - self.ref["at"] if self.ref.get("at") else None
        snap["lag_rounds"] = self.ref.get("lag")
        snap["ref_error"] = self.ref.get("error")

    def proposals_24h(self, addr: str) -> Optional[int]:
        _, idx = self.ref_urls()
        if not idx or not self.cfg.flag("reference", "proposals") or not self.ref.get("round"):
            return None
        lo = self.ref["round"] - int(86400 / SECONDS_PER_ROUND)
        try:
            r = http_json(f"{idx}/v2/block-headers?proposers={addr}&min-round={lo}&limit=1000", timeout=15)
            return len(r.get("blocks") or [])
        except Exception:  # noqa: BLE001
            return None


# --------------------------------------------------------------------------------------------
# alert rules + state machine
# --------------------------------------------------------------------------------------------

LEVEL_NAME = {0: "ok", 1: "warning", 2: "critical", 3: "critical"}
ICON = {0: "✅", 1: "🟠", 2: "🔴", 3: "🔴"}


class Rule:
    """A rule maps a snapshot to a level (0 = ok). `fn(snap, committed_level)` lets rules apply
    hysteresis (different thresholds to clear than to fire)."""

    def __init__(self, key: str, fn: Callable[[Dict[str, Any], int], Tuple[int, str, str]], debounce: int, recover_title: str):
        self.key, self.fn, self.debounce, self.recover_title = key, fn, debounce, recover_title


def build_rules(cfg: Config, snap: Dict[str, Any]) -> List[Rule]:
    th = lambda k: cfg.num("thresholds", k)  # noqa: E731
    db = int(th("debounce_polls"))
    rules: List[Rule] = []

    def algod_down(s: Dict[str, Any], _c: int) -> Tuple[int, str, str]:
        if s.get("algod_up"):
            return 0, "", ""
        why = "process not running" if not s.get("algod_process") else "API not responding"
        return 2, "Node is DOWN (algod)", f"algod {why}. Check: sudo systemctl status algorand"

    rules.append(Rule("algod_down", algod_down, db, "Node is back UP (algod)"))

    def stalled(s: Dict[str, Any], c: int) -> Tuple[int, str, str]:
        if not s.get("algod_up") or s.get("catching_up"):
            return 0, "", ""
        t = s.get("time_since_last_round") or 0
        limit = th("stall_clear_seconds") if c else th("stall_seconds")
        if t > limit:
            return 2, "No new block", f"Last round {s.get('last_round')} was {human_secs(t)} ago."
        return 0, "", ""

    rules.append(Rule("stalled", stalled, db, "Blocks are flowing again"))

    def sync(s: Dict[str, Any], c: int) -> Tuple[int, str, str]:
        if not s.get("algod_up"):
            return 0, "", ""
        if s.get("catching_up"):
            what = f"fast catchup to {s['catchpoint']}" if s.get("catchpoint") else f"syncing for {human_secs(s.get('catchup_time'))}"
            return 2, "Node is out of sync", f"{what}; at round {s.get('last_round')}."
        lag = s.get("lag_rounds")
        if lag is None:
            return c, "", ""  # unknown: keep the current state
        limit = th("lag_clear_rounds") if c else th("lag_rounds")
        if lag > limit:
            return 2, "Node is out of sync", f"{lag} rounds behind the network (local {s.get('last_round')}, public {s.get('ref_round')})."
        return 0, "", ""

    rules.append(Rule("out_of_sync", sync, db, "Node is in sync"))

    # Stable account set: configured accounts, else those seen in this snapshot. An account that
    # could not be read this poll keeps its current state (rules return the committed level).
    addrs = cfg.accounts or [a["address"] for a in snap.get("accounts", [])]
    for addr in addrs:

        def offline(s: Dict[str, Any], _c: int, addr: str = addr) -> Tuple[int, str, str]:
            a = _acct(s, addr)
            if a is None:
                return _c, "", ""
            if a["status"] != "Online":
                return 2, f"Account went OFFLINE {short(addr)}", f"Status: {a['status']}. Not participating in consensus — register a key and go online (NodeKit: r)."
            return 0, "", ""

        rules.append(Rule(f"offline:{addr}", offline, 1, f"Account is ONLINE again {short(addr)}"))

        def incentive(s: Dict[str, Any], _c: int, addr: str = addr) -> Tuple[int, str, str]:
            a = _acct(s, addr)
            if a is None:
                return _c, "", ""
            if a["status"] == "Online" and not a["incentive_eligible"]:
                return 1, f"Not incentive eligible {short(addr)}", "Proposer payouts need a 2 ALGO keyreg fee when going online (and 30k–70M ALGO)."
            return 0, "", ""

        rules.append(Rule(f"incentive:{addr}", incentive, 1, f"Incentive eligible again {short(addr)}"))

        def partkey(s: Dict[str, Any], _c: int, addr: str = addr) -> Tuple[int, str, str]:
            a = _acct(s, addr)
            if a is None:
                return _c, "", ""
            if a["vote_last_valid"] is None or a["rounds_left"] is None:
                return 0, "", ""  # offline rule covers "no key registered"
            left = a["seconds_left"]
            if a["rounds_left"] <= 0:
                return 3, f"Participation key EXPIRED {short(addr)}", f"Key ended at round {a['vote_last_valid']}. Generate a new key (NodeKit: g) and register it (r)."
            if a.get("key_on_node") is False:
                return 3, f"Registered key is NOT on this node {short(addr)}", "The key registered on-chain is not installed here, so this node cannot vote for the account."
            if left < th("partkey_crit_days") * 86400:
                return 2, f"Participation key expires in < {th('partkey_crit_days'):g} day {short(addr)}", f"~{human_secs(left)} left (round {a['vote_last_valid']}). Renew now: NodeKit g, then r."
            if left < th("partkey_warn_days") * 86400:
                return 1, f"Participation key expires in < {th('partkey_warn_days'):g} days {short(addr)}", f"~{human_secs(left)} left (round {a['vote_last_valid']}). Plan a renewal."
            return 0, "", ""

        rules.append(Rule(f"partkey:{addr}", partkey, 1, f"Participation key OK {short(addr)}"))

    def temp(s: Dict[str, Any], c: int) -> Tuple[int, str, str]:
        t = (s.get("system") or {}).get("temp_c")
        if t is None:
            return 0, "", ""
        crit = th("temp_crit_clear_c") if c >= 2 else th("temp_crit_c")
        warn = th("temp_warn_clear_c") if c >= 1 else th("temp_warn_c")
        if t >= crit:
            return 2, "CPU temperature critical", f"{t:.1f} °C (limit {th('temp_crit_c'):g} °C). A Raspberry Pi starts throttling at 80 °C (hard limit 85 °C) — check the cooler."
        if t >= warn:
            return 1, "CPU temperature high", f"{t:.1f} °C (warning at {th('temp_warn_c'):g} °C)."
        return 0, "", ""

    rules.append(Rule("temperature", temp, max(db, 3), "CPU temperature normal"))

    def throttle(s: Dict[str, Any], _c: int) -> Tuple[int, str, str]:
        f = (s.get("system") or {}).get("throttled")
        if not f or not (f & 0xF):
            return 0, "", ""
        what = ", ".join(v for b, v in THROTTLE_BITS.items() if f & (1 << b))
        return 1, "Raspberry Pi is throttling", f"{what} (get_throttled={hex(f)}). Check the power supply (27 W for Pi 5) and cooling."

    rules.append(Rule("throttling", throttle, db, "Throttling cleared"))

    def disk(s: Dict[str, Any], c: int) -> Tuple[int, str, str]:
        sy = s.get("system") or {}
        tot, free = sy.get("disk_total"), sy.get("disk_free")
        if not tot or free is None:
            return 0, "", ""
        pct, gb = free / tot * 100, free / 1e9
        m = th("disk_clear_margin_pct") if c else 0
        detail = f"{gb:.1f} GB free ({pct:.1f}%) on the algod data disk."
        if pct < th("disk_crit_pct") + (m if c >= 2 else 0) or gb < th("disk_crit_gb"):
            return 2, "Disk almost full", detail
        if pct < th("disk_warn_pct") + m or gb < th("disk_warn_gb"):
            return 1, "Disk space low", detail
        return 0, "", ""

    rules.append(Rule("disk", disk, db, "Disk space OK"))
    return rules


def _acct(s: Dict[str, Any], addr: str) -> Optional[Dict[str, Any]]:
    for a in s.get("accounts", []):
        if a["address"] == addr:
            return a
    return None


class Event:
    def __init__(self, kind: str, key: str, level: int, title: str, detail: str):
        self.kind, self.key, self.level, self.title, self.detail = kind, key, level, title, detail

    def text(self, node: str) -> str:
        icon = ICON[0] if self.kind == "recover" else ICON.get(self.level, "🔵")
        prefix = {"remind": "Still: ", "deescalate": "Improved: "}.get(self.kind, "")
        body = f"{icon} [{node}] {prefix}{self.title}"
        return body + (f"\n{self.detail}" if self.detail else "")

    def __repr__(self) -> str:
        return f"Event({self.kind},{self.key},{self.level})"


class AlertEngine:
    """Strict state-change alerting.
    - A new level must be observed `debounce` consecutive polls before it is committed.
    - Rules apply hysteresis using the committed level (e.g. fire at 75 °C, clear below 70 °C).
    - Committing a higher level -> 'fire' (from 0) or 'escalate'; lower non-zero -> 'deescalate';
      0 -> 'recover'. Nothing is sent while the level is unchanged, except an optional reminder
      for critical states every `renotify_hours`.
    - State persists across restarts, so a restart never re-sends or misses a recovery."""

    def __init__(self, renotify_s: float = 0, alert_on_startup: bool = True, state: Optional[Dict[str, Any]] = None):
        self.renotify_s = renotify_s
        self.alert_on_startup = alert_on_startup
        self.state: Dict[str, Any] = state if state is not None else {}
        self.state.setdefault("rules", {})

    def process(self, rules: List[Rule], snap: Dict[str, Any], now: Optional[float] = None, prune: bool = True) -> List[Event]:
        now = time.time() if now is None else now
        events: List[Event] = []
        first_run = not self.state.get("initialized")
        for r in rules:
            st = self.state["rules"].setdefault(r.key, {"level": 0, "pending": 0, "count": 0, "since": now, "notified": 0, "title": ""})
            level, title, detail = r.fn(snap, st["level"])
            if first_run and not self.alert_on_startup:
                st.update(level=level, pending=level, count=0, since=now, title=title)
                continue
            if level == st["level"]:
                st["pending"], st["count"] = level, 0
                if level >= 2 and self.renotify_s and now - st["notified"] >= self.renotify_s:
                    st["notified"] = now
                    events.append(Event("remind", r.key, level, title or st["title"], detail))
                continue
            if level != st["pending"]:
                st["pending"], st["count"] = level, 0
            st["count"] += 1
            if st["count"] < r.debounce:
                continue
            old = st["level"]
            st.update(level=level, count=0, since=now, notified=now)
            if level == 0:
                events.append(Event("recover", r.key, 0, r.recover_title, f"Resolved after {human_secs(now - st.get('fired_at', now))}."))
            elif old == 0:
                st["fired_at"] = now
                st["title"] = title
                events.append(Event("fire", r.key, level, title, detail))
            elif level > old:
                st["title"] = title
                events.append(Event("escalate", r.key, level, title, detail))
            else:
                st["title"] = title
                events.append(Event("deescalate", r.key, level, title, detail))
        # forget per-account rules for accounts no longer watched (send nothing) — but only when the
        # account list is trustworthy (algod reachable), never because the node was down.
        if prune:
            live = {r.key for r in rules}
            for k in [k for k in self.state["rules"] if k not in live and ":" in k]:
                del self.state["rules"][k]
        self.state["initialized"] = True
        return events

    def active(self) -> List[Tuple[str, int, str]]:
        return [(k, v["level"], v.get("title", "")) for k, v in self.state["rules"].items() if v["level"] > 0]


# --------------------------------------------------------------------------------------------
# notifications (your own Telegram bot / Discord webhook only)
# --------------------------------------------------------------------------------------------


class Channel:
    name = "channel"

    def send(self, text: str) -> None:
        raise NotImplementedError


class Telegram(Channel):
    name = "telegram"

    def __init__(self, token: str, chat_id: str, api_base: str):
        self.token, self.chat_id, self.base = token, chat_id, api_base.rstrip("/")

    def send(self, text: str) -> None:
        try:
            r = http_json(f"{self.base}/bot{self.token}/sendMessage", data={"chat_id": self.chat_id, "text": text[:4000], "disable_web_page_preview": True}, timeout=10)
        except HttpError as e:
            ra = e.retry_after
            try:
                ra = ra or float(json.loads(e.body).get("parameters", {}).get("retry_after"))
            except (ValueError, TypeError, AttributeError):
                pass
            raise HttpError(e.status, "", ra) from None
        if not (r or {}).get("ok"):
            raise HttpError(500, "telegram returned ok=false")


class Discord(Channel):
    name = "discord"

    def __init__(self, url: str):
        self.url = url

    def send(self, text: str) -> None:
        try:
            http_json(self.url, data={"content": text[:1990], "username": "NodeLink agent", "allowed_mentions": {"parse": []}}, timeout=10)
        except HttpError as e:
            ra = e.retry_after
            try:
                ra = ra or float(json.loads(e.body).get("retry_after"))
            except (ValueError, TypeError, AttributeError):
                pass
            raise HttpError(e.status, "", ra) from None


def channels_from(cfg: Config) -> List[Channel]:
    out: List[Channel] = []
    if cfg.get("telegram", "bot_token") and cfg.get("telegram", "chat_id"):
        out.append(Telegram(cfg.get("telegram", "bot_token"), cfg.get("telegram", "chat_id"), cfg.get("telegram", "api_base")))
    if cfg.get("discord", "webhook_url"):
        out.append(Discord(cfg.get("discord", "webhook_url")))
    return out


class Outbox:
    """Delivers each message to every channel; failed deliveries retry on later polls with backoff
    (honouring 429 retry_after). Bounded: 100 messages, dropped after 24 h."""

    def __init__(self, channels: List[Channel]):
        self.channels = channels
        self.queue: List[Dict[str, Any]] = []

    def put(self, text: str) -> None:
        for ch in self.channels:
            self.queue.append({"ch": ch, "text": text, "next": 0.0, "tries": 0, "created": time.time()})
        del self.queue[:-100]

    def flush(self, now: Optional[float] = None) -> Tuple[int, int]:
        now = time.time() if now is None else now
        sent = failed = 0
        keep: List[Dict[str, Any]] = []
        for m in self.queue:
            if now - m["created"] > 86400:
                continue
            if m["next"] > now:
                keep.append(m)
                continue
            try:
                m["ch"].send(m["text"])
                sent += 1
            except HttpError as e:
                failed += 1
                m["tries"] += 1
                if e.status in (400, 401, 403, 404):
                    log.error("%s rejected the message (HTTP %s) — check its settings; not retrying", m["ch"].name, e.status)
                    continue
                m["next"] = now + (e.retry_after or min(600, 15 * 2 ** m["tries"])) + random.uniform(0, 3)
                log.warning("%s send failed (HTTP %s); retry #%d later", m["ch"].name, e.status, m["tries"])
                keep.append(m)
            except Exception as e:  # noqa: BLE001
                failed += 1
                m["tries"] += 1
                m["next"] = now + min(600, 15 * 2 ** m["tries"]) + random.uniform(0, 3)
                log.warning("%s send failed (%s); retry #%d later", m["ch"].name, type(e).__name__, m["tries"])
                keep.append(m)
        self.queue = keep
        return sent, failed


# --------------------------------------------------------------------------------------------
# formatting
# --------------------------------------------------------------------------------------------


def fmt_bytes(n: Optional[float]) -> str:
    if n is None:
        return "?"
    for u in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or u == "TB":
            return f"{n:.1f} {u}" if u != "B" else f"{int(n)} B"
        n /= 1024
    return "?"


def render_status(snap: Dict[str, Any], active: List[Tuple[str, int, str]], color: bool = True) -> str:
    def c(code: str, s: str) -> str:
        return f"\033[{code}m{s}\033[0m" if color else s

    ok, warn, bad = (lambda s: c("32", s)), (lambda s: c("33", s)), (lambda s: c("31", s))
    L: List[str] = [c("1", f"NodeLink agent {VERSION} — {snap['node']}")]
    up = snap.get("algod_up")
    ver = snap.get("version") or "?"
    L.append(f"  algod        {ok('up') if up else bad('DOWN')}  v{ver}  pid {snap.get('algod_pid') or '?'}"
             + (f"  {snap['algod_rss_mb']:.0f} MB RSS" if snap.get("algod_rss_mb") else "") + f"  via {snap.get('source') or '-'}")
    L.append(f"  network      {snap.get('genesis_id') or '?'}")
    if up:
        sync = warn("catching up") if snap.get("catching_up") else ok("synced")
        lag = snap.get("lag_rounds")
        lagtxt = f"lag {lag} rounds vs Nodely ({human_secs(snap.get('ref_age'))} ago)" if lag is not None else ("reference: " + (snap.get("ref_error") or "off"))
        L.append(f"  sync         {sync}  round {snap.get('last_round')}  last block {snap.get('time_since_last_round', 0):.1f}s ago  {lagtxt}")
    for a in snap.get("accounts", []):
        st = ok("Online") if a["status"] == "Online" else bad(a["status"] or "?")
        inc = ok("incentive eligible") if a["incentive_eligible"] else warn("not incentive eligible")
        key = "no key" if a["vote_last_valid"] is None else f"key ends round {a['vote_last_valid']} (~{human_secs(a['seconds_left'])})"
        on = "" if a.get("key_on_node") is None else (ok(" on this node") if a["key_on_node"] else bad(" NOT on this node"))
        L.append(f"  account      {short(a['address'])}  {st}  {inc}  {a['balance'] / 1e6:,.0f} ALGO")
        L.append(f"               {key}{on}  last proposed {a['last_proposed'] or '-'}  heartbeat {a['last_heartbeat'] or '-'}")
    if up and not snap.get("accounts"):
        L.append("  account      " + warn("none (set [node] accounts, or install a key and enable the admin token)"))
    sy = snap.get("system", {})
    t = sy.get("temp_c")
    L.append(f"  temperature  {('%.1f °C' % t) if t is not None else '?'}  ({sy.get('temp_zone') or 'no sensor'})"
             + (f"  throttled={hex(sy['throttled'])}" if sy.get("throttled") is not None else ""))
    if "load1" in sy:
        L.append(f"  cpu load     {sy['load1']:.2f} {sy['load5']:.2f} {sy['load15']:.2f}  ({sy['cpus']} cores)")
    if "mem_total" in sy:
        L.append(f"  memory       {fmt_bytes(sy['mem_available'])} free of {fmt_bytes(sy['mem_total'])}")
    if sy.get("disk_total"):
        L.append(f"  disk         {fmt_bytes(sy['disk_free'])} free of {fmt_bytes(sy['disk_total'])} ({sy['disk_free'] / sy['disk_total'] * 100:.1f}%)")
    if active:
        L.append(c("1", "  alerts"))
        for k, lvl, title in active:
            L.append(f"    {(bad if lvl >= 2 else warn)(LEVEL_NAME[lvl])}  {title or k}")
    else:
        L.append(f"  alerts       {ok('none')}")
    for e in snap.get("errors", []):
        L.append(f"  note         {e}")
    return "\n".join(L)


def summary_text(snap: Dict[str, Any], proposals: Dict[str, Optional[int]]) -> str:
    L = [f"📊 [{snap['node']}] Daily node summary"]
    L.append(f"algod {'up' if snap.get('algod_up') else 'DOWN'} v{snap.get('version') or '?'} · round {snap.get('last_round', '?')}"
             + (f" · lag {snap['lag_rounds']}" if snap.get("lag_rounds") is not None else ""))
    for a in snap.get("accounts", []):
        p = proposals.get(a["address"])
        L.append(f"{short(a['address'])}: {a['status']}{', incentive eligible' if a['incentive_eligible'] else ''}; key ~{human_secs(a['seconds_left'])} left"
                 + (f"; {p} blocks proposed in 24h" if p is not None else ""))
    sy = snap.get("system", {})
    bits = []
    if sy.get("temp_c") is not None:
        bits.append(f"{sy['temp_c']:.0f} °C")
    if sy.get("disk_total"):
        bits.append(f"disk {sy['disk_free'] / sy['disk_total'] * 100:.0f}% free")
    if "load1" in sy:
        bits.append(f"load {sy['load1']:.2f}")
    if bits:
        L.append(" · ".join(bits))
    return "\n".join(L)


# --------------------------------------------------------------------------------------------
# state file
# --------------------------------------------------------------------------------------------


def load_state(path: str) -> Dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(path: str, state: Dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(tmp, path)
    except OSError as e:
        log.warning("cannot write state file: %s", e)


# --------------------------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------------------------


def setup_logging(cfg: Config) -> None:
    h = logging.StreamHandler(sys.stderr)
    h.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    h.addFilter(RedactFilter(cfg.secrets()))
    log.addHandler(h)
    log.setLevel(getattr(logging, cfg.get("agent", "log_level").upper(), logging.INFO))
    log.propagate = False
    for w in cfg.warnings:
        log.warning(w)


def cmd_status(cfg: Config, as_json: bool) -> int:
    col = Collector(cfg)
    snap = col.collect(force_reference=True)
    eng = AlertEngine(state=json.loads(json.dumps(load_state(cfg.get("agent", "state_file")))) or None)
    # show what is wrong right now (no debounce, nothing sent)
    active = []
    for r in build_rules(cfg, snap):
        lvl, title, _ = r.fn(snap, eng.state["rules"].get(r.key, {}).get("level", 0))
        if lvl:
            active.append((r.key, lvl, title))
    if as_json:
        print(json.dumps({"snapshot": snap, "alerts": active}, indent=2, default=str))
    else:
        print(render_status(snap, active, color=sys.stdout.isatty()))
    return 2 if any(l >= 2 for _, l, _ in active) else (1 if active else 0)


def cmd_test_alert(cfg: Config) -> int:
    chans = channels_from(cfg)
    if not chans:
        print("No channel configured. Set [telegram] bot_token + chat_id and/or [discord] webhook_url.")
        return 1
    rc = 0
    text = f"✅ [{cfg.node_name}] NodeLink agent test alert — notifications work."
    for ch in chans:
        try:
            ch.send(text)
            print(f"{ch.name}: sent")
        except HttpError as e:
            rc = 1
            print(f"{ch.name}: FAILED (HTTP {e.status})")
        except Exception as e:  # noqa: BLE001
            rc = 1
            print(f"{ch.name}: FAILED ({type(e).__name__})")
    return rc


def cmd_check_config(cfg: Config) -> int:
    print(f"config: {cfg.path}")
    for w in cfg.warnings:
        print(f"WARNING: {w}")
    print(f"data_dir: {cfg.get('node', 'data_dir')}  accounts: {', '.join(cfg.accounts) or '(auto)'}  poll: {cfg.get('agent', 'poll_interval')}s")
    chans = channels_from(cfg)
    print("channels: " + (", ".join(c.name for c in chans) or "none"))
    return 0


_stop = False


def _on_signal(_sig: int, _frame: Any) -> None:
    global _stop
    _stop = True


def cmd_run(cfg: Config, once: bool = False) -> int:
    global ISOLATE_TLS
    ISOLATE_TLS = cfg.flag("agent", "isolate_tls")
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)
    poll = max(5.0, cfg.num("agent", "poll_interval"))
    state_path = cfg.get("agent", "state_file")
    state = load_state(state_path)
    eng = AlertEngine(cfg.num("thresholds", "renotify_hours") * 3600, cfg.flag("alerts", "alert_on_startup"), state)
    col = Collector(cfg)
    out = Outbox(channels_from(cfg))
    if not out.channels:
        log.warning("no alert channel configured — alerts will only be logged")
    log.info("started: poll %ss, data dir %s, channels: %s", poll, col.algod.data_dir, ", ".join(c.name for c in out.channels) or "none")
    while not _stop:
        t0 = time.monotonic()
        try:
            snap = col.collect()
            trusted = snap.get("source") == "rest" and (bool(cfg.accounts) or bool(snap.get("partkeys_known")))
            for ev in eng.process(build_rules(cfg, snap), snap, prune=trusted):
                log.info("alert %s %s level=%d", ev.kind, ev.key, ev.level)
                out.put(ev.text(cfg.node_name))
            if cfg.flag("alerts", "daily_summary"):
                today = datetime.now().strftime("%Y-%m-%d")
                if datetime.now().hour >= int(cfg.num("alerts", "daily_summary_hour")) and state.get("summary_date") != today:
                    state["summary_date"] = today
                    props = {a["address"]: col.proposals_24h(a["address"]) for a in snap.get("accounts", [])}
                    out.put(summary_text(snap, props))
            out.flush()
            save_state(state_path, eng.state)
        except Exception as e:  # noqa: BLE001 — never die; systemd would restart anyway
            log.error("poll failed: %s: %s", type(e).__name__, e)
        if once:
            break
        delay = max(1.0, poll - (time.monotonic() - t0))
        end = time.monotonic() + delay
        while not _stop and time.monotonic() < end:
            time.sleep(min(1.0, end - time.monotonic()))
    save_state(state_path, eng.state)
    log.info("stopped")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    if (argv if argv is not None else sys.argv[1:]) == ["_https"]:
        return _https_helper()
    p = argparse.ArgumentParser(prog="nodelink-agent", description="Lightweight, read-only Algorand node watchdog with Telegram/Discord alerts.")
    p.add_argument("--config", default=os.environ.get("NODELINK_AGENT_CONFIG", DEFAULT_CONFIG))
    p.add_argument("--version", action="version", version=VERSION)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("status", help="one-shot status of this node")
    s.add_argument("--json", action="store_true")
    sub.add_parser("test-alert", help="send a test message to the configured channels")
    r = sub.add_parser("run", help="run the watchdog loop (systemd)")
    r.add_argument("--once", action="store_true", help=argparse.SUPPRESS)
    sub.add_parser("check-config", help="validate the config file (secrets are not printed)")
    a = p.parse_args(argv)
    cfg = Config(a.config if os.path.exists(a.config) or a.cmd in ("run", "test-alert") else None)
    setup_logging(cfg)
    if a.cmd == "status":
        return cmd_status(cfg, a.json)
    if a.cmd == "test-alert":
        return cmd_test_alert(cfg)
    if a.cmd == "check-config":
        return cmd_check_config(cfg)
    return cmd_run(cfg, once=a.once)


if __name__ == "__main__":
    sys.exit(main())
