# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Julian van der Welle
"""Unit tests for the alert state machine and rules (stdlib unittest; runs on the Pi too)."""
import io
import logging
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import nodelink_agent as na  # noqa: E402

ADDR = "A" * 58


def cfg(extra: str = "") -> na.Config:
    f = tempfile.NamedTemporaryFile("w", suffix=".ini", delete=False)
    f.write(extra)
    f.close()
    os.chmod(f.name, 0o600)
    return na.Config(f.name)


def snap(**kw):
    base = {
        "node": "pi5",
        "algod_up": True,
        "algod_process": True,
        "last_round": 1000,
        "time_since_last_round": 1.0,
        "catching_up": False,
        "catchpoint": "",
        "lag_rounds": 0,
        "ref_round": 1000,
        "accounts": [],
        "system": {"temp_c": 50.0, "disk_total": 100e9, "disk_free": 60e9, "throttled": 0},
    }
    sysd = kw.pop("system", {})
    base.update(kw)
    base["system"] = {**base["system"], **sysd}
    return base


def acct(status="Online", eligible=True, rounds_left=1_000_000, on_node=None):
    return {
        "address": ADDR, "status": status, "incentive_eligible": eligible, "balance": 50_000_000_000,
        "last_proposed": 990, "last_heartbeat": None, "vote_last_valid": 1000 + rounds_left,
        "rounds_left": rounds_left, "seconds_left": rounds_left * na.SECONDS_PER_ROUND, "key_on_node": on_node,
    }


class Harness:
    def __init__(self, c=None, **engine_kw):
        self.cfg = c or cfg()
        self.engine = na.AlertEngine(**engine_kw)
        self.t = 1_000_000.0

    def poll(self, s):
        self.t += 30
        return self.engine.process(na.build_rules(self.cfg, s), s, now=self.t)

    def kinds(self, s):
        return [(e.kind, e.key, e.level) for e in self.poll(s)]


class DebounceAndRecovery(unittest.TestCase):
    def test_healthy_node_sends_nothing(self):
        h = Harness()
        for _ in range(5):
            self.assertEqual(h.poll(snap()), [])

    def test_single_blip_is_debounced(self):
        h = Harness()
        h.poll(snap())
        self.assertEqual(h.poll(snap(time_since_last_round=120)), [])  # 1 bad poll
        self.assertEqual(h.poll(snap()), [])  # recovered before debounce -> nothing ever sent
        self.assertEqual(h.engine.active(), [])

    def test_fire_once_then_recover_once(self):
        h = Harness()
        h.poll(snap())
        bad = snap(time_since_last_round=120)
        self.assertEqual(h.kinds(bad), [])
        self.assertEqual(h.kinds(bad), [("fire", "stalled", 2)])
        for _ in range(5):
            self.assertEqual(h.kinds(bad), [])  # no repeats while unchanged
        self.assertEqual(h.kinds(snap()), [])  # recovery is debounced too
        self.assertEqual(h.kinds(snap()), [("recover", "stalled", 0)])
        self.assertEqual(h.kinds(snap()), [])

    def test_flapping_does_not_spam(self):
        h = Harness()
        sent = []
        for i in range(20):
            sent += h.poll(snap(time_since_last_round=120 if i % 2 else 1))
        self.assertEqual(sent, [])

    def test_stall_hysteresis(self):
        h = Harness()
        bad = snap(time_since_last_round=120)
        h.poll(bad)
        h.poll(bad)
        # 30 s since last round: below the 60 s fire threshold but above the 15 s clear threshold
        mid = snap(time_since_last_round=30)
        self.assertEqual(h.kinds(mid) + h.kinds(mid), [])
        self.assertEqual(h.kinds(snap(time_since_last_round=3)) + h.kinds(snap(time_since_last_round=3)), [("recover", "stalled", 0)])

    def test_alert_on_startup_off_adopts_current_state_silently(self):
        h = Harness(alert_on_startup=False)
        bad = snap(time_since_last_round=120)
        self.assertEqual(h.poll(bad), [])
        self.assertEqual(h.poll(bad), [])
        self.assertEqual(h.kinds(snap()) + h.kinds(snap()), [("recover", "stalled", 0)])

    def test_state_survives_restart(self):
        h = Harness()
        bad = snap(time_since_last_round=120)
        h.poll(bad)
        h.poll(bad)
        saved = __import__("json").loads(__import__("json").dumps(h.engine.state))
        h2 = Harness(state=saved)
        h2.t = h.t
        self.assertEqual(h2.poll(bad), [])  # no re-send after restart
        self.assertEqual(h2.kinds(snap()) + h2.kinds(snap()), [("recover", "stalled", 0)])

    def test_reminder_for_long_critical_state(self):
        h = Harness(renotify_s=3600)
        bad = snap(time_since_last_round=120)
        h.poll(bad)
        h.poll(bad)
        kinds = []
        for _ in range(130):  # 65 min at 30 s polls
            kinds += [e.kind for e in h.poll(bad)]
        self.assertEqual(kinds, ["remind"])


class Thresholds(unittest.TestCase):
    def test_temperature_levels_and_hysteresis(self):
        h = Harness()
        t = lambda c: snap(system={"temp_c": c})  # noqa: E731
        seq = [76, 76, 76]  # temperature uses 3-poll debounce
        out = [k for c in seq for k in h.kinds(t(c))]
        self.assertEqual(out, [("fire", "temperature", 1)])
        out = [k for c in [83, 83, 83] for k in h.kinds(t(c))]
        self.assertEqual(out, [("escalate", "temperature", 2)])
        out = [k for c in [79, 79, 79] for k in h.kinds(t(c))]  # 79 > crit clear 77: still critical
        self.assertEqual(out, [])
        out = [k for c in [72, 72, 72] for k in h.kinds(t(c))]  # 72 > warn clear 70: de-escalate to warning
        self.assertEqual(out, [("deescalate", "temperature", 1)])
        out = [k for c in [69, 69, 69] for k in h.kinds(t(c))]
        self.assertEqual(out, [("recover", "temperature", 0)])

    def test_temperature_custom_thresholds(self):
        h = Harness(cfg("[thresholds]\ntemp_warn_c = 60\ntemp_warn_clear_c = 55\n"))
        out = [k for _ in range(3) for k in h.kinds(snap(system={"temp_c": 61}))]
        self.assertEqual(out, [("fire", "temperature", 1)])

    def test_disk_low_and_margin(self):
        h = Harness()
        d = lambda free: snap(system={"disk_total": 1000e9, "disk_free": free})  # noqa: E731
        self.assertEqual(h.kinds(d(90e9)) + h.kinds(d(90e9)), [("fire", "disk", 1)])  # 9% < 10%
        self.assertEqual(h.kinds(d(110e9)) + h.kinds(d(110e9)), [])  # 11% < 10% + 2% margin
        self.assertEqual(h.kinds(d(40e9)) + h.kinds(d(40e9)), [("escalate", "disk", 2)])
        self.assertEqual(h.kinds(d(130e9)) + h.kinds(d(130e9)), [("recover", "disk", 0)])

    def test_disk_absolute_gb_floor(self):
        h = Harness()
        s = snap(system={"disk_total": 64e9, "disk_free": 4e9})  # 6.25% and 4 GB < 5 GB
        self.assertEqual(h.kinds(s) + h.kinds(s), [("fire", "disk", 2)])

    def test_out_of_sync_lag_and_catchup(self):
        h = Harness()
        self.assertEqual(h.kinds(snap(lag_rounds=50)) + h.kinds(snap(lag_rounds=50)), [("fire", "out_of_sync", 2)])
        self.assertEqual(h.kinds(snap(lag_rounds=10)) + h.kinds(snap(lag_rounds=10)), [])  # hysteresis: clear at <= 5
        self.assertEqual(h.kinds(snap(lag_rounds=2)) + h.kinds(snap(lag_rounds=2)), [("recover", "out_of_sync", 0)])
        cu = snap(catching_up=True, catchpoint="123#ABC", lag_rounds=None)
        self.assertEqual(h.kinds(cu) + h.kinds(cu), [("fire", "out_of_sync", 2)])

    def test_unknown_lag_keeps_state(self):
        h = Harness()
        h.poll(snap(lag_rounds=50))
        h.poll(snap(lag_rounds=50))
        self.assertEqual(h.kinds(snap(lag_rounds=None)) + h.kinds(snap(lag_rounds=None)), [])
        self.assertEqual(h.engine.active()[0][0], "out_of_sync")

    def test_algod_down_suppresses_dependent_rules(self):
        h = Harness()
        down = snap(algod_up=False, algod_process=False, time_since_last_round=None, lag_rounds=None)
        self.assertEqual(h.kinds(down) + h.kinds(down), [("fire", "algod_down", 2)])
        msgs = [e.text("pi5") for e in h.poll(snap()) + h.poll(snap())]
        self.assertEqual(len(msgs), 1)
        self.assertIn("back UP", msgs[0])

    def test_throttling_bits(self):
        h = Harness()
        s = snap(system={"throttled": 0x50005})
        ev = h.poll(s) + h.poll(s)
        self.assertEqual([(e.kind, e.key) for e in ev], [("fire", "throttling")])
        self.assertIn("under-voltage now", ev[0].detail)
        self.assertIn("throttled now", ev[0].detail)
        # only "has occurred" bits (16-19) -> not an active problem
        self.assertEqual(h.kinds(snap(system={"throttled": 0x50000})) + h.kinds(snap(system={"throttled": 0x50000})), [("recover", "throttling", 0)])


class AccountRules(unittest.TestCase):
    def test_went_offline_and_back(self):
        h = Harness()
        h.poll(snap(accounts=[acct()]))
        ev = h.poll(snap(accounts=[acct(status="Offline")]))  # account rules: no debounce (authoritative)
        self.assertEqual([(e.kind, e.key) for e in ev], [("fire", f"offline:{ADDR}")])
        self.assertIn("OFFLINE", ev[0].text("pi5"))
        ev = h.poll(snap(accounts=[acct()]))
        self.assertEqual([(e.kind, e.key) for e in ev], [("recover", f"offline:{ADDR}")])

    def test_partkey_7d_1d_expired_then_renewed(self):
        h = Harness()
        day = 86400 / na.SECONDS_PER_ROUND
        h.poll(snap(accounts=[acct(rounds_left=int(10 * day))]))
        self.assertEqual(h.kinds(snap(accounts=[acct(rounds_left=int(6 * day))])), [("fire", f"partkey:{ADDR}", 1)])
        self.assertEqual(h.kinds(snap(accounts=[acct(rounds_left=int(5 * day))])), [])
        self.assertEqual(h.kinds(snap(accounts=[acct(rounds_left=int(0.5 * day))])), [("escalate", f"partkey:{ADDR}", 2)])
        self.assertEqual(h.kinds(snap(accounts=[acct(rounds_left=0)])), [("escalate", f"partkey:{ADDR}", 3)])
        self.assertEqual(h.kinds(snap(accounts=[acct(rounds_left=int(90 * day))])), [("recover", f"partkey:{ADDR}", 0)])

    def test_registered_key_missing_from_node(self):
        h = Harness()
        ev = h.poll(snap(accounts=[acct(on_node=False)]))
        self.assertEqual([(e.key, e.level) for e in ev], [(f"partkey:{ADDR}", 3)])
        self.assertIn("NOT on this node", ev[0].title)

    def test_incentive_eligibility_lost(self):
        h = Harness()
        h.poll(snap(accounts=[acct()]))
        self.assertEqual(h.kinds(snap(accounts=[acct(eligible=False)])), [("fire", f"incentive:{ADDR}", 1)])

    def test_removed_account_is_forgotten_silently(self):
        h = Harness()
        h.poll(snap(accounts=[acct(status="Offline")]))
        self.assertEqual(h.poll(snap(accounts=[])), [])
        self.assertNotIn(f"offline:{ADDR}", h.engine.state["rules"])


class Misc(unittest.TestCase):
    def test_goal_status_parser(self):
        out = """Last committed block: 46512345
Time since last block: 1.2s
Sync Time: 0.0s
Last consensus protocol: https://github.com/algorandfoundation/specs/tree/x
Genesis ID: mainnet-v1.0
Genesis hash: wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=
"""
        s = na.parse_goal_status(out)
        self.assertEqual(s["last-round"], 46512345)
        self.assertAlmostEqual(s["time-since-last-round"] / 1e9, 1.2)
        self.assertEqual(s["catchup-time"], 0)
        self.assertEqual(s["genesis-id"], "mainnet-v1.0")
        s = na.parse_goal_status("Last committed block: 5\nTime since last block: 0s\nSync Time: 2m3.5s\nCatchpoint: 123#ABC\n")
        self.assertAlmostEqual(s["catchup-time"] / 1e9, 123.5)
        self.assertEqual(s["catchpoint"], "123#ABC")
        self.assertIsNone(na.parse_goal_status("Cannot contact algod"))

    def test_logs_never_contain_secrets(self):
        token = "123456789:AAH-very-secret-token-value-xyz"
        hook = "https://discord.com/api/webhooks/111/secret-webhook-token"
        c = cfg(f"[telegram]\nbot_token = {token}\nchat_id = 42\n[discord]\nwebhook_url = {hook}\n")
        buf = io.StringIO()
        lg = logging.getLogger("redact-test")
        hd = logging.StreamHandler(buf)
        hd.addFilter(na.RedactFilter(c.secrets()))
        lg.addHandler(hd)
        lg.error("failed %s and %s and https://api.telegram.org/bot%s/sendMessage", token, hook, token)
        self.assertNotIn("secret", buf.getvalue())
        self.assertNotIn("AAH", buf.getvalue())

    def test_world_readable_config_with_secrets_warns(self):
        c = cfg("[telegram]\nbot_token = 123:abcdefabcdef\nchat_id = 1\n")
        os.chmod(c.path, 0o644)
        self.assertTrue(na.Config(c.path).warnings)
        os.chmod(c.path, 0o600)
        self.assertFalse(na.Config(c.path).warnings)

    def test_temperature_prefers_cpu_zone(self):
        d = tempfile.mkdtemp()
        for i, (typ, milli) in enumerate([("acpitz", "90000"), ("cpu-thermal", "61250")]):
            os.makedirs(f"{d}/thermal_zone{i}")
            for name, val in (("type", typ), ("temp", milli)):
                with open(f"{d}/thermal_zone{i}/{name}", "w") as fh:
                    fh.write(val + "\n")
        self.assertEqual(na.read_temperature(d), (61.25, "cpu-thermal"))


if __name__ == "__main__":
    unittest.main()
