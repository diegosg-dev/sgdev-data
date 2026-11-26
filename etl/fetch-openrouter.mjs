const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function fetchOpenRouterModels() {
  const res = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter models fetch failed: HTTP ${res.status}`);
  }
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("Unexpected OpenRouter response: missing data array");
  }
  return payload.data;
}

/**
 * Fetch per-provider endpoint pricing for selected open-weights models.
 * Returns a map of modelId -> endpoints[].
 */
export async function fetchProviderEndpoints(modelIds, { concurrency = 6 } = {}) {
  const results = new Map();
  let idx = 0;

  async function worker() {
    while (idx < modelIds.length) {
      const current = modelIds[idx++];
      try {
        const url = `https://openrouter.ai/api/v1/models/${current}/endpoints`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const json = await res.json();
        const endpoints = json?.data?.endpoints;
        if (Array.isArray(endpoints) && endpoints.length > 0) {
          results.set(current, endpoints);
        }
      } catch {
        // Non-fatal: individual model endpoint lookup can fail without breaking ETL
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, modelIds.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
