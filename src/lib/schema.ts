export interface SiteMeta {
  lastUpdated: string;
  snapshotDate: string;
  arenaPublishDate: string | null;
  snapshotCount: number;
  matchedCount: number;
  aaCount?: number;
  arenaHistoryDates: number;
  providerSpreadModels: number;
  sources: {
    prices: { name: string; url: string };
    quality: { name: string; url: string; license: string };
    speedAndIntelligence?: { name: string; url: string };
  };
}

export interface FrontierModel {
  id: string;
  name: string;
  provider: string;
  inputPrice: number;
  outputPrice: number;
  contextLength: number;
  arenaScore: number;
  arenaModel: string;
  openWeights: boolean;
  firstSeenDate: string;
  releaseDate: string;
  aaIntelligenceIndex?: number | null;
  tokensPerSecond?: number | null;
  ttftSeconds?: number | null;
}

export interface SpeedIntelligenceModel {
  id: string;
  slug: string;
  name: string;
  creator: string;
  releaseDate: string | null;
  intelligenceIndex: number | null;
  codingIndex: number | null;
  agenticIndex: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  blended: number | null;
  tokensPerSecond: number | null;
  ttftSeconds: number | null;
  e2eSeconds: number | null;
}

export interface SpeedIntelligenceData {
  snapshotDate: string;
  models: SpeedIntelligenceModel[];
}

export interface FrontierData {
  snapshotDate: string;
  models: FrontierModel[];
}

export interface ModelPricePoint {
  date: string;
  inputPrice: number;
  outputPrice: number;
  blended: number;
  arenaScore: number;
}

export interface ModelPriceSeries {
  id: string;
  name: string;
  provider: string;
  openWeights: boolean;
  latestScore: number;
  points: ModelPricePoint[];
}

export interface CheapestThresholdPoint {
  date: string;
  threshold: number;
  blended: number;
  modelId: string;
  modelName: string;
  arenaScore: number;
  openWeights: boolean;
}

export interface DeflationSnapshotModel {
  id: string;
  name: string;
  inputPrice: number;
  outputPrice: number;
  arenaScore: number;
  openWeights: boolean;
}

export interface DeflationSnapshot {
  date: string;
  models: DeflationSnapshotModel[];
}

export interface PricesHistoryData {
  snapshotDates: string[];
  thresholds: number[];
  cheapestByThreshold: CheapestThresholdPoint[];
  models: ModelPriceSeries[];
  deflationSnapshots: DeflationSnapshot[];
}

export interface OpenVsClosedPoint {
  date: string;
  bestClosedScore: number;
  bestClosedModel: string;
  bestOpenScore: number;
  bestOpenModel: string;
  gap: number;
}

export interface OpenVsClosedData {
  series: OpenVsClosedPoint[];
}

export interface ProviderQuote {
  provider: string;
  quantization: string | null;
  inputPrice: number;
  outputPrice: number;
  blended: number;
  contextLength: number;
}

export interface ProviderSpreadModel {
  modelId: string;
  modelName: string;
  arenaScore: number | null;
  minBlended: number;
  maxBlended: number;
  spreadRatio: number;
  quotes: ProviderQuote[];
}

export interface ProvidersData {
  snapshotDate: string;
  models: ProviderSpreadModel[];
}

export interface TimelineModel {
  id: string;
  name: string;
  provider: string;
  releaseDate: string;
  firstSeenDate: string;
  contextLength: number;
  arenaScore: number;
  openWeights: boolean;
  blended: number;
}

export interface TimelineData {
  snapshotDate: string;
  models: TimelineModel[];
}

export interface PriceChangeMover {
  id: string;
  name: string;
  provider: string;
  prevBlended: number;
  currBlended: number;
  pctChange: number;
  arenaScore: number;
  openWeights: boolean;
}

export interface NewEntrantMover {
  id: string;
  name: string;
  provider: string;
  blended: number;
  arenaScore: number;
  openWeights: boolean;
  firstSeenDate: string;
}

export interface MoversData {
  snapshotDate: string;
  previousSnapshotDate: string | null;
  isInitialSnapshot: boolean;
  drops: PriceChangeMover[];
  increases: PriceChangeMover[];
  newEntrants: NewEntrantMover[];
}

export type TaskPresetId = "chat" | "coding" | "pdf" | "agent";

export interface TaskPreset {
  id: TaskPresetId;
  label: string;
  description: string;
  inputTokens: number;
  outputTokens: number;
  unitLabel: string;
}
