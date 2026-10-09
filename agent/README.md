# NodeLink agent

A tiny, **read-only** watchdog for Algorand nodes installed with [NodeKit](https://nodekit.run) —
Raspberry Pi 5 (arm64) and x86-64 mini PCs on Raspberry Pi OS / Debian / Ubuntu. It checks your node
every 30 s and sends **state-change alerts** (and an optional daily summary) to **your own** Telegram
bot or Discord webhook.

* One Python file, **standard library only** (Python 3.9+, preinstalled on Pi OS / Ubuntu). No pip.
* Runs as an unprivileged `nodelink-agent` user under systemd at the lowest CPU/IO priority, so it
  never competes with block proposals: ~19 MB RSS, ~0.0 % CPU (measurements below).
* Never signs anything, never touches keys or wallets, never changes the node.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/vanderwelle/nodelink/main/agent/install.sh | sudo bash
```

> **The repository is private right now**, so that URL returns 404 until it is made public. Until then
> use one of these (both run the same installer from a local copy):
>
> * **On the node** (SSH from your phone works): `git clone https://github.com/vanderwelle/nodelink.git`
>   (enter your GitHub username and a personal access token as the password), then
>   `sudo bash nodelink/agent/install.sh`
> * **From a computer**: `scp -r agent/ <user>@<node>:~/nodelink-agent && ssh <user>@<node> sudo bash ~/nodelink-agent/install.sh`

The installer (same for arm64 and x86-64 — the agent is pure Python):

1. checks for `/usr/bin/python3` ≥ 3.9,
2. installs `/opt/nodelink-agent/nodelink_agent.py` and the `nodelink-agent` command (`/usr/local/bin`),
3. creates the system user `nodelink-agent` (no login, no home),
4. writes `/etc/nodelink-agent/agent.ini` (mode **600**, never overwritten on re-install),
5. makes sure that user can read `/var/lib/algorand/algod.token` (adds group `algorand` only if needed)
   and, on a Pi, adds it to `video` so `vcgencmd get_throttled` works,
6. installs and starts `nodelink-agent.service`.

Then:

```bash
sudo nano /etc/nodelink-agent/agent.ini   # add Telegram and/or Discord (below)
sudo systemctl restart nodelink-agent
sudo nodelink-agent test-alert            # one test message to each channel
sudo nodelink-agent status                # one-shot status
journalctl -u nodelink-agent -f           # logs (secrets are redacted)
```

Uninstall: `sudo bash install.sh --uninstall` (keeps the config) or `--uninstall --purge`.

### Alert channels (the only fields you must fill in)

| Section | Field | Where to get it |
|---|---|---|
| `[telegram]` | `bot_token` | Telegram → **@BotFather** → `/newbot` → token like `123456789:AA…` |
| `[telegram]` | `chat_id` | Send your bot any message, then `curl -s https://api.telegram.org/bot<TOKEN>/getUpdates` → `"chat":{"id":…}` (groups are negative numbers) |
| `[discord]` | `webhook_url` | Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL |

Use either or both. Optional: `[node] accounts` (comma-separated addresses; empty = every account with
a key on this node), `[agent] node_name` (shown in alerts), thresholds (see `agent.example.ini`).

## How it reads the node (verified against NodeKit's source)

NodeKit installs algod with the OS package manager and only supports the default data directory —
`nodekit bootstrap`: *"This command only supports the default data directory, /var/lib/algorand"*
([man/nodekit_bootstrap.md](https://github.com/algorandfoundation/nodekit/blob/main/man/nodekit_bootstrap.md)).
The agent discovers algod exactly like NodeKit does
([internal/algod/utils/utils.go](https://github.com/algorandfoundation/nodekit/blob/main/internal/algod/utils/utils.go),
[internal/algod/client.go](https://github.com/algorandfoundation/nodekit/blob/main/internal/algod/client.go)):

| What | Where | Notes |
|---|---|---|
| Data dir | `/var/lib/algorand` (or `$ALGORAND_DATA` at install time) | NodeKit's Linux default |
| REST endpoint | `<data>/algod.net`, `0.0.0.0`/`[::]` → `127.0.0.1` | algod's default `EndpointAddress` is `127.0.0.1:0` (random port), so the file is re-read whenever a request fails |
| API token | `<data>/algod.token` | algod writes token files `0644` ([go-algorand util/tokens](https://github.com/algorand/go-algorand/blob/master/util/tokens/tokens.go)) |
| Admin token | `<data>/algod.admin.token` | NodeKit itself uses this one. The agent uses it **only** for `GET /v2/participation` (which keys are installed on this node); set `use_admin_token = no` to never read it |
| Process | `<data>/algod.pid` + `/proc/<pid>` | |
| Network | `<data>/genesis.json` | picks the Nodely reference (MainNet/TestNet) |
| Service | `algorand.service` (`/usr/bin/algod -d /var/lib/algorand`, user `algorand`) | from the Debian package ([go-algorand installer](https://github.com/algorand/go-algorand/blob/master/installer/algorand.service)); NodeKit starts/stops it with `systemctl start/stop algorand` ([internal/algod/linux/linux.go](https://github.com/algorandfoundation/nodekit/blob/main/internal/algod/linux/linux.go)) |

### Why the REST API and not `goal node status`

Parsing `goal node status` every 30 s would fork and exec the `goal` Go binary (which itself reads the
data dir and calls the same REST API) twice a minute, forever. The agent instead makes 2–4 tiny HTTP requests to
`127.0.0.1` over a plain socket (no TLS, no subprocess), which costs well under 1 ms of CPU and gives
structured data (catchup state, per-account status, key validity) that `goal node status` doesn't print.
`goal node status` is still used automatically **as a fallback** when the REST API is unreachable
(e.g. `algod.net` missing), so a broken token file doesn't blind the watchdog.

## What it measures

| Metric | Source |
|---|---|
| algod up/down, version, PID, algod RSS | `/v2/status`, `/versions`, `algod.pid`, `/proc` |
| Sync: last round, time since last round, catchup / fast-catchup (catchpoint) | `/v2/status` |
| Lag vs network | Nodely public `/v2/status` (every 5 min; every 1 min while behind) |
| Per account: online/offline, incentive eligibility, balance, last proposed block, last heartbeat | local `/v2/accounts/{addr}?exclude=all` |
| Participation key expiry (rounds and time) and **whether the registered key is installed on this node** | account `participation` + admin `/v2/participation` |
| Blocks proposed in 24 h (daily summary only, optional) | Nodely MainNet indexer, 1 request/account/day |
| CPU temperature | `/sys/class/thermal/thermal_zone*/` (prefers the CPU zone) |
| Pi throttling / under-voltage | `vcgencmd get_throttled` (every 5 min, only if installed) |
| CPU load, RAM | `/proc/loadavg`, `/proc/meminfo` |
| Disk free on the data dir | `statvfs(/var/lib/algorand)` |

## Alerts

All alerts are **state changes**: a change must persist for `debounce_polls` checks (default 2; 3 for
temperature) before anything is sent, thresholds have hysteresis (separate clear levels), and every
alert gets a ✅ recovery message. A still-critical problem is repeated every `renotify_hours` (12 h;
0 = never). State is saved in `/var/lib/nodelink-agent/state.json`, so restarts never re-send or miss a
recovery.

| Alert | Fires | Clears |
|---|---|---|
| 🔴 Node is DOWN (algod) | process gone or API not answering (and `goal` fallback fails) | back up |
| 🔴 No new block | > 60 s since the last round (not during catchup) | < 15 s |
| 🔴 Node is out of sync | catchup / fast-catchup running, or > 20 rounds behind Nodely | ≤ 5 rounds |
| 🔴 Account went OFFLINE | account status ≠ Online (no debounce: on-chain fact) | Online again |
| 🟠 Not incentive eligible | online but `incentive-eligible` false | eligible |
| 🟠 / 🔴 Participation key expires | < 7 days (warning), < 1 day (critical) | renewed |
| 🔴 Participation key EXPIRED / registered key NOT on this node | key past `vote-last-valid`, or the on-chain key isn't installed here | fixed |
| 🟠 / 🔴 CPU temperature | ≥ 75 °C / ≥ 80 °C (a Pi starts throttling at 80 °C, hard limit 85 °C — [Raspberry Pi docs](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/raspberry-pi/frequency-management.adoc)) | < 70 °C / < 77 °C |
| 🟠 Raspberry Pi is throttling | `get_throttled` "now" bits: under-voltage, freq capped, throttled, soft limit | bits clear |
| 🟠 / 🔴 Disk space low | < 10 % or < 20 GB / < 5 % or < 5 GB free | + 2 % margin |
| 📊 Daily summary (optional) | once a day at `daily_summary_hour` | — |

Example: `🔴 [pi5-node] Participation key expires in < 1 day ABCDEF…WXYZ` / `~20h 5m left (round 46600000). Renew now: NodeKit g, then r.`

## Resource footprint

The daemon imports no TLS/HTTP libraries: localhost algod requests use a raw socket. The rare HTTPS
calls (Nodely reference, Telegram, Discord) run in a **short-lived child process** that exits after one
request, so OpenSSL and the CA store never stay resident. Secrets are passed to it on stdin, never argv.

systemd limits (`nodelink-agent.service`): `Nice=19`, `CPUSchedulingPolicy=idle`, `IOSchedulingClass=idle`,
`CPUWeight=1`, `CPUQuota=5%`, `MemoryHigh=64M`, `MemoryMax=96M`, `TasksMax=16`, `OOMScoreAdjust=1000`
(the agent dies before algod ever would), plus `ProtectSystem=strict`, `NoNewPrivileges`, no capabilities.

Measured on the x86-64 dev box (Python 3.13), `run` with 30 s polls against a LocalNet algod with 3
online accounts + keys, and the Nodely reference forced to every 60 s (5× the default), over 370 s:

| | Result |
|---|---|
| Daemon RSS | 18.6 MB at start → 18.6 MB after 6 min (VmHWM 18.6 MB) |
| Daemon CPU | 0.10 s total incl. start-up ≈ **0.03 %**; ~4 ms per poll |
| HTTPS helper (per Nodely/Telegram/Discord call) | ~0.085 s CPU, 0.25 s wall, 28.8 MB peak, then exits |
| Total incl. helpers at the default 5-min reference | ≈ 0.04 % of one core |

A Pi 5 core is slower than this box, so expect a few times these CPU figures — still well under 0.5 %.

## Privacy

Nothing leaves the machine except (1) alerts to **your** Telegram/Discord and (2) the optional,
anonymous Nodely reads (`/v2/status`; and the daily proposals count for your account). Set
`[reference] enabled = no` to stay fully local. There is **no** feed to NodeLink servers.

*Future (opt-in only, not built):* sending a health heartbeat to NodeLink so the web hub's Health tab can
show uptime and push notifications — would be off by default and require explicit consent.

## Commands

```
nodelink-agent status [--json]   one-shot status; exit code 0 ok / 1 warnings / 2 critical
nodelink-agent test-alert        send a test message to each configured channel
nodelink-agent check-config      show which channels are configured (never prints secrets)
nodelink-agent run               the watchdog loop (what systemd runs)
```

## Tests

```bash
python3 -m unittest discover -s agent/tests -v
```

* `test_alerts.py` — the state machine: debounce, flapping, recovery, hysteresis, reminders, restart
  persistence, temperature/disk/lag/part-key thresholds, throttling bits, `goal` parser, secret redaction.
* `test_integration.py` — the real `run` loop (state on disk) against a mock algod (chunked responses,
  token rotation, port change, 500s), fake `/proc` + `/sys/class/thermal`, `goal` fallback, and a mock
  webhook server capturing Telegram + Discord payloads (including a Discord 429 retry); plus a read-only
  check against the LocalNet algod when it is running on `127.0.0.1:4001`.
