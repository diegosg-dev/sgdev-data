import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

export const LMARENA_LATEST_URL =
  "https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/text_style_control/latest/0.parquet";

export const LMARENA_FULL_URL =
  "https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/parquet/text_style_control/full/0.parquet";

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
  return rows
    .filter((r) => r.category === "overall" && Number.isFinite(Number(r.rating)))
    .map(normalizeArenaRow)
    .sort((a, b) => b.rating - a.rating);
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
