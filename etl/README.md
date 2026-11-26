# ETL (Milestone 2)

Node/TypeScript pipeline:

1. Fetch OpenRouter `GET /api/v1/models` (no key).
2. Fetch LMArena `lmarena-ai/leaderboard-dataset` (CC BY 4.0) style-control overall.
3. Match models via normalised names + [`../data/match-overrides.json`](../data/match-overrides.json).
4. Append dated rows to SQLite (`data/sgdev.sqlite`).
5. Export static JSON into `public/data/` for the Astro build.

Until M2 ships, `npm run etl:help` prints this stub.
