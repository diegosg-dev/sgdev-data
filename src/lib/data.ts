import fs from "node:fs";
import path from "node:path";
import type {
  FrontierData,
  MoversData,
  OpenVsClosedData,
  PricesHistoryData,
  ProvidersData,
  SiteMeta,
  TimelineData,
} from "./schema";

const DATA_DIR = path.resolve(process.cwd(), "public", "data");

function readJson<T>(filename: string): T {
  const fullPath = path.join(DATA_DIR, filename);
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
}

export function loadMeta(): SiteMeta {
  return readJson<SiteMeta>("meta.json");
}

export function loadFrontier(): FrontierData {
  return readJson<FrontierData>("frontier.json");
}

export function loadPricesHistory(): PricesHistoryData {
  return readJson<PricesHistoryData>("prices-history.json");
}

export function loadOpenVsClosed(): OpenVsClosedData {
  return readJson<OpenVsClosedData>("open-vs-closed.json");
}

export function loadProviders(): ProvidersData {
  return readJson<ProvidersData>("providers.json");
}

export function loadTimeline(): TimelineData {
  return readJson<TimelineData>("timeline.json");
}

export function loadMovers(): MoversData {
  return readJson<MoversData>("movers.json");
}
