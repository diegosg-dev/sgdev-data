# SGDev LLM Data

Personal, self-hosted dashboard for **LLM prices, quality and trends** — built for the [SGDev](https://www.youtube.com/@DiegoSGDev) YouTube channel (`@DiegoSGDev`).

Static Astro site + weekly ETL. Runs in Docker behind Caddy (e.g. `llm.sgdev.es`).

## Stack

- **Astro** (static-first) + TypeScript + Tailwind + React islands
- **Charts:** Observable Plot (M4+)
- **Data:** SQLite via ETL → static JSON at build time (no DB server)
- **Sources:** [OpenRouter](https://openrouter.ai) models API · [LMArena leaderboard dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) (CC BY 4.0) · [Artificial Analysis](https://artificialanalysis.ai) API v2 (`AA_API_KEY`)

## One-command deploy

```bash
docker compose up -d --build
```

Site: [http://localhost:8080](http://localhost:8080)

Point your host Caddy at the container with [`Caddyfile.example`](./Caddyfile.example) (TLS for `llm.sgdev.es`).

### Local development

```bash
npm install
npm run dev
```

```bash
npm run build && npm run preview
```

### ETL (weekly)

```bash
# Fetch live OpenRouter + LMArena data, update SQLite, export static JSON
npm run etl

# Run offline against real-shape fixtures
npm run etl:fixture

# Re-export static JSON from existing data/sgdev.sqlite
npm run etl:export

# Run ETL & schema tests
npm test

# Compose profile (one-off run in container)
docker compose --profile etl run --rm etl
```

The `etl-cron` service is included in the default compose stack and runs `npm run etl` on a weekly loop.

## Design: Terminal Editorial

Dark by default (`#0B0D10` / `#13161B`), signal green / electric blue / amber accents, Inter + JetBrains Mono, light-mode toggle. Every chart includes a one-sentence editorial takeaway, a single key number, a source line, and a **Copy as image** button. The **Good-Enough Finder** supports shareable permalinks and **1200×675 PNG** share card exports.

## Roadmap

| Milestone | Status |
|-----------|--------|
| **M1** Scaffold, design system, Docker, Caddy, README | Done |
| **M2** ETL + matching + fixtures + tests | Done |
| **M3** JSON export + typed schema + analytics | Done |
| **M4** Frontier scatter + Good-Enough Finder + share cards | Done |
| **M5** Remaining charts (Prices, Open vs Closed, Providers, $1 Buys, Timeline, Movers) | Done |
| **M6** Polish, accessibility, tests, live deploy | Done |

## Licence notes

- Every numeric value comes from a fetched source (never hand-typed).
- Credit OpenRouter and LMArena (CC BY 4.0) on every page footer and chart source line.
- Do not re-serve the raw OpenRouter catalog as a public API.
