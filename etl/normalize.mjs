const PROVIDER_LABELS = new Map([
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["google", "Google"],
  ["meta-llama", "Meta"],
  ["deepseek", "DeepSeek"],
  ["qwen", "Qwen"],
  ["mistralai", "Mistral"],
  ["x-ai", "xAI"],
  ["cohere", "Cohere"],
  ["nvidia", "NVIDIA"],
  ["amazon", "Amazon"],
  ["microsoft", "Microsoft"],
  ["moonshotai", "Moonshot"],
  ["z-ai", "Z.ai"],
  ["minimax", "MiniMax"],
  ["baidu", "Baidu"],
  ["bytedance-seed", "ByteDance"],
  ["bytedance", "ByteDance"],
  ["tencent", "Tencent"],
  ["stepfun", "StepFun"],
  ["upstage", "Upstage"],
  ["allenai", "Ai2"],
  ["ibm-granite", "IBM"],
  ["perplexity", "Perplexity"],
  ["nousresearch", "Nous"],
  ["liquid", "Liquid"],
  ["inflection", "Inflection"],
  ["ai21", "AI21"],
  ["xiaomi", "Xiaomi"],
  ["rekaai", "Reka"],
  ["essentialai", "Essential AI"],
  ["arcee-ai", "Arcee"],
  ["inception", "Inception"],
  ["writer", "Writer"],
]);

/**
 * Convert USD-per-token string/number from OpenRouter into USD per 1M tokens.
 * Returns null if invalid or negative (OpenRouter uses "-1" for variable/router pricing).
 */
export function pricePerTokenToPerMillion(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  // Round to 6 decimal places to avoid IEEE 754 float noise (e.g. 0.14000000000000001)
  return Math.round(n * 1_000_000 * 1_000_000) / 1_000_000;
}

/**
 * Extract human-friendly provider display name from OpenRouter model id.
 */
export function extractProvider(modelId) {
  const slug = String(modelId || "").split("/")[0].toLowerCase();
  if (PROVIDER_LABELS.has(slug)) return PROVIDER_LABELS.get(slug);
  if (!slug) return "Unknown";
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

const PROPRIETARY_LICENSES = new Set([
  "proprietary",
  "closed",
  "commercial",
  "unknown",
  "",
]);

/**
 * Determine if a model has open weights.
 * Prefers LMArena license when available; falls back to OpenRouter hugging_face_id.
 */
export function isOpenWeights({ license, huggingFaceId } = {}) {
  if (typeof license === "string" && license.trim().length > 0) {
    return !PROPRIETARY_LICENSES.has(license.trim().toLowerCase());
  }
  if (typeof huggingFaceId === "string" && huggingFaceId.trim().length > 0) {
    return true;
  }
  return false;
}

/**
 * Conservative canonicalization for exact/normalized model-name matching.
 * Preserves version numbers, sizes, and variant tokens (mini, flash, pro, thinking, etc.).
 */
export function canonicalizeModelKey(raw) {
  if (!raw) return "";
  let s = String(raw).toLowerCase().trim();
  // Strip OpenRouter org prefix if present ("anthropic/claude-..." -> "claude-...")
  if (s.includes("/")) {
    s = s.slice(s.indexOf("/") + 1);
  }
  // Remove ":variant" suffix only if explicitly handled outside, otherwise keep
  // Normalize decimal versions like "3.5" -> "3-5" so "claude-3.5" matches "claude-3-5"
  s = s.replace(/(\d)\.(\d)/g, "$1-$2");
  // Normalize parentheses and punctuation to dashes
  s = s.replace(/[()[\]_.:/]+/g, "-");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s;
}

/**
 * Strip trailing YYYYMMDD or YYYY-MM-DD or MMDD date stamp from a canonical key.
 */
export function stripDateSuffix(key) {
  return key
    .replace(/-(?:20\d{2}-?\d{2}-?\d{2})$/, "")
    .replace(/-(?:20\d{2}-?\d{2})$/, "")
    .replace(/-(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/, "")
    .replace(/-preview$/, "")
    .replace(/-instruct$/, "")
    .replace(/-it$/, "");
}

/**
 * Convert Unix seconds timestamp to ISO YYYY-MM-DD, or null.
 */
export function unixSecondsToIsoDate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}
