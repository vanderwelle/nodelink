# Contributing to NodeLink

Thanks for helping! NodeLink is a **TestNet preview**; please keep every change TestNet-only.

## Ground rules

* **Never** add MainNet transaction support, and never weaken the MainNet guards (`frontend/src/lib/guard.ts`,
  `scripts/lib/env.ts`). Read-only MainNet telemetry is fine.
* **Never** commit secrets: mnemonics, tokens, `.env` files. They belong in the gitignored `.env`.
* Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## Development

```bash
npm ci
npm run build                          # frontend production build (strict TypeScript, no `any`)
npm run test:guard -w scripts          # MainNet transaction guard
npm run test:agent                     # NodeLink agent (Python stdlib unittest)
```

LocalNet end-to-end tests and the TestNet deploy are described in the [README](README.md).

## Pull requests

* Keep PRs focused; describe what changed and how you tested it.
* TypeScript must pass `tsc --noEmit` with the strict settings; the frontend must build.
* New source files start with the SPDX header:
  `// SPDX-License-Identifier: AGPL-3.0-or-later` (or `#` for Python/shell).
* By submitting a contribution you agree that it is licensed under the project's license,
  **AGPL-3.0-or-later** (inbound = outbound). No CLA is required.
