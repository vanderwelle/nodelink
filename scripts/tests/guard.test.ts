/**
 * Offline unit test for the frontend MainNet transaction guard. Builds UNSIGNED transactions
 * locally (nothing is signed or sent) and checks the guard rejects MainNet / non-TestNet ones.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import algosdk from "algosdk";

process.env.NEXT_PUBLIC_NETWORK = "testnet";
process.env.NEXT_PUBLIC_TELEMETRY_NETWORK = "mainnet";

const { assertTxnsAllowed, assertGenesisAllowed, assertContractNode, MainnetTransactionBlocked } = await import("../../frontend/src/lib/guard");
const { GENESIS, TELEMETRY, ENDPOINTS } = await import("../../frontend/src/lib/config");

const acct = algosdk.generateAccount().addr;
const params = (id: string, hash: string): algosdk.SuggestedParams => ({
  fee: 1000n,
  minFee: 1000n,
  flatFee: true,
  firstValid: 1000n,
  lastValid: 2000n,
  genesisID: id,
  genesisHash: Buffer.from(hash, "base64"),
});
const pay = (p: algosdk.SuggestedParams): algosdk.Transaction =>
  algosdk.makePaymentTxnWithSuggestedParamsFromObject({ sender: acct, receiver: acct, amount: 0, suggestedParams: p });

test("config: contract stays TestNet, telemetry reads MainNet", () => {
  assert.equal(TELEMETRY.network, "mainnet");
  assert.match(TELEMETRY.algod[0] ?? "", /mainnet-api\.4160\.nodely\.dev/);
  assert.doesNotMatch(ENDPOINTS.algod, /mainnet/);
});

test("TestNet transaction group passes", () => {
  assertTxnsAllowed([pay(params(GENESIS.testnet.id, GENESIS.testnet.hash))]);
});

test("MainNet transaction is blocked", () => {
  assert.throws(() => assertTxnsAllowed([pay(params(GENESIS.mainnet.id, GENESIS.mainnet.hash))]), MainnetTransactionBlocked);
});

test("a single MainNet txn inside a TestNet group blocks the whole group", () => {
  const ok = pay(params(GENESIS.testnet.id, GENESIS.testnet.hash));
  const bad = pay(params(GENESIS.mainnet.id, GENESIS.mainnet.hash));
  assert.throws(() => assertTxnsAllowed([ok, bad]), MainnetTransactionBlocked);
});

test("MainNet hash with a spoofed TestNet id is blocked", () => {
  assert.throws(() => assertGenesisAllowed(GENESIS.testnet.id, GENESIS.mainnet.hash), MainnetTransactionBlocked);
});

test("unknown network (e.g. BetaNet) is blocked when contract network is TestNet", () => {
  assert.throws(() => assertGenesisAllowed("betanet-v1.0", "mFgazF+2uRS1tMiL9dsj01hJGySEmPN28B/TjjvpVW0="), MainnetTransactionBlocked);
});

test("contract node reporting MainNet genesis is refused before any send", async () => {
  await assert.rejects(
    assertContractNode(async () => ({ genesisID: GENESIS.mainnet.id, genesisHash: Buffer.from(GENESIS.mainnet.hash, "base64") })),
    MainnetTransactionBlocked,
  );
});
