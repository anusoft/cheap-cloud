# cheap-cloud

A fast, insightful multi-cloud VM pricing comparison — like `instances.vantage.sh`, but
across **seven providers**, normalized, with monthly/yearly + commitment pricing and an
optional LLM "ask the data" panel. Pricing is pulled from each provider's **official API**.

Starts with **Bangkok / Thailand** and is multi-region from the ground up.

## Providers & official sources

| Provider | Bangkok region | Auth | Notes |
|---|---|---|---|
| AWS | `ap-southeast-7` | none (public Price List API) | Reserved 1yr/3yr |
| Azure | `southeastasia` *(proxy)* | none (public Retail Prices API) | Savings Plan 1yr/3yr; no GA TH region |
| Google Cloud | `asia-southeast3` | `GCP_API_KEY` | CUD 1yr/3yr |
| Alibaba | `ap-southeast-7` | AccessKey/Secret | Subscription 1yr/3yr |
| Tencent | `ap-bangkok` | SecretId/Key | Subscription (monthly + 1yr/3yr) |
| Huawei | `ap-southeast-2` | AK/SK (+ project id) | Yearly subscription |
| Hetzner | `sin` *(proxy)* | API token (Read) | Singapore = nearest DC; EUR→USD live |

See [`docs/data-sources.md`](docs/data-sources.md) for exact endpoints, commitment mechanics,
and confidence levels (`confirmed` vs `proxy`).

## Quick start

```bash
bun install
cp .env.example .env          # add provider keys + VITE_OPENAI_* for the chat panel

bun fetch                      # pull all providers for Bangkok → packages/fetchers/data/
bun run --cwd apps/web dev     # http://localhost:3000  (runs prep-data first)
```

Public providers (AWS, Azure) need no keys; credentialed ones skip gracefully until their
keys are set. Re-run `bun fetch` anytime to refresh prices.

### Other regions

The region selector lists every wired region (grouped by country); **Bangkok** ships with a
pricing snapshot. To populate another:

```bash
bun fetch --provider=all --region=singapore
bun run --cwd apps/web prep        # regenerate the bundled data
```

Download each provider's raw region list for reference:

```bash
bun run --cwd packages/fetchers regions:download   # → data/regions/*.json
```

## The app

A **plain Vite + React SPA** (so it deploys as fully static files) using **TanStack Table +
TanStack Virtual** for a dense, 60fps grid:

- price views: **$/mo (default) · $/yr · $/hr · $/unit** (per-vCPU & per-GB)
- **On-demand · 1yr · 3yr** shown as side-by-side columns, with discount %
- faceted filters (provider, family, arch, vCPU/RAM ranges, search), heat-mapped cheapest cell
- collapsible + drag-resizable sidebar, pin-to-compare strip, region selector
- **Ask the data** LLM panel (OpenAI-compatible, browser-side) — auto-hides when
  `VITE_OPENAI_*` is unset (so it's off on the static deploy, on locally)

## Publish to GitHub Pages (static)

The site is fully static. A workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
builds and deploys it on every push to `main`.

```bash
git init && git add -A && git commit -m "cheap-cloud"
gh repo create anusoft/cheap-cloud --public --source=. --remote=origin --push
# GitHub → repo Settings → Pages → Build and deployment → Source: GitHub Actions
```

The deploy builds with `BASE_PATH=/cheap-cloud/` (the repo name). If you name the repo
differently, update that value in the workflow. The build copies the committed pricing
snapshots into the bundle — **no provider secrets are used in CI**. `.env` is gitignored.

## Layout

```
packages/schema     shared Zod schema + per-vCPU/per-GB normalization
packages/fetchers    official-API fetchers, signers, region registry, CLI, prep-data
apps/web             Vite SPA: TanStack Table + Virtual, filters, regions, chat
docs/                data-sources.md + research/
```

## Adding a region or provider

- **Region**: add an entry to `REGIONS` in `packages/fetchers/src/regions.ts`, then
  `bun fetch --region=<key>`.
- **Provider**: add one file under `packages/fetchers/src/providers/` implementing the
  `ProviderFetcher` interface and register it in `providers/index.ts`.

## Notes

All prices USD, Linux, shared tenancy, on-demand baseline; commitments captured where the
provider API exposes them. Hetzner & Tencent monthly figures use their real monthly
cap/subscription (below hourly×730). Azure (and any non-local fallback) is flagged `proxy`.
Storage & egress are out of scope for v1.
