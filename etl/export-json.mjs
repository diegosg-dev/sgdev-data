import fs from "node:fs";
import path from "node:path";

function round(n, digits = 4) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function blendedPrice(inputPrice, outputPrice, ratio = 3) {
  return (inputPrice * ratio + outputPrice) / (ratio + 1);
}

/**
 * Export aggregated, purpose-built static JSON files for the Astro frontend.
 * Never exports the raw OpenRouter catalog.
 */
export function exportStaticJson(db, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  const latestSnap = db
    .prepare(
      `SELECT snapshot_date, fetched_at, arena_publish_date, openrouter_count, arena_count, matched_count
       FROM snapshots
       ORDER BY snapshot_date DESC
       LIMIT 1`,
    )
    .get();

  if (!latestSnap) {
    throw new Error("No snapshots found in SQLite database");
  }

  const allSnaps = db
    .prepare(`SELECT snapshot_date FROM snapshots ORDER BY snapshot_date ASC`)
    .all()
    .map((r) => r.snapshot_date);

  const latestDate = latestSnap.snapshot_date;
  const prevDate = allSnaps.length >= 2 ? allSnaps[allSnaps.length - 2] : null;

  // 1. Frontier: matched models with positive/valid pricing and Arena score on latest snapshot
  const latestMatched = db
    .prepare(
      `SELECT model_id, model_name, provider, input_price, output_price, context_length,
              arena_score, arena_model, arena_license, open_weights, first_seen_date, source_created_at
       FROM model_snapshots
       WHERE snapshot_date = ?
         AND arena_score IS NOT NULL
         AND input_price >= 0
         AND output_price >= 0
       ORDER BY arena_score DESC`,
    )
    .all(latestDate)
    .map((r) => ({
      id: r.model_id,
      name: r.model_name,
      provider: r.provider,
      inputPrice: round(r.input_price, 6),
      outputPrice: round(r.output_price, 6),
      contextLength: r.context_length ?? 0,
      arenaScore: round(r.arena_score, 1),
      arenaModel: r.arena_model,
      openWeights: Boolean(r.open_weights),
      firstSeenDate: r.first_seen_date,
      releaseDate: r.source_created_at
        ? new Date(r.source_created_at * 1000).toISOString().slice(0, 10)
        : r.first_seen_date,
    }));

  // 2. Prices history: per-model dated snapshots + cheapest price for score >= threshold
  const thresholds = [1250, 1300, 1350, 1400, 1450];
  const priceSeriesRows = db
    .prepare(
      `SELECT snapshot_date, model_id, model_name, provider, input_price, output_price, arena_score, open_weights
       FROM model_snapshots
       WHERE arena_score IS NOT NULL
       ORDER BY snapshot_date ASC, arena_score DESC`,
    )
    .all();

  const byDate = new Map();
  const byModel = new Map();

  for (const r of priceSeriesRows) {
    const b = blendedPrice(r.input_price, r.output_price, 3);
    if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, []);
    byDate.get(r.snapshot_date).push({ ...r, blended3to1: b });

    if (!byModel.has(r.model_id)) {
      byModel.set(r.model_id, {
        id: r.model_id,
        name: r.model_name,
        provider: r.provider,
        openWeights: Boolean(r.open_weights),
        latestScore: round(r.arena_score, 1),
        points: [],
      });
    }
    const m = byModel.get(r.model_id);
    m.latestScore = round(r.arena_score, 1);
    m.points.push({
      date: r.snapshot_date,
      inputPrice: round(r.input_price, 6),
      outputPrice: round(r.output_price, 6),
      blended: round(b, 6),
      arenaScore: round(r.arena_score, 1),
    });
  }

  const cheapestByThreshold = [];
  for (const [date, rows] of byDate.entries()) {
    for (const threshold of thresholds) {
      const eligible = rows.filter((r) => r.arena_score >= threshold && r.blended3to1 > 0);
      if (eligible.length === 0) continue;
      eligible.sort((a, b) => a.blended3to1 - b.blended3to1);
      const best = eligible[0];
      cheapestByThreshold.push({
        date,
        threshold,
        blended: round(best.blended3to1, 6),
        modelId: best.model_id,
        modelName: best.model_name,
        arenaScore: round(best.arena_score, 1),
        openWeights: Boolean(best.open_weights),
      });
    }
  }

  // Also export per-snapshot model list (compact) for Good-Enough Finder intelligence deflation
  const deflationSnapshots = [];
  for (const [date, rows] of byDate.entries()) {
    deflationSnapshots.push({
      date,
      models: rows
        .filter((r) => r.input_price > 0 || r.output_price > 0)
        .map((r) => ({
          id: r.model_id,
          name: r.model_name,
          inputPrice: round(r.input_price, 6),
          outputPrice: round(r.output_price, 6),
          arenaScore: round(r.arena_score, 1),
          openWeights: Boolean(r.open_weights),
        })),
    });
  }

  // 3. Open vs Closed gap over time (backfilled from LMArena full historical split)
  const arenaDates = db
    .prepare(`SELECT DISTINCT publish_date FROM arena_history ORDER BY publish_date ASC`)
    .all()
    .map((r) => r.publish_date);

  const bestByDateStmt = db.prepare(
    `SELECT arena_model, organization, rating
     FROM arena_history
     WHERE publish_date = ? AND open_weights = ?
     ORDER BY rating DESC
     LIMIT 1`,
  );

  const openVsClosedSeries = [];
  for (const date of arenaDates) {
    const bestClosed = bestByDateStmt.get(date, 0);
    const bestOpen = bestByDateStmt.get(date, 1);
    if (!bestClosed || !bestOpen) continue;
    openVsClosedSeries.push({
      date,
      bestClosedScore: round(bestClosed.rating, 1),
      bestClosedModel: bestClosed.arena_model,
      bestOpenScore: round(bestOpen.rating, 1),
      bestOpenModel: bestOpen.arena_model,
      gap: round(bestClosed.rating - bestOpen.rating, 1),
    });
  }

  // 4. Provider spread: same open-weights model priced across multiple providers
  const quoteRows = db
    .prepare(
      `SELECT q.model_id, q.model_name, q.provider_name, q.input_price, q.output_price, q.quantization, q.context_length,
              m.arena_score
       FROM provider_quotes q
       LEFT JOIN model_snapshots m
         ON m.snapshot_date = q.snapshot_date AND m.model_id = q.model_id
       WHERE q.snapshot_date = ?
         AND (q.input_price > 0 OR q.output_price > 0)
       ORDER BY q.model_id ASC`,
    )
    .all(latestDate);

  const spreadMap = new Map();
  for (const r of quoteRows) {
    const b = blendedPrice(r.input_price, r.output_price, 3);
    if (!spreadMap.has(r.model_id)) {
      spreadMap.set(r.model_id, {
        modelId: r.model_id,
        modelName: r.model_name,
        arenaScore: r.arena_score != null ? round(r.arena_score, 1) : null,
        quotes: [],
      });
    }
    spreadMap.get(r.model_id).quotes.push({
      provider: r.provider_name,
      quantization: r.quantization || null,
      inputPrice: round(r.input_price, 6),
      outputPrice: round(r.output_price, 6),
      blended: round(b, 6),
      contextLength: r.context_length ?? 0,
    });
  }

  const providerSpreads = [...spreadMap.values()]
    .map((entry) => {
      // Deduplicate same provider (keep lowest blended price per provider for clarity)
      const byProv = new Map();
      for (const q of entry.quotes) {
        const prev = byProv.get(q.provider);
        if (!prev || q.blended < prev.blended) {
          byProv.set(q.provider, q);
        }
      }
      const quotes = [...byProv.values()].sort((a, b) => a.blended - b.blended);
      if (quotes.length < 2) return null;
      const minBlended = quotes[0].blended;
      const maxBlended = quotes[quotes.length - 1].blended;
      return {
        modelId: entry.modelId,
        modelName: entry.modelName,
        arenaScore: entry.arenaScore,
        minBlended,
        maxBlended,
        spreadRatio: minBlended > 0 ? round(maxBlended / minBlended, 2) : 1,
        quotes,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.arenaScore ?? 0) - (a.arenaScore ?? 0) || b.quotes.length - a.quotes.length);

  // 5. Release & context timeline (matched models + notable context leaders)
  const timelineModels = latestMatched
    .filter((m) => m.contextLength > 0 && m.releaseDate)
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      releaseDate: m.releaseDate,
      firstSeenDate: m.firstSeenDate,
      contextLength: m.contextLength,
      arenaScore: m.arenaScore,
      openWeights: m.openWeights,
      blended: round(blendedPrice(m.inputPrice, m.outputPrice, 3), 6),
    }))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

  // 6. Movers: biggest price drops, price increases, and new entrants since previous snapshot
  const priceChanges = [];
  const newEntrants = [];

  if (prevDate) {
    const prevRows = new Map(
      db
        .prepare(
          `SELECT model_id, input_price, output_price, arena_score
           FROM model_snapshots
           WHERE snapshot_date = ?`,
        )
        .all(prevDate)
        .map((r) => [r.model_id, r]),
    );

    for (const m of latestMatched) {
      const prev = prevRows.get(m.id);
      const currBlended = blendedPrice(m.inputPrice, m.outputPrice, 3);
      if (!prev) {
        newEntrants.push({
          id: m.id,
          name: m.name,
          provider: m.provider,
          blended: round(currBlended, 6),
          arenaScore: m.arenaScore,
          openWeights: m.openWeights,
          firstSeenDate: m.firstSeenDate,
        });
      } else {
        const prevBlended = blendedPrice(prev.input_price, prev.output_price, 3);
        if (prevBlended > 0 && Math.abs(currBlended - prevBlended) > 1e-6) {
          const pctChange = ((currBlended - prevBlended) / prevBlended) * 100;
          priceChanges.push({
            id: m.id,
            name: m.name,
            provider: m.provider,
            prevBlended: round(prevBlended, 6),
            currBlended: round(currBlended, 6),
            pctChange: round(pctChange, 1),
            arenaScore: m.arenaScore,
            openWeights: m.openWeights,
          });
        }
      }
    }
  } else {
    // First snapshot: highlight most recently released models as recent entrants
    const recent = [...latestMatched]
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
      .slice(0, 12);
    for (const m of recent) {
      newEntrants.push({
        id: m.id,
        name: m.name,
        provider: m.provider,
        blended: round(blendedPrice(m.inputPrice, m.outputPrice, 3), 6),
        arenaScore: m.arenaScore,
        openWeights: m.openWeights,
        firstSeenDate: m.releaseDate,
      });
    }
  }

  priceChanges.sort((a, b) => a.pctChange - b.pctChange);

  const meta = {
    lastUpdated: latestSnap.fetched_at,
    snapshotDate: latestSnap.snapshot_date,
    arenaPublishDate: latestSnap.arena_publish_date,
    snapshotCount: allSnaps.length,
    matchedCount: latestMatched.length,
    arenaHistoryDates: openVsClosedSeries.length,
    providerSpreadModels: providerSpreads.length,
    sources: {
      prices: { name: "OpenRouter", url: "https://openrouter.ai" },
      quality: {
        name: "LMArena leaderboard dataset",
        url: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
        license: "CC BY 4.0",
      },
    },
  };

  const files = {
    "meta.json": meta,
    "frontier.json": {
      snapshotDate: latestDate,
      models: latestMatched,
    },
    "prices-history.json": {
      snapshotDates: allSnaps,
      thresholds,
      cheapestByThreshold,
      models: [...byModel.values()].sort((a, b) => b.latestScore - a.latestScore),
      deflationSnapshots,
    },
    "open-vs-closed.json": {
      series: openVsClosedSeries,
    },
    "providers.json": {
      snapshotDate: latestDate,
      models: providerSpreads,
    },
    "timeline.json": {
      snapshotDate: latestDate,
      models: timelineModels,
    },
    "movers.json": {
      snapshotDate: latestDate,
      previousSnapshotDate: prevDate,
      isInitialSnapshot: prevDate === null,
      drops: priceChanges.filter((c) => c.pctChange < 0),
      increases: priceChanges.filter((c) => c.pctChange > 0).reverse(),
      newEntrants,
    },
  };

  for (const [filename, payload] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, filename), JSON.stringify(payload, null, 2) + "\n");
  }

  return meta;
}
