# SGDev LLM Data

Personal, self-hosted dashboard for **LLM prices, quality and trends** — built for the [SGDev](https://www.youtube.com/@DiegoSGDev) YouTube channel (`@DiegoSGDev`).

Static Astro site + weekly ETL. Runs in Docker behind Caddy (e.g. `llm.sgdev.es`).

## Stack

- **Astro** (static-first) + TypeScript + Tailwind + React islands
- **Charts:** Observable Plot (M4+)
- **Data:** SQLite via ETL → static JSON at build time (no DB server)
- **Sources:** [OpenRouter](https://openrouter.ai) models API · [LMArena leaderboard dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) (CC BY 4.0)
- **Not used:** Artificial Analysis (licence forbids public dashboards)

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
# Stub until Milestone 2
npm run etl:help

# Compose profile (after M2)
docker compose --profile etl run --rm etl
```

The `etl-cron` service is included in the default compose stack and will run the weekly snapshot once the pipeline lands.

## Design: Terminal Editorial

Dark by default (`#0B0D10` / `#13161B`), signal green / electric blue / amber accents, Inter + JetBrains Mono, light-mode toggle.

## Roadmap

| Milestone | Status |
|-----------|--------|
| **M1** Scaffold, design system, Docker, Caddy, README | ← you are here |
| **M2** ETL + matching + fixtures + tests | |
| **M3** JSON export + typed schema | |
| **M4** Frontier scatter + Good-Enough Finder | |
| **M5** Remaining charts | |
| **M6** Share cards, polish, Lighthouse | |

## Licence notes

- Every numeric value comes from a fetched source (never hand-typed).
- Credit OpenRouter and LMArena (CC BY 4.0) on every page footer and chart source line.
- Do not re-serve the raw OpenRouter catalog as a public API.
