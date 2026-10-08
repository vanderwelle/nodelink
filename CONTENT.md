# Editing NodeLink content

Perks, reward programs and news are **typed registries in the repo**. One file edit → push to
`main` → Vercel redeploys → live at https://nodelink-ten.vercel.app in about a minute.

| What | File | Shows on |
|---|---|---|
| Perks | `frontend/src/content/perks.ts` (`PERK_ENTRIES`) | `/perks`, hub tile C |
| Reward programs | `frontend/src/content/rewards-programs.ts` (`PROGRAM_ENTRIES`) | `/rewards` → "Reward programs" |
| News | `frontend/src/content/news.ts` (`NEWS_ENTRIES`) | `/community`, hub bar E |
| NodeKit commands + doc links | `frontend/src/content/nodekit.ts` | `/start-node`, `/setup` |

Schemas live in `frontend/src/content/schema.ts`. TypeScript checks every field, and the build
also validates ids, dates and URLs. **A bad entry fails the build, so the site that's already live
stays up.**

> Everything in these files ships in the public JavaScript bundle. Never put secrets, private
> codes or allow-lists in them.

## Add a perk

Add an object to `PERK_ENTRIES` in `frontend/src/content/perks.ts`:

```ts
{
  id: "acme-swap-rebate",                 // unique, kebab-case; deep link: /perks?perk=acme-swap-rebate
  partner: "Acme DEX",
  title: "10% swap-fee rebate",
  summary: "Verified node runners get 10% of swap fees back.",   // shown on the card
  description: "Longer text for the detail view.\n\nBlank lines make paragraphs.", // optional
  category: "defi",                       // defi | airdrop | whitelist | boost | governance | tool | merch | other
  minTier: 2,                             // 1 Scout · 2 Guardian · 3 Pillar · 4 Sovereign · 5 Millionaire
  status: "live",                         // upcoming | live | ended
  start: "2026-11-01",                    // optional ISO date
  end: "2027-01-31",                      // optional; after this it automatically shows as Ended
  claim: { type: "link", url: "https://acme.example/nodelink", label: "Claim rebate" },
  url: "https://acme.example",            // optional partner homepage
  logo: "/partners/acme.svg",             // optional: file in frontend/public/partners/ or an https URL
},
```

Claim types:

- `{ type: "link", url }`: opens the partner's page (the user connects their badge wallet there).
- `{ type: "onchain", appId, network: "testnet" | "mainnet", url? }`: the partner's contract checks
  the NodeLink status box.
- `{ type: "code", instructions, url? }`: the partner issues codes after checking the badge. Put
  the *instructions* here, never the codes.

Status is applied automatically from the dates:
- an `upcoming` perk whose `start` date has passed shows as **Live**;
- any perk whose `end` date has passed shows as **Ended**.

## Add a reward program

Add an object to `PROGRAM_ENTRIES` in `frontend/src/content/rewards-programs.ts`:

```ts
{
  id: "acme-staker-boost",
  name: "Acme staker boost",
  type: "partner-boost",                  // proposer-payouts | partner-boost | tier-multiplier | campaign
  summary: "Extra ACME tokens for online node runners, scaled by tier.",
  status: "upcoming",
  schedule: { start: "2026-12-01", end: "2027-02-28", cadence: "weekly" },
  tierMultipliers: { 1: 1, 2: 1.25, 3: 1.5, 4: 2, 5: 3 },   // optional; leave a tier out if it isn't eligible
  source: { name: "Acme", url: "https://acme.example/boost" }, // who pays, and where to verify
  rewardAsset: "ACME",
},
```

Algorand's protocol proposer payouts don't need an entry. `/rewards` reads them live from the chain.

## Add news

```ts
{ id: "acme-partnership", date: "2026-11-01", tag: "Partners", title: "Acme joins NodeLink", body: "…", url: "https://…" },
```

News is sorted newest first.

## Preview the example entries

Each registry contains one entry with `example: true`. Example entries are hidden unless the build sets
`NEXT_PUBLIC_SHOW_EXAMPLE_CONTENT=1`:

```bash
NEXT_PUBLIC_SHOW_EXAMPLE_CONTENT=1 npm run dev     # local preview with "EXAMPLE" badges
```

Leave this variable unset on Vercel production. To preview there, set it only for Preview deployments.

## Check before pushing

```bash
npm run typecheck -w frontend && npm run build    # same checks Vercel runs
```
