"""
Integration tests: the real agent loop (`run --once` per poll, state on disk) against
  * a mock algod HTTP server (scripted status/account/participation responses),
  * a fake data dir (algod.net / algod.token / algod.admin.token / algod.pid / genesis.json),
  * fake /sys/class/thermal and /proc/<pid> trees,
  * a local mock webhook server that captures Telegram + Discord payloads (no real network).
Plus a read-only smoke test against the LocalNet algod on this box when it is reachable.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
AGENT = os.path.join(HERE, "..", "nodelink_agent.py")
TOKEN = "t" * 64
ADMIN = "a" * 64
ADDR = "CERNOTRVMACS2GTQ3UUI6Q4IZCGQ3N5QCDSOLTT3ZTUD6SWYGZYC6BM5U"
VOTE = "vpk-1"
TG_TOKEN = "123456789:AAH-integration-secret-xyz"
DISCORD_PATH = "/api/webhooks/42/integration-secret-hook"


class MockAlgod:
    def __init__(self):
        self.round = 5000
        self.since_ns = 1_000_000_000
        self.status = "Online"
        self.vlv = 5000 + 2_000_000
        self.keys_on_node = True
        self.fail = False
        self.requests = []
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                outer.requests.append((self.path, self.headers.get("X-Algo-API-Token")))
                if outer.fail:
                    return self._json(500, {"message": "boom"})
                tok = self.headers.get("X-Algo-API-Token")
                if self.path == "/versions":
                    return self._json(200, {"build": {"major": 4, "minor": 3, "build_number": 2}})
                if self.path == "/v2/participation":
                    if tok != ADMIN:
                        return self._json(401, {"message": "Invalid API Token"})
                    keys = [{"address": ADDR, "key": {"vote-participation-key": VOTE, "vote-last-valid": outer.vlv}}] if outer.keys_on_node else []
                    return self._json(200 if keys else 404, keys or {"message": "none"})
                if tok != TOKEN:
                    return self._json(401, {"message": "Invalid API Token"})
                if self.path == "/v2/status":
                    return self._json(200, {"last-round": outer.round, "time-since-last-round": outer.since_ns, "catchup-time": 0, "catchpoint": ""}, chunked=True)
                if self.path.startswith(f"/v2/accounts/{ADDR}"):
                    return self._json(200, {"amount": 75_000_000_000, "status": outer.status, "incentive-eligible": True, "last-proposed": outer.round - 7,
                                            "participation": {"vote-last-valid": outer.vlv, "vote-participation-key": VOTE}})
                return self._json(404, {"message": "not found"})

            def _json(self, code, obj, chunked=False):
                body = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                if chunked:
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
                    half = len(body) // 2
                    for part in (body[:half], body[half:]):
                        self.wfile.write(b"%x\r\n%s\r\n" % (len(part), part))
                    self.wfile.write(b"0\r\n\r\n")
                else:
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

        H.protocol_version = "HTTP/1.1"
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.port = self.srv.server_address[1]


class MockHooks:
    """Captures Telegram sendMessage and Discord webhook POSTs. Can answer 429 once."""

    def __init__(self):
        self.telegram, self.discord, self.paths = [], [], []
        self.discord_429 = 0
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.paths.append(self.path)
                if self.path == f"/bot{TG_TOKEN}/sendMessage":
                    outer.telegram.append(body)
                    return self._json(200, {"ok": True, "result": {"message_id": len(outer.telegram)}})
                if self.path == DISCORD_PATH:
                    if outer.discord_429 > 0:
                        outer.discord_429 -= 1
                        return self._json(429, {"message": "rate limited", "retry_after": 0.01})
                    outer.discord.append(body)
                    self.send_response(204)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return None
                return self._json(404, {"ok": False})

            def _json(self, code, obj):
                b = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}"


class AgentLoop(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.algod = MockAlgod()
        self.hooks = MockHooks()
        d = self.data = os.path.join(self.tmp, "algorand")
        os.makedirs(d)
        self._w(f"{d}/algod.net", f"[::]:{self.algod.port}\n")  # NodeKit maps [::] / 0.0.0.0 -> 127.0.0.1
        self._w(f"{d}/algod.token", TOKEN + "\n")
        self._w(f"{d}/algod.admin.token", ADMIN + "\n")
        self._w(f"{d}/algod.pid", "4242\n")
        self._w(f"{d}/genesis.json", json.dumps({"network": "mainnet", "id": "v1.0"}))
        self.proc = os.path.join(self.tmp, "proc")
        os.makedirs(f"{self.proc}/4242")
        self._w(f"{self.proc}/4242/comm", "algod\n")
        self._w(f"{self.proc}/4242/status", "Name:\talgod\nVmRSS:\t 2516582 kB\n")
        self._w(f"{self.proc}/loadavg", "0.42 0.30 0.20 1/300 4242\n")
        self._w(f"{self.proc}/meminfo", "MemTotal:  8000000 kB\nMemAvailable: 5000000 kB\n")
        self.thermal = os.path.join(self.tmp, "thermal")
        os.makedirs(f"{self.thermal}/thermal_zone0")
        self._w(f"{self.thermal}/thermal_zone0/type", "cpu-thermal\n")
        self.set_temp(55.0)
        self.state = os.path.join(self.tmp, "state.json")
        self.ini = os.path.join(self.tmp, "agent.ini")
        self._w(self.ini, f"""[node]
data_dir = {d}
accounts = {ADDR}
[agent]
node_name = pi5-test
state_file = {self.state}
[reference]
enabled = no
[alerts]
daily_summary = no
[telegram]
bot_token = {TG_TOKEN}
chat_id = 777
api_base = {self.hooks.base}
[discord]
webhook_url = {self.hooks.base}{DISCORD_PATH}
[system]
thermal_root = {self.thermal}
proc_root = {self.proc}
vcgencmd = /nonexistent/vcgencmd
""")
        os.chmod(self.ini, 0o600)

    def tearDown(self):
        self.algod.srv.shutdown()
        self.hooks.srv.shutdown()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _w(self, path, text):
        with open(path, "w") as f:
            f.write(text)

    def set_temp(self, c):
        self._w(f"{self.thermal}/thermal_zone0/temp", f"{int(c * 1000)}\n")

    def agent(self, *args):
        p = subprocess.run([sys.executable, AGENT, "--config", self.ini, *args], capture_output=True, text=True, timeout=60)
        for secret in (TG_TOKEN, "integration-secret"):
            self.assertNotIn(secret, p.stdout + p.stderr, "secret leaked to output/logs")
        return p

    def poll(self):
        return self.agent("run", "--once")

    def texts(self):
        return [m["text"] for m in self.hooks.telegram]

    def test_status_reads_node_via_rest(self):
        p = self.agent("status")
        out = p.stdout
        self.assertIn("up  v4.3.2", out)
        self.assertIn("via rest", out)
        self.assertIn("round 5000", out)
        self.assertIn("Online", out)
        self.assertIn("on this node", out)
        self.assertIn("55.0 °C", out)
        self.assertIn("2458 MB RSS", out)  # algod RSS from fake /proc
        self.assertEqual(p.returncode, 0, out)
        # the admin token is only ever sent to /v2/participation
        for path, tok in self.algod.requests:
            if tok == ADMIN:
                self.assertEqual(path, "/v2/participation")
        js = json.loads(self.agent("status", "--json").stdout)
        self.assertEqual(js["snapshot"]["accounts"][0]["address"], ADDR)

    def test_full_incident_lifecycle_to_both_channels(self):
        self.poll()
        self.poll()
        self.assertEqual(self.hooks.telegram, [], "healthy node must send nothing")

        # 1) overheating: needs 3 consecutive polls
        self.set_temp(79.0)
        self.poll(); self.poll()
        self.assertEqual(self.hooks.telegram, [])
        self.poll()
        self.assertEqual(len(self.hooks.telegram), 1)
        self.assertIn("CPU temperature high", self.texts()[-1])
        self.assertIn("[pi5-test]", self.texts()[-1])
        # payload shapes
        self.assertEqual(self.hooks.telegram[-1]["chat_id"], "777")
        self.assertEqual(self.hooks.discord[-1]["username"], "NodeLink agent")
        self.assertEqual(self.hooks.discord[-1]["content"], self.texts()[-1])
        self.assertEqual(self.hooks.discord[-1]["allowed_mentions"], {"parse": []})

        # 2) account goes offline (immediate)
        self.algod.status = "Offline"
        self.poll()
        self.assertIn("Account went OFFLINE", self.texts()[-1])

        # 3) algod dies: API 500 + process gone; goal fallback unavailable
        self.algod.fail = True
        os.remove(f"{self.proc}/4242/comm")
        self.poll(); self.poll()
        self.assertIn("Node is DOWN", self.texts()[-1])
        self.assertIn("process not running", self.texts()[-1])
        n = len(self.texts())
        self.poll(); self.poll()
        self.assertEqual(len(self.texts()), n, "no repeats while still down")

        # 4) everything recovers
        self.algod.fail = False
        self._w(f"{self.proc}/4242/comm", "algod\n")
        self.algod.status = "Online"
        self.set_temp(60.0)
        for _ in range(3):
            self.poll()
        tail = "\n".join(self.texts()[n:])
        for s in ("Node is back UP", "Account is ONLINE again", "CPU temperature normal"):
            self.assertIn(s, tail)
        self.assertEqual(len(self.hooks.telegram), len(self.hooks.discord))

    def test_stall_partkey_and_key_missing(self):
        self.poll()
        self.algod.since_ns = 300 * 10**9
        self.poll(); self.poll()
        self.assertIn("No new block", self.texts()[-1])
        self.algod.since_ns = 10**9
        self.poll(); self.poll()
        self.assertIn("Blocks are flowing again", self.texts()[-1])
        self.algod.vlv = self.algod.round + int(3 * 86400 / 2.8)
        self.poll()
        self.assertIn("expires in < 7 days", self.texts()[-1])
        self.algod.keys_on_node = False
        self.poll()
        self.assertIn("NOT on this node", self.texts()[-1])

    def test_discord_429_is_retried(self):
        self.hooks.discord_429 = 1
        self.algod.status = "Offline"
        self.poll()
        self.assertEqual(len(self.hooks.telegram), 1)
        self.assertEqual(len(self.hooks.discord), 0)  # 429 -> queued in memory for a later poll
        out = self.agent("test-alert")
        self.assertIn("telegram: sent", out.stdout)
        self.assertIn("discord: sent", out.stdout)
        self.assertIn("test alert", self.hooks.discord[-1]["content"])

    def test_goal_fallback_when_rest_unreachable(self):
        os.remove(f"{self.data}/algod.net")
        goal = os.path.join(self.tmp, "goal")
        self._w(goal, "#!/bin/sh\necho 'Last committed block: 777'\necho 'Time since last block: 2.5s'\necho 'Sync Time: 0.0s'\necho 'Genesis ID: mainnet-v1.0'\n")
        os.chmod(goal, 0o755)
        with open(self.ini) as f:
            txt = f.read()
        self._w(self.ini, txt.replace("[node]\n", f"[node]\ngoal_path = {goal}\n", 1))
        js = json.loads(self.agent("status", "--json").stdout)["snapshot"]
        self.assertEqual(js["source"], "goal")
        self.assertTrue(js["algod_up"])
        self.assertEqual(js["last_round"], 777)

    def test_token_rotation_and_port_change(self):
        self.poll()
        # algod restarted on a new port with a new token (algod.net + algod.token rewritten)
        new = MockAlgod()
        try:
            global TOKEN
            old_token, TOKEN = TOKEN, "n" * 64
            self._w(f"{self.data}/algod.net", f"127.0.0.1:{new.port}\n")
            self._w(f"{self.data}/algod.token", TOKEN)
            p = self.agent("status")
            self.assertIn("via rest", p.stdout)
        finally:
            TOKEN = old_token
            new.srv.shutdown()


LOCALNET_TOKEN = "a" * 64


def localnet_up():
    import urllib.request
    try:
        req = urllib.request.Request("http://127.0.0.1:4001/v2/status", headers={"X-Algo-API-Token": LOCALNET_TOKEN})
        return urllib.request.urlopen(req, timeout=2).status == 200
    except Exception:
        return False


@unittest.skipUnless(localnet_up(), "LocalNet algod not reachable on 127.0.0.1:4001")
class RealLocalNet(unittest.TestCase):
    def test_status_against_real_algod(self):
        tmp = tempfile.mkdtemp()
        try:
            for name, text in (("algod.net", "127.0.0.1:4001"), ("algod.token", LOCALNET_TOKEN), ("algod.admin.token", LOCALNET_TOKEN),
                               ("genesis.json", json.dumps({"network": "dockernet", "id": "v1"}))):
                with open(os.path.join(tmp, name), "w") as f:
                    f.write(text)
            ini = os.path.join(tmp, "a.ini")
            with open(ini, "w") as f:
                f.write(f"[node]\ndata_dir = {tmp}\n[agent]\nstate_file = {tmp}/s.json\n[reference]\nenabled = no\n")
            p = subprocess.run([sys.executable, AGENT, "--config", ini, "status", "--json"], capture_output=True, text=True, timeout=30)
            js = json.loads(p.stdout)["snapshot"]
            self.assertTrue(js["algod_up"])
            self.assertEqual(js["source"], "rest")
            self.assertGreater(js["last_round"], 0)
            self.assertTrue(js["partkeys_known"])
            self.assertGreaterEqual(len(js["accounts"]), 1, "accounts auto-detected from keys installed on the node")
            self.assertTrue(all(a["key_on_node"] for a in js["accounts"]))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
