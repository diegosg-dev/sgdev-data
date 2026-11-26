import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Verify exported public/data/*.json conforms to expected schema and analytics invariants
const DATA_DIR = path.resolve(process.cwd(), "public", "data");

test("exported static JSON files satisfy schema invariants", () => {
  const meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "meta.json"), "utf8"));
  assert.ok(typeof meta.lastUpdated === "string");
  assert.ok(meta.matchedCount > 0);
  assert.equal(meta.sources.prices.name, "OpenRouter");
  assert.equal(meta.sources.quality.license, "CC BY 4.0");

  const frontier = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "frontier.json"), "utf8"));
  assert.equal(frontier.models.length, meta.matchedCount);
  for (const m of frontier.models) {
    assert.ok(typeof m.id === "string" && m.id.length > 0);
    assert.ok(typeof m.inputPrice === "number" && m.inputPrice >= 0);
    assert.ok(typeof m.outputPrice === "number" && m.outputPrice >= 0);
    assert.ok(typeof m.arenaScore === "number" && m.arenaScore > 800);
    assert.ok(typeof m.openWeights === "boolean");
  }

  const ovc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "open-vs-closed.json"), "utf8"));
  assert.ok(ovc.series.length > 10, "expected backfilled LMArena history");
  for (const p of ovc.series) {
    assert.ok(typeof p.bestClosedScore === "number");
    assert.ok(typeof p.bestOpenScore === "number");
  }

  const providers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "providers.json"), "utf8"));
  assert.ok(providers.models.length > 0, "expected multi-provider open models");
  for (const pm of providers.models) {
    assert.ok(pm.quotes.length >= 2);
    assert.ok(pm.maxBlended >= pm.minBlended);
  }

  const speedIntel = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "speed-intelligence.json"), "utf8"),
  );
  assert.ok(speedIntel.models.length > 0, "expected Artificial Analysis speed/intelligence models");
  for (const sm of speedIntel.models) {
    assert.ok(typeof sm.slug === "string" && sm.slug.length > 0);
    assert.ok(sm.intelligenceIndex != null || sm.tokensPerSecond != null);
  }
});
