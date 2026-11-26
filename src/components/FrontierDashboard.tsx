import { useEffect, useMemo, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { FrontierData, PricesHistoryData, TaskPresetId } from "../lib/schema";
import {
  TASK_PRESETS,
  computeDeflationSeries,
  computeParetoFrontier,
  formatContext,
  formatPricePerM,
  formatUsd,
  getPreset,
  shortModelName,
  solveGoodEnough,
} from "../lib/analytics";
import { exportGoodEnoughCard } from "../lib/export-image";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  frontierData: FrontierData;
  pricesHistory: PricesHistoryData;
}

const RATIO_OPTIONS = [
  { label: "1:1", value: 1 },
  { label: "3:1", value: 3 },
  { label: "5:1", value: 5 },
  { label: "10:1", value: 10 },
];

export default function FrontierDashboard({ frontierData, pricesHistory }: Props) {
  const models = frontierData.models;

  // Score bounds from real data
  const scoreBounds = useMemo(() => {
    const scores = models.map((m) => m.arenaScore);
    const min = Math.floor(Math.min(...scores) / 10) * 10;
    const max = Math.ceil(Math.max(...scores) / 10) * 10;
    return { min, max };
  }, [models]);

  // Frontier controls
  const [ratio, setRatio] = useState<number>(3);
  const [selectedProvider, setSelectedProvider] = useState<string>("All");
  const [weightFilter, setWeightFilter] = useState<"all" | "closed" | "open">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Good-Enough Finder controls
  const [presetId, setPresetId] = useState<TaskPresetId>("coding");
  const [monthlyRuns, setMonthlyRuns] = useState<number>(2_000);
  const [minScore, setMinScore] = useState<number>(() =>
    Math.min(scoreBounds.max - 20, Math.max(scoreBounds.min + 20, 1420)),
  );
  const [openOnly, setOpenOnly] = useState<boolean>(false);
  const [permalinkCopied, setPermalinkCopied] = useState<boolean>(false);
  const [exportingCard, setExportingCard] = useState<boolean>(false);

  // Hydrate state from URL query params on mount (permalink support)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("preset") as TaskPresetId | null;
    if (p && TASK_PRESETS.some((t) => t.id === p)) setPresetId(p);

    const r = Number(params.get("runs"));
    if (Number.isFinite(r) && r >= 10 && r <= 1_000_000) setMonthlyRuns(Math.round(r));

    const ms = Number(params.get("minScore"));
    if (Number.isFinite(ms) && ms >= scoreBounds.min && ms <= scoreBounds.max) {
      setMinScore(Math.round(ms));
    }

    const oo = params.get("openOnly");
    if (oo === "1" || oo === "true") setOpenOnly(true);

    const rt = Number(params.get("ratio"));
    if (Number.isFinite(rt) && [1, 3, 5, 10].includes(rt)) setRatio(rt);
  }, [scoreBounds.min, scoreBounds.max]);

  // Sync URL query params cleanly without polluting browser history
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("preset", presetId);
    params.set("runs", String(monthlyRuns));
    params.set("minScore", String(minScore));
    if (openOnly) params.set("openOnly", "1");
    if (ratio !== 3) params.set("ratio", String(ratio));
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [presetId, monthlyRuns, minScore, openOnly, ratio]);

  // Top providers for filter pills
  const topProviders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models) {
      counts.set(m.provider, (counts.get(m.provider) ?? 0) + 1);
    }
    return [
      "All",
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([p]) => p),
    ];
  }, [models]);

  // Filtered frontier points
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (selectedProvider !== "All" && m.provider !== selectedProvider) return false;
      if (weightFilter === "closed" && m.openWeights) return false;
      if (weightFilter === "open" && !m.openWeights) return false;
      return true;
    });
  }, [models, selectedProvider, weightFilter]);

  const { points, frontier } = useMemo(
    () => computeParetoFrontier(filteredModels, ratio),
    [filteredModels, ratio],
  );

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      points
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            p.provider.toLowerCase().includes(q),
        )
        .map((p) => p.id),
    );
  }, [points, searchQuery]);

  // Good-Enough Finder solver
  const preset = getPreset(presetId);
  const finderResult = useMemo(
    () =>
      solveGoodEnough({
        models,
        preset,
        monthlyRuns,
        minScore,
        openOnly,
      }),
    [models, preset, monthlyRuns, minScore, openOnly],
  );

  const deflationSeries = useMemo(
    () =>
      computeDeflationSeries({
        snapshots: pricesHistory.deflationSnapshots,
        preset,
        monthlyRuns,
        minScore,
        openOnly,
      }),
    [pricesHistory.deflationSnapshots, preset, monthlyRuns, minScore, openOnly],
  );

  // Key headline number: cheapest model >= 1450 (top-tier frontier bar) or >= minScore
  const headlineBar = 1450;
  const cheapestTopClass = useMemo(() => {
    const eligible = points
      .filter((p) => p.arenaScore >= headlineBar)
      .sort((a, b) => a.blended - b.blended);
    return eligible[0] ?? frontier[frontier.length - 1] ?? null;
  }, [points, frontier]);

  const winnerPoint = useMemo(() => {
    if (!finderResult.winner) return null;
    return points.find((p) => p.id === finderResult.winner?.id) ?? null;
  }, [points, finderResult.winner]);

  async function handleCopyPermalink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setPermalinkCopied(true);
      setTimeout(() => setPermalinkCopied(false), 2000);
    } catch {
      // Fallback: prompt
    }
  }

  async function handleExportCard() {
    if (!finderResult.winner || exportingCard) return;
    setExportingCard(true);
    try {
      await exportGoodEnoughCard({
        result: finderResult,
        preset,
        monthlyRuns,
        minScore,
        openOnly,
        snapshotDate: frontierData.snapshotDate,
      });
    } finally {
      setExportingCard(false);
    }
  }

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="grid gap-10">
      {/* HERO SCATTER: PRICE VS QUALITY FRONTIER */}
      <ChartCard
        id="frontier"
        takeaway="Models on the green frontier buy the highest Arena score per blended dollar."
        keyNumber={cheapestTopClass ? `${formatPricePerM(cheapestTopClass.blended)} / 1M` : "—"}
        keyNumberLabel={
          cheapestTopClass
            ? `Cheapest >= ${headlineBar} Arena (${shortModelName(cheapestTopClass.name)})`
            : "Cheapest frontier / 1M"
        }
        source={`Source: OpenRouter prices (${ratio}:1 in:out) · LMArena style-control overall (CC BY 4.0) · Snapshot ${frontierData.snapshotDate}`}
        filename={`sgdev-frontier-${frontierData.snapshotDate}.png`}
        controls={
          <>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                Mix:
              </span>
              {RATIO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRatio(opt.value)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[11px] border transition-colors ${
                    ratio === opt.value
                      ? "border-[var(--signal)] text-[var(--text)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                Weights:
              </span>
              {(["all", "closed", "open"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeightFilter(w)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[11px] uppercase border transition-colors ${
                    weightFilter === w
                      ? "border-[var(--text)] text-[var(--text)] bg-[var(--bg)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {topProviders.map((prov) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => setSelectedProvider(prov)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[10px] uppercase tracking-[0.06em] border transition-colors ${
                    selectedProvider === prov
                      ? "border-[var(--electric)] text-[var(--text)] bg-[color-mix(in_srgb,var(--electric)_14%,transparent)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {prov}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="frontier-search" className="sr-only">
                Highlight model
              </label>
              <input
                id="frontier-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Highlight model..."
                className="font-mono w-44 border border-[var(--grid)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--electric)] focus:outline-none"
              />
            </div>
          </>
        }
        footerExtra={
          <span className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--electric)]" />
              Closed ({points.filter((p) => !p.openWeights).length})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
              Open weights ({points.filter((p) => p.openWeights).length})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[var(--signal)]" />
              Pareto frontier ({frontier.length})
            </span>
          </span>
        }
      >
        <PlotFigure
          ariaLabel="Price vs Arena quality scatter plot with Pareto best-value frontier"
          minHeight={420}
          deps={[points, frontier, minScore, winnerPoint, searchMatches, hasSearch]}
          build={(width, palette) => ({
            height: width < 640 ? 340 : 440,
            marginTop: 22,
            marginRight: 28,
            marginBottom: 46,
            marginLeft: 56,
            x: {
              type: "log",
              label: `Blended price (USD / 1M tokens, ${ratio}:1 in:out) →`,
              grid: true,
              tickFormat: (d: number) => formatPricePerM(d),
            },
            y: {
              label: "↑ LMArena score (style-control)",
              grid: true,
            },
            marks: [
              // Quality bar from Good-Enough Finder
              Plot.ruleY([minScore], {
                stroke: palette.signal,
                strokeDasharray: "4,4",
                strokeOpacity: 0.45,
              }),
              // Best-value frontier step/line
              Plot.line(frontier, {
                x: "blended",
                y: "arenaScore",
                stroke: palette.signal,
                strokeWidth: 2,
                curve: "monotone-x",
              }),
              // All models
              Plot.dot(points, {
                x: "blended",
                y: "arenaScore",
                r: (d) => {
                  if (winnerPoint && d.id === winnerPoint.id) return 7;
                  if (hasSearch && searchMatches.has(d.id)) return 6.5;
                  return d.onFrontier ? 5 : 4;
                },
                fill: (d) => (d.openWeights ? palette.amber : palette.electric),
                fillOpacity: (d) => {
                  if (winnerPoint && d.id === winnerPoint.id) return 1;
                  if (hasSearch) return searchMatches.has(d.id) ? 1 : 0.16;
                  return d.onFrontier ? 0.95 : 0.65;
                },
                stroke: (d) => {
                  if (winnerPoint && d.id === winnerPoint.id) return palette.signal;
                  if (hasSearch && searchMatches.has(d.id)) return palette.text;
                  return d.onFrontier ? palette.signal : "none";
                },
                strokeWidth: (d) =>
                  winnerPoint && d.id === winnerPoint.id ? 2.5 : d.onFrontier ? 1.5 : 0,
              }),
              // Label frontier standouts (sparse to avoid overlap)
              Plot.text(
                frontier.filter((_, idx) => idx === 0 || idx === frontier.length - 1 || idx % 2 === 0),
                {
                  x: "blended",
                  y: "arenaScore",
                  text: (d) => shortModelName(d.name),
                  dy: -10,
                  fill: palette.text,
                  fontSize: 10,
                  stroke: palette.surface,
                  strokeWidth: 3,
                  paintOrder: "stroke",
                },
              ),
              // Highlighted finder winner ring
              ...(winnerPoint
                ? [
                    Plot.dot([winnerPoint], {
                      x: "blended",
                      y: "arenaScore",
                      r: 12,
                      fill: "none",
                      stroke: palette.signal,
                      strokeWidth: 2,
                    }),
                  ]
                : []),
              // Interactive hover tip
              Plot.tip(
                points,
                Plot.pointer({
                  x: "blended",
                  y: "arenaScore",
                  fill: palette.surface,
                  stroke: palette.grid,
                  title: (d) =>
                    [
                      shortModelName(d.name),
                      `${d.provider} · ${d.openWeights ? "Open weights" : "Closed"}`,
                      `Arena: ${d.arenaScore.toFixed(1)}`,
                      `Blended (${ratio}:1): ${formatPricePerM(d.blended)} / 1M`,
                      `In / Out: ${formatPricePerM(d.inputPrice)} / ${formatPricePerM(d.outputPrice)}`,
                      `Context: ${formatContext(d.contextLength)}`,
                    ].join("\n"),
                }),
              ),
            ],
          })}
        />
      </ChartCard>

      {/* KEY FEATURE: GOOD-ENOUGH FINDER */}
      <section className="chart-panel grid gap-6 p-5 md:p-6 md:grid-cols-12" id="good-enough">
        <header className="md:col-span-8 space-y-2">
          <p className="font-mono m-0 text-[10px] uppercase tracking-[0.14em] text-[var(--signal)]">
            Key Tool · Permalink &amp; Share Card
          </p>
          <h2 className="chart-takeaway m-0">Good-Enough Finder</h2>
          <p className="m-0 text-sm text-[var(--muted)] max-w-2xl">
            Pick a task profile, monthly run volume, and minimum Arena score. The cheapest qualifying
            model is highlighted on the frontier chart above.
          </p>
        </header>

        <div className="md:col-span-4 flex flex-wrap items-start md:justify-end gap-2">
          <button
            type="button"
            onClick={handleCopyPermalink}
            className="font-mono cursor-pointer border border-[var(--grid)] bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] hover:border-[var(--electric)] hover:text-[var(--text)]"
          >
            {permalinkCopied ? "Link copied" : "Copy permalink"}
          </button>
          <button
            type="button"
            onClick={handleExportCard}
            disabled={!finderResult.winner || exportingCard}
            className="font-mono cursor-pointer border border-[var(--signal)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)] px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--signal)] hover:bg-[color-mix(in_srgb,var(--signal)_22%,transparent)] disabled:opacity-40"
          >
            {exportingCard ? "Exporting..." : "Export card (1200×675)"}
          </button>
        </div>

        {/* Inputs */}
        <div className="md:col-span-5 grid gap-5 border border-[var(--grid)] bg-[var(--bg)] p-4">
          <div className="space-y-2">
            <span className="font-mono block text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Task preset
            </span>
            <div className="grid grid-cols-2 gap-2">
              {TASK_PRESETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPresetId(t.id)}
                  className={`cursor-pointer border p-2.5 text-left transition-colors ${
                    presetId === t.id
                      ? "border-[var(--signal)] bg-[color-mix(in_srgb,var(--signal)_10%,transparent)]"
                      : "border-[var(--grid)] hover:border-[var(--muted)]"
                  }`}
                >
                  <span className="font-mono block text-xs font-medium text-[var(--text)]">
                    {t.label}
                  </span>
                  <span className="block text-[11px] text-[var(--muted)] mt-0.5">
                    {t.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="finder-runs"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]"
              >
                Monthly runs
              </label>
              <span className="font-mono text-xs text-[var(--text)]">
                {monthlyRuns.toLocaleString("en-US")} / mo
              </span>
            </div>
            <input
              id="finder-runs"
              type="range"
              min={100}
              max={100_000}
              step={100}
              value={monthlyRuns}
              onChange={(e) => setMonthlyRuns(Number(e.target.value))}
              className="w-full accent-[var(--signal)]"
            />
            <div className="flex justify-between font-mono text-[10px] text-[var(--muted)]">
              <span>100</span>
              <span>25k</span>
              <span>50k</span>
              <span>100k</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="finder-score"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]"
              >
                Minimum quality (Arena score)
              </label>
              <span className="font-mono text-sm font-bold text-[var(--signal)]">{minScore}</span>
            </div>
            <input
              id="finder-score"
              type="range"
              min={scoreBounds.min}
              max={scoreBounds.max}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-[var(--signal)]"
            />
            <div className="flex justify-between font-mono text-[10px] text-[var(--muted)]">
              <span>{scoreBounds.min}</span>
              <span>{Math.round((scoreBounds.min + scoreBounds.max) / 2)}</span>
              <span>{scoreBounds.max}</span>
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="h-4 w-4 accent-[var(--amber)]"
            />
            <span className="font-mono text-xs text-[var(--text)]">Open weights only</span>
          </label>
        </div>

        {/* Outputs */}
        <div className="md:col-span-7 grid gap-4 content-start">
          {finderResult.winner ? (
            <>
              <div className="border border-[var(--signal)] bg-[var(--bg)] p-4 grid gap-4 sm:grid-cols-12">
                <div className="sm:col-span-7 space-y-1.5">
                  <p className="font-mono m-0 text-[10px] uppercase tracking-[0.12em] text-[var(--signal)]">
                    Cheapest qualifying model
                  </p>
                  <h3 className="m-0 text-xl font-semibold text-[var(--text)]">
                    {shortModelName(finderResult.winner.name)}
                  </h3>
                  <p className="font-mono m-0 text-xs text-[var(--muted)]">
                    {finderResult.winner.provider} ·{" "}
                    <span
                      className={
                        finderResult.winner.openWeights
                          ? "text-[var(--amber)]"
                          : "text-[var(--electric)]"
                      }
                    >
                      {finderResult.winner.openWeights ? "Open weights" : "Closed"}
                    </span>{" "}
                    · Arena {finderResult.winner.arenaScore.toFixed(1)} ·{" "}
                    {formatContext(finderResult.winner.contextLength)} ctx
                  </p>
                </div>

                <div className="sm:col-span-5 sm:text-right space-y-1">
                  <p className="font-mono m-0 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    Estimated monthly cost
                  </p>
                  <p className="font-mono m-0 text-2xl font-bold text-[var(--signal)]">
                    {formatUsd(finderResult.winner.monthlyCost)}
                    <span className="text-xs font-normal text-[var(--muted)]">/mo</span>
                  </p>
                  {finderResult.premiumBaseline && (
                    <p className="font-mono m-0 text-[11px] text-[var(--muted)]">
                      Saves{" "}
                      <span className="text-[var(--text)] font-medium">
                        {Math.round(finderResult.savingsPct)}% ({formatUsd(finderResult.monthlySavings)}/mo)
                      </span>{" "}
                      vs {shortModelName(finderResult.premiumBaseline.name)}
                    </p>
                  )}
                </div>
              </div>

              {/* Top 5 alternatives */}
              <div className="border border-[var(--grid)] bg-[var(--bg)] p-4 space-y-2.5">
                <p className="font-mono m-0 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  Top 5 alternatives clearing Arena &gt;= {minScore}
                </p>
                {finderResult.alternatives.length === 0 ? (
                  <p className="font-mono m-0 text-xs text-[var(--muted)]">
                    No other models clear this threshold under current filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-[var(--grid)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                          <th className="py-1.5 pr-3">Model</th>
                          <th className="py-1.5 pr-3">Type</th>
                          <th className="py-1.5 pr-3 text-right">Arena</th>
                          <th className="py-1.5 text-right">Monthly</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finderResult.alternatives.map((alt) => (
                          <tr key={alt.id} className="border-b border-[var(--grid)]/60 last:border-0">
                            <td className="py-1.5 pr-3 text-[var(--text)]">
                              {shortModelName(alt.name)}
                              <span className="ml-1.5 text-[10px] text-[var(--muted)]">
                                {alt.provider}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3">
                              <span
                                className={
                                  alt.openWeights
                                    ? "text-[var(--amber)]"
                                    : "text-[var(--electric)]"
                                }
                              >
                                {alt.openWeights ? "Open" : "Closed"}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular">
                              {alt.arenaScore.toFixed(1)}
                            </td>
                            <td className="py-1.5 text-right tabular text-[var(--text)]">
                              {formatUsd(alt.monthlyCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="border border-[var(--grid)] bg-[var(--bg)] p-6 text-center">
              <p className="font-mono m-0 text-sm text-[var(--amber)]">
                No model clears Arena &gt;= {minScore}
                {openOnly ? " with open weights" : ""}. Lower the quality bar slightly.
              </p>
            </div>
          )}

          {/* Intelligence Deflation line */}
          <div className="border border-[var(--grid)] bg-[var(--bg)] p-4 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono m-0 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Intelligence deflation · Cheapest monthly cost for Arena &gt;= {minScore}
              </p>
              <span className="font-mono text-[10px] text-[var(--muted)]">
                {deflationSeries.length} snapshot{deflationSeries.length === 1 ? "" : "s"} recorded
              </span>
            </div>

            {deflationSeries.length > 0 ? (
              <PlotFigure
                ariaLabel="Intelligence deflation line showing cheapest monthly cost over snapshots"
                minHeight={150}
                deps={[deflationSeries]}
                build={(width, palette) => ({
                  height: 155,
                  marginTop: 14,
                  marginRight: 20,
                  marginBottom: 30,
                  marginLeft: 56,
                  x: {
                    type: "point",
                    label: null,
                  },
                  y: {
                    grid: true,
                    label: "USD / mo",
                    tickFormat: (d: number) => formatUsd(d),
                  },
                  marks: [
                    ...(deflationSeries.length > 1
                      ? [
                          Plot.line(deflationSeries, {
                            x: "date",
                            y: "monthlyCost",
                            stroke: palette.signal,
                            strokeWidth: 2,
                          }),
                        ]
                      : []),
                    Plot.dot(deflationSeries, {
                      x: "date",
                      y: "monthlyCost",
                      r: 4.5,
                      fill: palette.signal,
                    }),
                    Plot.tip(
                      deflationSeries,
                      Plot.pointer({
                        x: "date",
                        y: "monthlyCost",
                        fill: palette.surface,
                        stroke: palette.grid,
                        title: (d) =>
                          `${d.date}\n${shortModelName(d.modelName)}\n${formatUsd(d.monthlyCost)}/mo (Arena ${d.arenaScore.toFixed(1)})`,
                      }),
                    ),
                  ],
                })}
              />
            ) : (
              <p className="font-mono m-0 text-xs text-[var(--muted)] py-4">
                No historical snapshots clear this bar yet.
              </p>
            )}
            {deflationSeries.length === 1 && (
              <p className="font-mono m-0 text-[10px] text-[var(--muted)]">
                Baseline snapshot recorded on {deflationSeries[0].date}. Weekly ETL cron appends a
                new point every Monday.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
