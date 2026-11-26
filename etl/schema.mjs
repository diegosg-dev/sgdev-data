import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_date TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  arena_publish_date TEXT,
  openrouter_count INTEGER NOT NULL,
  arena_count INTEGER NOT NULL,
  matched_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_snapshots (
  snapshot_date TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_price REAL NOT NULL,
  output_price REAL NOT NULL,
  context_length INTEGER,
  arena_score REAL,
  arena_model TEXT,
  arena_organization TEXT,
  arena_license TEXT,
  open_weights INTEGER NOT NULL DEFAULT 0,
  first_seen_date TEXT NOT NULL,
  source_created_at INTEGER,
  match_method TEXT,
  PRIMARY KEY (snapshot_date, model_id)
);

CREATE INDEX IF NOT EXISTS idx_model_snapshots_model
  ON model_snapshots (model_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_model_snapshots_date_score
  ON model_snapshots (snapshot_date, arena_score);

CREATE TABLE IF NOT EXISTS arena_history (
  publish_date TEXT NOT NULL,
  arena_model TEXT NOT NULL,
  organization TEXT,
  license TEXT,
  rating REAL NOT NULL,
  open_weights INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publish_date, arena_model)
);

CREATE INDEX IF NOT EXISTS idx_arena_history_date
  ON arena_history (publish_date, open_weights, rating);

CREATE TABLE IF NOT EXISTS provider_quotes (
  snapshot_date TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  input_price REAL NOT NULL,
  output_price REAL NOT NULL,
  quantization TEXT NOT NULL DEFAULT '',
  context_length INTEGER,
  PRIMARY KEY (snapshot_date, model_id, provider_name, quantization)
);

CREATE INDEX IF NOT EXISTS idx_provider_quotes_date_model
  ON provider_quotes (snapshot_date, model_id);

CREATE TABLE IF NOT EXISTS aa_snapshots (
  snapshot_date TEXT NOT NULL,
  aa_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  creator TEXT NOT NULL,
  release_date TEXT,
  intelligence_index REAL,
  coding_index REAL,
  agentic_index REAL,
  input_price REAL,
  output_price REAL,
  cache_hit_price REAL,
  tokens_per_second REAL,
  ttft_seconds REAL,
  e2e_seconds REAL,
  PRIMARY KEY (snapshot_date, aa_id)
);

CREATE INDEX IF NOT EXISTS idx_aa_snapshots_date_slug
  ON aa_snapshots (snapshot_date, slug);
`;

export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(SCHEMA_SQL);
  return db;
}
