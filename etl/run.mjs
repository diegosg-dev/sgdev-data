#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./schema.mjs";
import {
  extractProvider,
  isOpenWeights,
  pricePerTokenToPerMillion,
  unixSecondsToIsoDate,
} from "./normalize.mjs";
import { matchModels } from "./matcher.mjs";
import { fetchOpenRouterModels, fetchProviderEndpoints } from "./fetch-openrouter.mjs";
import { fetchLmArenaHistory, fetchLmArenaLatest } from "./fetch-lmarena.mjs";
import { exportStaticJson } from "./export-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    fixture: false,
    exportOnly: false,
    skipHistory: false,
    skipEndpoints: false,
    dbPath: path.join(ROOT, "data", "sgdev.sqlite"),
    outDir: path.join(ROOT, "public", "data"),
    overridesPath: path.join(ROOT, "data", "match-overrides.json"),
    unmatchedPath: path.join(ROOT, "data", "unmatched-report.json"),
    snapshotDate: new Date().toISOString().slice(0, 10),
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture") args.fixture = true;
    else if (a === "--export-only") args.exportOnly = true;
    else if (a === "--skip-history") args.skipHistory = true;
    else if (a === "--skip-endpoints") args.skipEndpoints = true;
    else if (a === "--db" && argv[i + 1]) args.dbPath = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i + 1]) args.outDir = path.resolve(argv[++i]);
    else if (a === "--date" && argv[i + 1]) args.snapshotDate = argv[++i];
  }
  return args;
}

function loadOverrides(overridesPath) {
  if (!fs.existsSync(overridesPath)) return {};
  const raw = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
  return raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {};
}

export async function runEtl(options = {}) {
  const opts = {
    fixture: false,
    exportOnly: false,
    skipHistory: false,
    skipEndpoints: false,
    dbPath: path.join(ROOT, "data", "sgdev.sqlite"),
    outDir: path.join(ROOT, "public", "data"),
    overridesPath: path.join(ROOT, "data", "match-overrides.json"),
    unmatchedPath: path.join(ROOT, "data", "unmatched-report.json"),
    snapshotDate: new Date().toISOString().slice(0, 10),
    ...options,
  };

  const db = openDb(opts.dbPath);

  try {
    if (opts.exportOnly) {
      const meta = exportStaticJson(db, opts.outDir);
      return { meta };
    }

    const overrides = loadOverrides(opts.overridesPath);
    let openRouterModels;
    let arenaLatest;
    let arenaHistory = [];
    let endpointsByModel = new Map();

    if (opts.fixture) {
      const fixtureDir = path.join(__dirname, "fixtures");
      openRouterModels = JSON.parse(
        fs.readFileSync(path.join(fixtureDir, "openrouter-models.json"), "utf8"),
      );
      arenaLatest = JSON.parse(
        fs.readFileSync(path.join(fixtureDir, "lmarena-latest.json"), "utf8"),
      );
      const histPath = path.join(fixtureDir, "lmarena-history.json");
      if (fs.existsSync(histPath)) {
        arenaHistory = JSON.parse(fs.readFileSync(histPath, "utf8"));
      }
      const epPath = path.join(fixtureDir, "provider-endpoints.json");
      if (fs.existsSync(epPath)) {
        const rawEp = JSON.parse(fs.readFileSync(epPath, "utf8"));
        for (const [k, v] of Object.entries(rawEp)) {
          endpointsByModel.set(k, v);
        }
      }
    } else {
      console.log("Fetching OpenRouter models and LMArena text_style_control latest...");
      [openRouterModels, arenaLatest] = await Promise.all([
        fetchOpenRouterModels(),
        fetchLmArenaLatest(),
      ]);
      if (!opts.skipHistory) {
        console.log("Fetching LMArena text_style_control full history...");
        arenaHistory = await fetchLmArenaHistory();
      }
    }

    const { matched, unmatchedOpenRouter, unmatchedArena } = matchModels(
      openRouterModels,
      arenaLatest,
      overrides,
    );

    if (!opts.fixture && !opts.skipEndpoints) {
      // Fetch per-provider pricing for top matched open-weights models (up to 25)
      const openMatchedIds = matched
        .filter((m) =>
          isOpenWeights({
            license: m.arena.license,
            huggingFaceId: m.openRouter.hugging_face_id,
          }),
        )
        .sort((a, b) => b.arena.rating - a.arena.rating)
        .slice(0, 25)
        .map((m) => m.openRouter.id);

      console.log(`Fetching OpenRouter provider endpoints for ${openMatchedIds.length} open models...`);
      endpointsByModel = await fetchProviderEndpoints(openMatchedIds, { concurrency: 6 });
    }

    const fetchedAt = new Date().toISOString();
    const arenaPublishDate = arenaLatest[0]?.leaderboard_publish_date || null;

    const existingFirstSeen = new Map(
      db
        .prepare(`SELECT model_id, MIN(first_seen_date) AS first_seen FROM model_snapshots GROUP BY model_id`)
        .all()
        .map((r) => [r.model_id, r.first_seen]),
    );

    const insertSnapshot = db.prepare(`
      INSERT INTO snapshots (snapshot_date, fetched_at, arena_publish_date, openrouter_count, arena_count, matched_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date) DO UPDATE SET
        fetched_at = excluded.fetched_at,
        arena_publish_date = excluded.arena_publish_date,
        openrouter_count = excluded.openrouter_count,
        arena_count = excluded.arena_count,
        matched_count = excluded.matched_count
    `);

    const insertModel = db.prepare(`
      INSERT INTO model_snapshots (
        snapshot_date, model_id, model_name, provider, input_price, output_price,
        context_length, arena_score, arena_model, arena_organization, arena_license,
        open_weights, first_seen_date, source_created_at, match_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date, model_id) DO UPDATE SET
        model_name = excluded.model_name,
        provider = excluded.provider,
        input_price = excluded.input_price,
        output_price = excluded.output_price,
        context_length = excluded.context_length,
        arena_score = excluded.arena_score,
        arena_model = excluded.arena_model,
        arena_organization = excluded.arena_organization,
        arena_license = excluded.arena_license,
        open_weights = excluded.open_weights,
        source_created_at = excluded.source_created_at,
        match_method = excluded.match_method
    `);

    const insertArenaHist = db.prepare(`
      INSERT INTO arena_history (publish_date, arena_model, organization, license, rating, open_weights)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(publish_date, arena_model) DO UPDATE SET
        organization = excluded.organization,
        license = excluded.license,
        rating = excluded.rating,
        open_weights = excluded.open_weights
    `);

    const insertQuote = db.prepare(`
      INSERT INTO provider_quotes (
        snapshot_date, model_id, model_name, provider_name,
        input_price, output_price, quantization, context_length
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_date, model_id, provider_name, quantization) DO UPDATE SET
        input_price = excluded.input_price,
        output_price = excluded.output_price,
        context_length = excluded.context_length
    `);

    const tx = db.transaction(() => {
      let validMatched = 0;
      for (const { openRouter, arena, matchMethod } of matched) {
        const inputPrice = pricePerTokenToPerMillion(openRouter.pricing?.prompt);
        const outputPrice = pricePerTokenToPerMillion(openRouter.pricing?.completion);
        if (inputPrice === null || outputPrice === null) continue;

        const open = isOpenWeights({
          license: arena.license,
          huggingFaceId: openRouter.hugging_face_id,
        });
        const firstSeen =
          existingFirstSeen.get(openRouter.id) ||
          unixSecondsToIsoDate(openRouter.created) ||
          opts.snapshotDate;

        insertModel.run(
          opts.snapshotDate,
          openRouter.id,
          openRouter.name || openRouter.id,
          extractProvider(openRouter.id),
          inputPrice,
          outputPrice,
          openRouter.context_length ?? null,
          arena.rating,
          arena.model_name,
          arena.organization,
          arena.license,
          open ? 1 : 0,
          firstSeen,
          openRouter.created ?? null,
          matchMethod,
        );
        validMatched++;
      }

      insertSnapshot.run(
        opts.snapshotDate,
        fetchedAt,
        arenaPublishDate,
        openRouterModels.length,
        arenaLatest.length,
        validMatched,
      );

      for (const row of arenaHistory) {
        if (!row.leaderboard_publish_date || !row.model_name) continue;
        insertArenaHist.run(
          row.leaderboard_publish_date,
          row.model_name,
          row.organization,
          row.license,
          row.rating,
          isOpenWeights({ license: row.license }) ? 1 : 0,
        );
      }

      // Ensure latest arena snapshot is also in arena_history
      for (const row of arenaLatest) {
        if (!row.leaderboard_publish_date || !row.model_name) continue;
        insertArenaHist.run(
          row.leaderboard_publish_date,
          row.model_name,
          row.organization,
          row.license,
          row.rating,
          isOpenWeights({ license: row.license }) ? 1 : 0,
        );
      }

      const modelNameById = new Map(openRouterModels.map((m) => [m.id, m.name || m.id]));
      for (const [modelId, endpoints] of endpointsByModel.entries()) {
        for (const ep of endpoints) {
          const inputPrice = pricePerTokenToPerMillion(ep.pricing?.prompt);
          const outputPrice = pricePerTokenToPerMillion(ep.pricing?.completion);
          if (inputPrice === null || outputPrice === null) continue;
          const providerName = String(ep.provider_name || "").trim();
          if (!providerName) continue;
          insertQuote.run(
            opts.snapshotDate,
            modelId,
            modelNameById.get(modelId) || modelId,
            providerName,
            inputPrice,
            outputPrice,
            String(ep.quantization || ""),
            ep.context_length ?? null,
          );
        }
      }
    });

    tx();

    // Write reviewable unmatched report (only outside pure temp test runs if path given)
    if (opts.unmatchedPath) {
      fs.mkdirSync(path.dirname(opts.unmatchedPath), { recursive: true });
      fs.writeFileSync(
        opts.unmatchedPath,
        JSON.stringify(
          {
            snapshotDate: opts.snapshotDate,
            matchedCount: matched.length,
            unmatchedArenaTop30: unmatchedArena.slice(0, 30),
            unmatchedOpenRouterCount: unmatchedOpenRouter.length,
            unmatchedOpenRouterSample: unmatchedOpenRouter.slice(0, 50),
          },
          null,
          2,
        ) + "\n",
      );
    }

    const meta = exportStaticJson(db, opts.outDir);
    return {
      meta,
      matchedCount: matched.length,
      unmatchedArenaCount: unmatchedArena.length,
      unmatchedOpenRouterCount: unmatchedOpenRouter.length,
    };
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  runEtl(args)
    .then((res) => {
      console.log("ETL complete:", JSON.stringify(res.meta, null, 2));
    })
    .catch((err) => {
      console.error("ETL failed:", err);
      process.exit(1);
    });
}
