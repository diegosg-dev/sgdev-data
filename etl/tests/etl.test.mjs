import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonicalizeModelKey,
  extractProvider,
  isOpenWeights,
  pricePerTokenToPerMillion,
} from "../normalize.mjs";
import { isRoutingAlias, matchModels, stripEffortSuffix } from "../matcher.mjs";
import { runEtl } from "../run.mjs";

test("pricePerTokenToPerMillion converts USD/token to USD/1M accurately", () => {
  assert.equal(pricePerTokenToPerMillion("0.000005"), 5);
  assert.equal(pricePerTokenToPerMillion("0.00000014"), 0.14);
  assert.equal(pricePerTokenToPerMillion("0"), 0);
  assert.equal(pricePerTokenToPerMillion("-1"), null);
  assert.equal(pricePerTokenToPerMillion(null), null);
  assert.equal(pricePerTokenToPerMillion("not-a-number"), null);
});

test("isOpenWeights classifies Proprietary vs open licenses and HF ids", () => {
  assert.equal(isOpenWeights({ license: "Proprietary" }), false);
  assert.equal(isOpenWeights({ license: "Apache 2.0" }), true);
  assert.equal(isOpenWeights({ license: "MIT" }), true);
  assert.equal(isOpenWeights({ license: null, huggingFaceId: "meta-llama/Llama-3.3-70B" }), true);
  assert.equal(isOpenWeights({ license: null, huggingFaceId: null }), false);
});

test("extractProvider maps known slugs and capitalizes unknown ones", () => {
  assert.equal(extractProvider("anthropic/claude-opus-4.6"), "Anthropic");
  assert.equal(extractProvider("openai/gpt-4o-mini"), "OpenAI");
  assert.equal(extractProvider("meta-llama/llama-3.3-70b-instruct"), "Meta");
  assert.equal(extractProvider("custom-lab/model-x"), "Custom Lab");
});

test("isRoutingAlias filters :free, :batch, :nitro, and openrouter/* aliases", () => {
  assert.equal(isRoutingAlias("openrouter/auto"), true);
  assert.equal(isRoutingAlias("google/gemini-3.1-pro-preview:batch"), true);
  assert.equal(isRoutingAlias("deepseek/deepseek-r1:free"), true);
  assert.equal(isRoutingAlias("anthropic/claude-opus-4.6"), false);
});

test("matchModels is conservative: respects overrides and avoids false merges", () => {
  const orModels = [
    { id: "openai/gpt-4o", name: "OpenAI: GPT-4o" },
    { id: "openai/gpt-4o-mini", name: "OpenAI: GPT-4o Mini" },
    { id: "openai/gpt-4o:batch", name: "OpenAI: GPT-4o (batch)" },
    { id: "vendor/custom-alias", name: "Vendor: Custom" },
  ];
  const arenaRows = [
    { model_name: "GPT-4o", organization: "openai", license: "Proprietary", rating: 1400 },
    { model_name: "Vendor Special 1", organization: "vendor", license: "MIT", rating: 1350 },
  ];

  const { matched, unmatchedOpenRouter } = matchModels(orModels, arenaRows, {
    "vendor/custom-alias": "Vendor Special 1",
  });

  assert.equal(matched.length, 2);
  assert.equal(matched[0].openRouter.id, "openai/gpt-4o");
  assert.equal(matched[0].matchMethod, "exact");
  assert.equal(matched[1].openRouter.id, "vendor/custom-alias");
  assert.equal(matched[1].matchMethod, "override");

  // gpt-4o-mini must NOT falsely match GPT-4o
  assert.ok(unmatchedOpenRouter.some((m) => m.id === "openai/gpt-4o-mini"));
  // :batch alias must be skipped completely
  assert.ok(!matched.some((m) => m.openRouter.id.endsWith(":batch")));
});

test("canonicalizeModelKey normalizes decimal versions without collapsing distinct variants", () => {
  assert.equal(canonicalizeModelKey("anthropic/claude-3.5-sonnet"), "claude-3-5-sonnet");
  assert.equal(canonicalizeModelKey("Claude 3.5 Sonnet"), "claude-3-5-sonnet");
  assert.notEqual(canonicalizeModelKey("gpt-4o"), canonicalizeModelKey("gpt-4o-mini"));
});

test("matchModels matches Arena reasoning-effort variants to base OpenRouter IDs", () => {
  assert.equal(stripEffortSuffix("gemini-4-carbon-high"), "gemini-4-carbon");
  assert.equal(stripEffortSuffix("claude-fable-5-2-max"), "claude-fable-5-2");

  const orModels = [
    { id: "google/gemini-4-carbon", name: "Google: Gemini 4 Carbon" },
    { id: "anthropic/claude-opus-5.5", name: "Anthropic: Claude Opus 5.5" },
  ];
  const arenaRows = [
    { model_name: "Gemini 4 Carbon (High)", organization: "google", license: "Proprietary", rating: 1526.5 },
    { model_name: "Claude Opus 5.5 (High)", organization: "anthropic", license: "Proprietary", rating: 1507.0 },
    { model_name: "Claude Opus 5.5 (Medium)", organization: "anthropic", license: "Proprietary", rating: 1495.0 },
  ];

  const { matched } = matchModels(orModels, arenaRows, {});
  assert.equal(matched.length, 2);
  assert.equal(matched[0].arena.model_name, "Gemini 4 Carbon (High)");
  assert.equal(matched[0].matchMethod, "effort-variant");
  assert.equal(matched[1].arena.model_name, "Claude Opus 5.5 (High)");
});

test("fixture ETL runs end-to-end, is idempotent, and never leaks raw OpenRouter catalog", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sgdev-etl-test-"));
  const dbPath = path.join(tmpDir, "test.sqlite");
  const outDir = path.join(tmpDir, "public-data");

  try {
    const res1 = await runEtl({
      fixture: true,
      dbPath,
      outDir,
      unmatchedPath: null,
      snapshotDate: "2026-11-20",
    });
    assert.ok(res1.meta.matchedCount > 0, "expected matched models from fixture");
    assert.ok(res1.meta.arenaHistoryDates > 0, "expected backfilled arena history");

    // Re-running on same date must be idempotent
    const res2 = await runEtl({
      fixture: true,
      dbPath,
      outDir,
      unmatchedPath: null,
      snapshotDate: "2026-11-20",
    });
    assert.equal(res2.meta.snapshotCount, 1);
    assert.equal(res2.meta.matchedCount, res1.meta.matchedCount);

    // Running a second snapshot date should record 2 snapshots
    const res3 = await runEtl({
      fixture: true,
      dbPath,
      outDir,
      unmatchedPath: null,
      snapshotDate: "2026-11-26",
    });
    assert.equal(res3.meta.snapshotCount, 2);

    // Verify all expected JSON files exist
    for (const file of [
      "meta.json",
      "frontier.json",
      "prices-history.json",
      "open-vs-closed.json",
      "providers.json",
      "timeline.json",
      "movers.json",
    ]) {
      assert.ok(fs.existsSync(path.join(outDir, file)), `missing ${file}`);
    }

    // Verify raw OpenRouter catalog fields are never exposed
    const frontierJson = fs.readFileSync(path.join(outDir, "frontier.json"), "utf8");
    assert.ok(!frontierJson.includes("supported_parameters"));
    assert.ok(!frontierJson.includes("per_request_limits"));
    assert.ok(!frontierJson.includes("top_provider"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
