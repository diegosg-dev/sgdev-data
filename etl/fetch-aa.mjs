const AA_FREE_MODELS_URL = "https://artificialanalysis.ai/api/v2/language/models/free";

/**
 * Fetch all pages from Artificial Analysis API v2 (/api/v2/language/models/free).
 * Requires an API key passed via options.apiKey or AA_API_KEY / ARTIFICIAL_ANALYSIS_API_KEY.
 */
export async function fetchArtificialAnalysisModels({ apiKey } = {}) {
  const key = (
    apiKey ||
    process.env.AA_API_KEY ||
    process.env.ARTIFICIAL_ANALYSIS_API_KEY ||
    ""
  ).trim();

  if (!key) {
    return { models: [], intelligenceIndexVersion: null, skipped: true };
  }

  const models = [];
  let page = 1;
  let totalPages = 1;
  let intelligenceIndexVersion = null;

  while (page <= totalPages && page <= 20) {
    const res = await fetch(`${AA_FREE_MODELS_URL}?page=${page}`, {
      headers: {
        "x-api-key": key,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Artificial Analysis API fetch failed (page ${page}): HTTP ${res.status}`);
    }
    const payload = await res.json();
    if (payload.intelligence_index_version != null) {
      intelligenceIndexVersion = payload.intelligence_index_version;
    }
    if (Array.isArray(payload.data)) {
      models.push(...payload.data);
    }
    totalPages = Number(payload.pagination?.total_pages || 1);
    if (!payload.pagination?.has_more) break;
    page++;
  }

  return { models, intelligenceIndexVersion, skipped: false };
}
