import { canonicalizeModelKey, stripDateSuffix } from "./normalize.mjs";

const SKIP_SUFFIXES = [":free", ":extended", ":nitro", ":floor", ":online", ":exacto", ":batch"];
const SKIP_PREFIXES = ["openrouter/", "~"];

const EFFORT_SUFFIX_RE =
  /-(?:high|max|xhigh|medium|low|minimal|none|thinking|reasoning|non-reasoning|adaptive|default-fallback|effort)$/g;

/**
 * Strip trailing reasoning-effort tags (e.g. "-high", "-max", "-xhigh", "-thinking")
 * without touching model version numbers or size/tier tags (like "mini", "flash", "pro").
 */
export function stripEffortSuffix(key) {
  let prev = key;
  for (let i = 0; i < 3; i++) {
    const next = prev.replace(EFFORT_SUFFIX_RE, "");
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

/**
 * Return true if an OpenRouter model entry is a routing alias or non-priced variant
 * that should be excluded from primary 1-to-1 Arena matching.
 */
export function isRoutingAlias(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (SKIP_PREFIXES.some((p) => id.startsWith(p))) return true;
  if (SKIP_SUFFIXES.some((s) => id.endsWith(s))) return true;
  return false;
}

/**
 * Conservative matcher joining OpenRouter models to LMArena text_style_control overall rows.
 *
 * Strategy (in strict precedence):
 *  1. Explicit manual override in data/match-overrides.json (`overrides[openRouterId] = arenaModelName`).
 *  2. Exact canonical key match (e.g. `openai/gpt-4o-mini` -> `gpt-4o-mini` === `gpt-4o-mini`).
 *  3. Exact stripped-date/instruct key match when it resolves uniquely to one Arena model.
 *  4. Conservative reasoning-effort suffix match: if OpenRouter has `google/gemini-4-carbon`
 *     and LMArena has `Gemini 4 Carbon (High)`, match to the highest-rated effort variant
 *     with the exact same base canonical key (never merges distinct sizes/tiers like `mini` vs base).
 */
export function matchModels(openRouterModels, arenaRows, overrides = {}) {
  const arenaByExactName = new Map();
  const arenaByCanonical = new Map();
  const arenaByStripped = new Map();
  const arenaByEffortBase = new Map();

  for (const row of arenaRows) {
    const name = String(row.model_name || "").trim();
    if (!name) continue;
    arenaByExactName.set(name, row);
    arenaByExactName.set(name.toLowerCase(), row);

    const key = canonicalizeModelKey(name);
    if (key && !arenaByCanonical.has(key)) {
      arenaByCanonical.set(key, row);
    }

    const stripped = stripDateSuffix(key);
    if (stripped) {
      const list = arenaByStripped.get(stripped) || [];
      list.push(row);
      arenaByStripped.set(stripped, list);
    }

    const effortBase = stripDateSuffix(stripEffortSuffix(key));
    if (effortBase && effortBase !== key) {
      const existing = arenaByEffortBase.get(effortBase);
      if (!existing || row.rating > existing.rating) {
        arenaByEffortBase.set(effortBase, row);
      }
    }
  }

  const matched = [];
  const unmatchedOpenRouter = [];
  const matchedArenaNames = new Set();

  for (const model of openRouterModels) {
    const id = String(model.id || "").trim();
    if (!id || isRoutingAlias(id)) continue;

    let arena = null;
    let matchMethod = null;

    // 1. Explicit override
    const overrideTarget = overrides[id];
    if (overrideTarget) {
      arena =
        arenaByExactName.get(overrideTarget) ||
        arenaByExactName.get(String(overrideTarget).toLowerCase()) ||
        null;
      if (arena) {
        matchMethod = "override";
      }
    }

    // 2. Exact canonical match on id, canonical_slug, or stripped display name
    if (!arena) {
      const candidates = [
        canonicalizeModelKey(id),
        model.canonical_slug ? canonicalizeModelKey(model.canonical_slug) : "",
        model.name ? canonicalizeModelKey(String(model.name).replace(/^[^:]+:\s*/, "")) : "",
      ].filter(Boolean);

      for (const c of candidates) {
        if (arenaByCanonical.has(c)) {
          arena = arenaByCanonical.get(c);
          matchMethod = "exact";
          break;
        }
      }
    }

    // 3. Unique stripped-date/instruct match
    if (!arena) {
      const candidates = [
        stripDateSuffix(canonicalizeModelKey(id)),
        model.canonical_slug ? stripDateSuffix(canonicalizeModelKey(model.canonical_slug)) : "",
      ].filter(Boolean);

      for (const c of candidates) {
        const hits = arenaByStripped.get(c);
        if (hits && hits.length === 1) {
          arena = hits[0];
          matchMethod = "normalized";
          break;
        }
      }
    }

    // 4. Conservative effort-variant match (e.g. `google/gemini-4-carbon` -> `Gemini 4 Carbon (High)`)
    if (!arena) {
      const candidates = [
        stripDateSuffix(stripEffortSuffix(canonicalizeModelKey(id))),
        model.canonical_slug
          ? stripDateSuffix(stripEffortSuffix(canonicalizeModelKey(model.canonical_slug)))
          : "",
      ].filter(Boolean);

      for (const c of candidates) {
        if (arenaByEffortBase.has(c)) {
          arena = arenaByEffortBase.get(c);
          matchMethod = "effort-variant";
          break;
        }
      }
    }

    if (arena) {
      matchedArenaNames.add(arena.model_name);
      matched.push({
        openRouter: model,
        arena,
        matchMethod,
      });
    } else {
      unmatchedOpenRouter.push({
        id,
        name: model.name || id,
        canonicalKey: canonicalizeModelKey(id),
      });
    }
  }

  const unmatchedArena = arenaRows
    .filter((r) => !matchedArenaNames.has(r.model_name))
    .map((r) => ({
      model_name: r.model_name,
      organization: r.organization || null,
      rating: r.rating,
      canonicalKey: canonicalizeModelKey(r.model_name),
    }))
    .sort((a, b) => b.rating - a.rating);

  return {
    matched,
    unmatchedOpenRouter,
    unmatchedArena,
  };
}
