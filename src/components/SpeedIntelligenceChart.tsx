import { useMemo, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { SpeedIntelligenceData, SpeedIntelligenceModel } from "../lib/schema";
import { formatPricePerM, formatUsd } from "../lib/analytics";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  data: SpeedIntelligenceData;
}

type BenchKey =
  | "intelligenceIndex"
  | "engineeringIndex"
  | "economicsIndex"
  | "financeIndex"
  | "strategyIndex"
  | "legalIndex"
  | "healthcareIndex";

type XMetricKey = "e2eSeconds" | "ttfaSeconds" | "costPerTaskUsd" | "tokensPerSecond";

const BENCHMARKS: { key: BenchKey; label: string; shortLabel: string }[] = [
  { key: "intelligenceIndex", label: "AA Intelligence v5", shortLabel: "Intelligence" },
  { key: "engineeringIndex", label: "AA Engineering", shortLabel: "Engineering" },
  { key: "economicsIndex", label: "AA Economics", shortLabel: "Economics" },
  { key: "financeIndex", label: "AA Finance & Accounting", shortLabel: "Finance" },
  { key: "strategyIndex", label: "AA Strategy & Ops", shortLabel: "Strategy" },
  { key: "legalIndex", label: "AA Legal", shortLabel: "Legal" },
  { key: "healthcareIndex", label: "AA Healthcare & Medical", shortLabel: "Healthcare" },
];

const X_METRICS: {
  key: XMetricKey;
  label: string;
  axisLabel: string;
  lowerIsBetter: boolean;
  format: (v: number) => string;
}[] = [
  {
    key: "e2eSeconds",
    label: "Time per task (E2E)",
    axisLabel: "Median end-to-end time per task (seconds, log — lower is faster) →",
    lowerIsBetter: true,
    format: (v) => (v < 10 ? `${v.toFixed(1)}s` : `${Math.round(v)}s`),
  },
  {
    key: "ttfaSeconds",
    label: "Time to first answer",
    axisLabel: "Median time to first answer token (seconds, log — lower is faster) →",
    lowerIsBetter: true,
    format: (v) => (v < 10 ? `${v.toFixed(1)}s` : `${Math.round(v)}s`),
  },
  {
    key: "costPerTaskUsd",
    label: "AA Cost per task",
    axisLabel: "Artificial Analysis cost per benchmark task (USD, log — lower is cheaper) →",
    lowerIsBetter: true,
    format: (v) => formatUsd(v),
  },
  {
    key: "tokensPerSecond",
    label: "Output speed (tok/s)",
    axisLabel: "Median output speed (tokens / sec, log — higher is faster) →",
    lowerIsBetter: false,
    format: (v) => `${Math.round(v)}`,
  },
];

interface PlottedPoint extends SpeedIntelligenceModel {
  xVal: number;
  yVal: number;
}

function computeFrontier(points: PlottedPoint[], lowerIsBetter: boolean): PlottedPoint[] {
  const sorted = [...points].sort((a, b) =>
    lowerIsBetter
      ? a.xVal - b.xVal || b.yVal - a.yVal
      : b.xVal - a.xVal || b.yVal - a.yVal,
  );
  const frontier: PlottedPoint[] = [];
  let maxY = -Infinity;
  for (const p of sorted) {
    if (p.yVal > maxY) {
      frontier.push(p);
      maxY = p.yVal;
    }
  }
  return frontier.sort((a, b) => a.xVal - b.xVal);
}

export default function SpeedIntelligenceChart({ data }: Props) {
  const [benchKey, setBenchKey] = useState<BenchKey>("intelligenceIndex");
  const [xMetricKey, setXMetricKey] = useState<XMetricKey>("e2eSeconds");
  const [selectedCreator, setSelectedCreator] = useState<string>("All");
  const [query, setQuery] = useState<string>("");

  const activeBench = BENCHMARKS.find((b) => b.key === benchKey) ?? BENCHMARKS[0];
  const activeX = X_METRICS.find((x) => x.key === xMetricKey) ?? X_METRICS[0];

  const topCreators = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data.models) {
      if (m[benchKey] == null) continue;
      counts.set(m.creator, (counts.get(m.creator) ?? 0) + 1);
    }
    return [
      "All",
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c]) => c),
    ];
  }, [data.models, benchKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.models.filter((m) => {
      if (selectedCreator !== "All" && m.creator !== selectedCreator) return false;
      if (q && !m.name.toLowerCase().includes(q) && !m.creator.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data.models, selectedCreator, query]);

  const plottedPoints = useMemo<PlottedPoint[]>(() => {
    return filtered
      .filter((m) => {
        const xv = m[xMetricKey];
        const yv = m[benchKey];
        return xv != null && xv > 0 && yv != null && yv > 0;
      })
      .map((m) => ({
        ...m,
        xVal: m[xMetricKey] as number,
        yVal: m[benchKey] as number,
      }));
  }, [filtered, xMetricKey, benchKey]);

  const frontier = useMemo(
    () => computeFrontier(plottedPoints, activeX.lowerIsBetter),
    [plottedPoints, activeX.lowerIsBetter],
  );

  const frontierIds = useMemo(() => new Set(frontier.map((f) => f.id)), [frontier]);

  const topModel = useMemo(
    () => [...plottedPoints].sort((a, b) => b.yVal - a.yVal)[0] ?? null,
    [plottedPoints],
  );

  const fastestStrongModel = useMemo(() => {
    const strong = plottedPoints.filter((m) => m.yVal >= 45);
    if (strong.length === 0) return topModel;
    return strong.sort((a, b) =>
      activeX.lowerIsBetter ? a.xVal - b.xVal : b.xVal - a.xVal,
    )[0];
  }, [plottedPoints, activeX.lowerIsBetter, topModel]);

  const leaderboard = useMemo(() => {
    return [...filtered]
      .filter((m) => m[benchKey] != null)
      .sort((a, b) => (b[benchKey] ?? 0) - (a[benchKey] ?? 0))
      .slice(0, 20);
  }, [filtered, benchKey]);

  return (
    <div className="grid gap-10">
      {/* CHART 1: AA TIME PER TASK / COST PER TASK VS BENCHMARK */}
      <ChartCard
        id="time-per-task-vs-bench"
        takeaway={
          fastestStrongModel
            ? `${fastestStrongModel.name} hits ${fastestStrongModel.yVal.toFixed(1)} on ${activeBench.label} at ${activeX.format(fastestStrongModel.xVal)} (${activeX.label.toLowerCase()}).`
            : `${activeX.label} vs ${activeBench.label}.`
        }
        keyNumber={topModel ? `${topModel.yVal.toFixed(1)}` : "—"}
        keyNumberLabel={topModel ? `Top ${activeBench.shortLabel} (${topModel.name})` : "Top score"}
        source={`Source: Artificial Analysis API v2 (artificialanalysis.ai) · ${activeBench.label} & ${activeX.label} · Snapshot ${data.snapshotDate}`}
        filename={`sgdev-aa-${benchKey}-${xMetricKey}.png`}
        controls={
          <div className="w-full grid gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] mr-1">
                Benchmark:
              </span>
              {BENCHMARKS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBenchKey(b.key)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[11px] border transition-colors ${
                    benchKey === b.key
                      ? "border-[var(--signal)] text-[var(--text)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {b.shortLabel}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] mr-1">
                X-axis:
              </span>
              {X_METRICS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => setXMetricKey(x.key)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[11px] border transition-colors ${
                    xMetricKey === x.key
                      ? "border-[var(--electric)] text-[var(--text)] bg-[color-mix(in_srgb,var(--electric)_14%,transparent)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {x.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {topCreators.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCreator(c)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[10px] uppercase tracking-[0.06em] border transition-colors ${
                    selectedCreator === c
                      ? "border-[var(--text)] text-[var(--text)] bg-[var(--bg)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {c}
                </button>
              ))}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter models..."
                className="font-mono ml-auto w-44 border border-[var(--grid)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--text)] placeholder:text-[var(--muted)]"
              />
            </div>
          </div>
        }
        footerExtra={`${plottedPoints.length} models plotted · ${frontier.length} on the green Pareto frontier`}
      >
        <PlotFigure
          ariaLabel={`${activeX.label} vs ${activeBench.label} scatter plot`}
          minHeight={400}
          deps={[plottedPoints, frontier, activeX, activeBench]}
          build={(width, palette) => ({
            height: width < 640 ? 330 : 430,
            marginTop: 22,
            marginRight: 28,
            marginBottom: 46,
            marginLeft: 56,
            x: {
              type: "log",
              grid: true,
              label: activeX.axisLabel,
              tickFormat: (d: number) => activeX.format(d),
            },
            y: {
              grid: true,
              label: `↑ ${activeBench.label}`,
            },
            marks: [
              Plot.line(frontier, {
                x: "xVal",
                y: "yVal",
                stroke: palette.signal,
                strokeWidth: 2,
              }),
              Plot.dot(plottedPoints, {
                x: "xVal",
                y: "yVal",
                r: (d) => (frontierIds.has(d.id) ? 5.5 : 4),
                fill: (d) => (frontierIds.has(d.id) ? palette.signal : palette.electric),
                fillOpacity: (d) => (frontierIds.has(d.id) ? 0.95 : 0.65),
              }),
              Plot.text(
                frontier.filter(
                  (_, idx) => idx === 0 || idx === frontier.length - 1 || idx % 2 === 0,
                ),
                {
                  x: "xVal",
                  y: "yVal",
                  text: "name",
                  dy: -10,
                  fill: palette.text,
                  fontSize: 10,
                  stroke: palette.surface,
                  strokeWidth: 3,
                  paintOrder: "stroke",
                },
              ),
              Plot.tip(
                plottedPoints,
                Plot.pointer({
                  x: "xVal",
                  y: "yVal",
                  fill: palette.surface,
                  stroke: palette.grid,
                  title: (d) =>
                    [
                      d.name,
                      `Creator: ${d.creator}`,
                      `${activeBench.label}: ${d.yVal.toFixed(1)}`,
                      d.e2eSeconds != null ? `Time per task (E2E): ${d.e2eSeconds.toFixed(1)}s` : null,
                      d.ttfaSeconds != null ? `Time to first answer: ${d.ttfaSeconds.toFixed(1)}s` : null,
                      d.tokensPerSecond != null ? `Speed: ${d.tokensPerSecond.toFixed(1)} tok/s` : null,
                      d.costPerTaskUsd != null ? `AA Cost/task: ${formatUsd(d.costPerTaskUsd)}` : null,
                      d.blended != null ? `Blended: ${formatPricePerM(d.blended)} / 1M` : null,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                }),
              ),
            ],
          })}
        />
      </ChartCard>

      {/* MULTI-BENCHMARK LEADERBOARD TABLE */}
      <section className="chart-panel p-5 md:p-6 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono m-0 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            Artificial Analysis Multi-Benchmark Leaderboard (sorted by {activeBench.shortLabel})
          </h3>
          <span className="font-mono text-[11px] text-[var(--muted)]">
            Top {leaderboard.length} models · Source: artificialanalysis.ai
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[var(--grid)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-2 text-right">Intel</th>
                <th className="py-2 pr-2 text-right">Eng</th>
                <th className="py-2 pr-2 text-right">Econ</th>
                <th className="py-2 pr-2 text-right">Fin</th>
                <th className="py-2 pr-2 text-right">Legal</th>
                <th className="py-2 pr-2 text-right">Health</th>
                <th className="py-2 pr-2 text-right">E2E Time</th>
                <th className="py-2 text-right">Cost/Task</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((m) => (
                <tr key={m.id} className="border-b border-[var(--grid)]/60 last:border-0">
                  <td className="py-2 pr-3 text-[var(--text)]">
                    {m.name}
                    <span className="ml-1.5 text-[10px] text-[var(--muted)]">{m.creator}</span>
                  </td>
                  <td className="py-2 pr-2 text-right tabular text-[var(--signal)] font-medium">
                    {m.intelligenceIndex != null ? m.intelligenceIndex.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular">
                    {m.engineeringIndex != null ? m.engineeringIndex.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular">
                    {m.economicsIndex != null ? m.economicsIndex.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular">
                    {m.financeIndex != null ? m.financeIndex.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular">
                    {m.legalIndex != null ? m.legalIndex.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular">
                    {m.healthcareIndex != null ? m.healthcareIndex.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right tabular text-[var(--amber)]">
                    {m.e2eSeconds != null ? `${m.e2eSeconds.toFixed(1)}s` : "—"}
                  </td>
                  <td className="py-2 text-right tabular text-[var(--muted)]">
                    {m.costPerTaskUsd != null ? formatUsd(m.costPerTaskUsd) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
