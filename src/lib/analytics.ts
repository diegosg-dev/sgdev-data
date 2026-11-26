import type {
  DeflationSnapshot,
  FrontierModel,
  TaskPreset,
  TaskPresetId,
} from "./schema";

export const TASK_PRESETS: TaskPreset[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Short Q&A turn (1.5k in / 500 out)",
    inputTokens: 1_500,
    outputTokens: 500,
    unitLabel: "chat turns",
  },
  {
    id: "coding",
    label: "Coding",
    description: "Repo context + patch (6k in / 2k out)",
    inputTokens: 6_000,
    outputTokens: 2_000,
    unitLabel: "coding tasks",
  },
  {
    id: "pdf",
    label: "Summarise PDF",
    description: "Long doc ingest + brief (25k in / 1.5k out)",
    inputTokens: 25_000,
    outputTokens: 1_500,
    unitLabel: "PDF summaries",
  },
  {
    id: "agent",
    label: "Agent loop",
    description: "Multi-step tool run (40k in / 6k out)",
    inputTokens: 40_000,
    outputTokens: 6_000,
    unitLabel: "agent runs",
  },
];

export function getPreset(id: TaskPresetId | string): TaskPreset {
  return TASK_PRESETS.find((p) => p.id === id) ?? TASK_PRESETS[0];
}

/**
 * Blended USD per 1M tokens at an input:output ratio (default 3:1).
 */
export function blendedPrice(
  inputPrice: number,
  outputPrice: number,
  inputRatio = 3,
): number {
  const r = Math.max(0.1, inputRatio);
  return (inputPrice * r + outputPrice) / (r + 1);
}

export interface FrontierPoint extends FrontierModel {
  blended: number;
  onFrontier: boolean;
}

/**
 * Compute Pareto-optimal best-value frontier (ascending blended price, strictly rising Arena score).
 * Only models with blended > 0 are placed on the log-price frontier.
 */
export function computeParetoFrontier(
  models: FrontierModel[],
  inputRatio = 3,
): { points: FrontierPoint[]; frontier: FrontierPoint[] } {
  const priced = models
    .map((m) => ({
      ...m,
      blended: blendedPrice(m.inputPrice, m.outputPrice, inputRatio),
      onFrontier: false,
    }))
    .filter((m) => Number.isFinite(m.blended) && m.blended > 0);

  const sorted = [...priced].sort(
    (a, b) => a.blended - b.blended || b.arenaScore - a.arenaScore,
  );

  const frontier: FrontierPoint[] = [];
  let maxScore = -Infinity;
  for (const pt of sorted) {
    if (pt.arenaScore > maxScore) {
      pt.onFrontier = true;
      frontier.push(pt);
      maxScore = pt.arenaScore;
    }
  }

  return { points: priced, frontier };
}

export function costPerRun(
  inputPrice: number,
  outputPrice: number,
  preset: TaskPreset,
): number {
  return (
    (preset.inputTokens / 1_000_000) * inputPrice +
    (preset.outputTokens / 1_000_000) * outputPrice
  );
}

export function monthlyCostForModel(
  model: { inputPrice: number; outputPrice: number },
  preset: TaskPreset,
  monthlyRuns: number,
): number {
  return costPerRun(model.inputPrice, model.outputPrice, preset) * monthlyRuns;
}

export interface GoodEnoughResult {
  winner: (FrontierModel & { monthlyCost: number; blended: number }) | null;
  alternatives: (FrontierModel & { monthlyCost: number; blended: number })[];
  premiumBaseline: (FrontierModel & { monthlyCost: number; blended: number }) | null;
  monthlySavings: number;
  savingsPct: number;
}

/**
 * Find the cheapest model clearing minScore for a given task preset & monthly volume.
 * Compares against a premium closed frontier baseline (highest-scoring closed model).
 */
export function solveGoodEnough(params: {
  models: FrontierModel[];
  preset: TaskPreset;
  monthlyRuns: number;
  minScore: number;
  openOnly: boolean;
}): GoodEnoughResult {
  const { models, preset, monthlyRuns, minScore, openOnly } = params;
  const ratio = preset.inputTokens / Math.max(1, preset.outputTokens);

  const priced = models
    .filter((m) => m.inputPrice > 0 || m.outputPrice > 0)
    .map((m) => ({
      ...m,
      blended: blendedPrice(m.inputPrice, m.outputPrice, ratio),
      monthlyCost: monthlyCostForModel(m, preset, monthlyRuns),
    }));

  // Premium baseline: highest-scoring closed model (or overall top model)
  const closedSorted = [...priced]
    .filter((m) => !m.openWeights)
    .sort((a, b) => b.arenaScore - a.arenaScore || b.monthlyCost - a.monthlyCost);
  const premiumBaseline = closedSorted[0] ?? priced[0] ?? null;

  const eligible = priced
    .filter((m) => m.arenaScore >= minScore && (!openOnly || m.openWeights))
    .sort((a, b) => a.monthlyCost - b.monthlyCost || b.arenaScore - a.arenaScore);

  if (eligible.length === 0) {
    return {
      winner: null,
      alternatives: [],
      premiumBaseline,
      monthlySavings: 0,
      savingsPct: 0,
    };
  }

  const winner = eligible[0];
  const alternatives = eligible.slice(1, 6);
  const monthlySavings = premiumBaseline
    ? Math.max(0, premiumBaseline.monthlyCost - winner.monthlyCost)
    : 0;
  const savingsPct =
    premiumBaseline && premiumBaseline.monthlyCost > 0
      ? (monthlySavings / premiumBaseline.monthlyCost) * 100
      : 0;

  return {
    winner,
    alternatives,
    premiumBaseline,
    monthlySavings,
    savingsPct,
  };
}

export interface DeflationPoint {
  date: string;
  monthlyCost: number;
  modelId: string;
  modelName: string;
  arenaScore: number;
}

export function computeDeflationSeries(params: {
  snapshots: DeflationSnapshot[];
  preset: TaskPreset;
  monthlyRuns: number;
  minScore: number;
  openOnly: boolean;
}): DeflationPoint[] {
  const { snapshots, preset, monthlyRuns, minScore, openOnly } = params;
  const out: DeflationPoint[] = [];

  for (const snap of snapshots) {
    const eligible = snap.models
      .filter(
        (m) =>
          m.arenaScore >= minScore &&
          (!openOnly || m.openWeights) &&
          (m.inputPrice > 0 || m.outputPrice > 0),
      )
      .map((m) => ({
        ...m,
        monthlyCost: monthlyCostForModel(m, preset, monthlyRuns),
      }))
      .sort((a, b) => a.monthlyCost - b.monthlyCost);

    if (eligible.length > 0) {
      out.push({
        date: snap.date,
        monthlyCost: eligible[0].monthlyCost,
        modelId: eligible[0].id,
        modelName: eligible[0].name,
        arenaScore: eligible[0].arenaScore,
      });
    }
  }

  return out;
}

export interface DollarBuysRow {
  id: string;
  name: string;
  provider: string;
  openWeights: boolean;
  arenaScore: number;
  blended: number;
  tokensPerDollar: number;
  runsPerDollar: number;
}

export function computeDollarBuys(
  models: FrontierModel[],
  preset: TaskPreset,
): DollarBuysRow[] {
  const tokensPerRun = preset.inputTokens + preset.outputTokens;
  const ratio = preset.inputTokens / Math.max(1, preset.outputTokens);

  return models
    .filter((m) => m.inputPrice > 0 || m.outputPrice > 0)
    .map((m) => {
      const cpr = costPerRun(m.inputPrice, m.outputPrice, preset);
      const runsPerDollar = cpr > 0 ? 1 / cpr : 0;
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        openWeights: m.openWeights,
        arenaScore: m.arenaScore,
        blended: blendedPrice(m.inputPrice, m.outputPrice, ratio),
        tokensPerDollar: runsPerDollar * tokensPerRun,
        runsPerDollar,
      };
    })
    .sort((a, b) => b.runsPerDollar - a.runsPerDollar);
}

export function formatPricePerM(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(1)}`;
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

export function formatContext(tokens: number): string {
  if (!tokens) return "—";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(tokens / 1_000)}k`;
}

export function shortModelName(name: string): string {
  return name.replace(/^[^:]+:\s*/, "");
}
