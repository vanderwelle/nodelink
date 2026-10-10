# Security policy

NodeLink is a **TestNet preview**. It has **not been audited**, and its zk proving key comes from a
**dev-only, single-party trusted setup** (`frontend/public/zk/node_membership_final.zkey` is not for
production). Do not use it with real funds.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

* **Primary route: GitHub private vulnerability reporting.** Go to this repository → **Security** →
  **Report a vulnerability** (or open <https://github.com/vanderwelle/nodelink/security/advisories/new>).
  The report stays private between you and the maintainer until a fix is published.
* Email (fallback only): **TODO (Julian): add a security contact address** <!-- e.g. security@your-domain -->

Please include: affected component (contract, circuits, frontend, scripts, agent), steps to reproduce or
a proof of concept, impact, and any suggested fix. We aim to acknowledge reports within **7 days** and
will coordinate a disclosure date with you. Please give us reasonable time to fix before publishing.

## Scope

In scope: `contracts/` (NodeLink smart contract), `circuits/` (Circom circuits), `shared/`, `frontend/`
(including the MainNet transaction guard and telemetry), `scripts/` (deploy, root updater) and `agent/`
(on-node watchdog).

Known limitations (not vulnerabilities, but good to know):

* The trusted setup is single-party; whoever ran it could forge proofs. A production launch requires a
  multi-party ceremony.
* The root updater is a single trusted operator on TestNet.
* The frontend's MainNet telemetry is read-only public data; NodeLink never signs MainNet transactions.

## Secrets

Never commit mnemonics, API tokens or `.env` files. If you find a secret in this repository or its
history, report it privately as above.
