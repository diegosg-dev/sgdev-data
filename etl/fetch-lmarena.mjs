import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

export const LMARENA_LATEST_URL =
  "https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/text_style_control/latest/0.parquet";

export const LMARENA_FULL_URL =
  "https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/text_style_control/full/0.parquet";

export const ARENA_EXTRA_CATEGORIES = [
  "coding",
  "math",
  "hard_prompts",
  "creative_writing",
  "instruction_following",
  "multi_turn",
  "expert",
];

const WANTED_CATEGORIES = new Set(["overall", ...ARENA_EXTRA_CATEGORIES]);

async function fetchParquetRows(url, columns) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`LMArena parquet fetch failed (${url}): HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return parquetReadObjects({
    file: buf,
    compressors,
    ...(columns ? { columns } : {}),
  });
}

function normalizeArenaRow(row) {
  return {
    model_name: String(row.model_name || "").trim(),
    organization: row.organization ? String(row.organization).trim() : null,
    license: row.license ? String(row.license).trim() : null,
    rating: Number(row.rating),
    rating_lower: row.rating_lower != null ? Number(row.rating_lower) : null,
    rating_upper: row.rating_upper != null ? Number(row.rating_upper) : null,
    vote_count: row.vote_count != null ? Number(row.vote_count) : null,
    rank: row.rank != null ? Number(row.rank) : null,
    category: String(row.category || "").trim(),
    leaderboard_publish_date: row.leaderboard_publish_date
      ? String(row.leaderboard_publish_date).slice(0, 10)
      : null,
  };
}

/**
 * Fetch latest LMArena text_style_control overall rows, with per-category ratings attached
 * on each model (`categories: { coding, math, hard_prompts, ... }`).
 */
export async function fetchLmArenaLatest() {
  const rows = await fetchParquetRows(LMARENA_LATEST_URL, [
    "model_name",
    "organization",
    "license",
    "rating",
    "rating_lower",
    "rating_upper",
    "vote_count",
    "rank",
    "category",
    "leaderboard_publish_date",
  ]);

  const categoriesByModel = new Map();
  const overall = [];

  for (const raw of rows) {
    const cat = String(raw.category || "").trim();
    if (!WANTED_CATEGORIES.has(cat)) continue;
    if (!Number.isFinite(Number(raw.rating))) continue;

    const norm = normalizeArenaRow(raw);
    if (cat === "overall") {
      overall.push(norm);
    } else {
      if (!categoriesByModel.has(norm.model_name)) {
        categoriesByModel.set(norm.model_name, {});
      }
      categoriesByModel.get(norm.model_name)[cat] = Math.round(norm.rating * 10) / 10;
    }
  }

  for (const row of overall) {
    row.categories = categoriesByModel.get(row.model_name) || {};
  }

  return overall.sort((a, b) => b.rating - a.rating);
}

export async function fetchLmArenaHistory() {
  const rows = await fetchParquetRows(LMARENA_FULL_URL, [
    "model_name",
    "organization",
    "license",
    "rating",
    "category",
    "leaderboard_publish_date",
  ]);
  return rows
    .filter(
      (r) =>
        r.category === "overall" &&
        r.leaderboard_publish_date &&
        Number.isFinite(Number(r.rating)),
    )
    .map(normalizeArenaRow);
}
