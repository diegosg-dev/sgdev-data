import { useMemo, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { SpeedIntelligenceData, SpeedIntelligenceModel } from "../lib/schema";
import { formatPricePerM } from "../lib/analytics";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  data: SpeedIntelligenceData;
}

function computeSpeedIntelligenceFrontier(models: SpeedIntelligenceModel[]) {
  const valid = models.filter(
    (m): m is SpeedIntelligenceModel & { tokensPerSecond: number; intelligenceIndex: number } =>
      m.tokensPerSecond != null &&
      m.tokensPerSecond > 0 &&
      m.intelligenceIndex != null &&
      m.intelligenceIndex > 0,
  );
  // Sort by speed descending: keep strictly rising intelligence as speed decreases
  const sorted = [...valid].sort(
    (a, b) => b.tokensPerSecond - a.tokensPerSecond || b.intelligenceIndex - a.intelligenceIndex,
  );
  const frontier: typeof valid = [];
  let maxIntel = -Infinity;
  for (const m of sorted) {
    if (m.intelligenceIndex > maxIntel) {
      frontier.push(m);
      maxIntel = m.intelligenceIndex;
    }
  }
  return { valid, frontier: frontier.sort((a, b) => a.tokensPerSecond - b.tokensPerSecond) };
}

export default function SpeedIntelligenceChart({ data }: Props) {
  const [selectedCreator, setSelectedCreator] = useState<string>("All");
  const [query, setQuery] = useState<string>("");

  const topCreators = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data.models) {
      if (m.intelligenceIndex == null || m.tokensPerSecond == null) continue;
      counts.set(m.creator, (counts.get(m.creator) ?? 0) + 1);
    }
    return [
      "All",
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c]) => c),
    ];
  }, [data.models]);

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

  const { valid: speedIntelPoints, frontier: speedFrontier } = useMemo(
    () => computeSpeedIntelligenceFrontier(filtered),
    [filtered],
  );

  const latencyPoints = useMemo(
    () =>
      filtered.filter(
        (m): m is SpeedIntelligenceModel & { tokensPerSecond: number; ttftSeconds: number } =>
          m.tokensPerSecond != null &&
          m.tokensPerSecond > 0 &&
          m.ttftSeconds != null &&
          m.ttftSeconds > 0,
      ),
    [filtered],
  );

  const topIntel = useMemo(
    () =>
      [...speedIntelPoints].sort((a, b) => b.intelligenceIndex - a.intelligenceIndex)[0] ?? null,
    [speedIntelPoints],
  );

  const fastestHighIntel = useMemo(
    () =>
      [...speedIntelPoints]
        .filter((m) => m.intelligenceIndex >= 45)
        .sort((a, b) => b.tokensPerSecond - a.tokensPerSecond)[0] ?? null,
    [speedIntelPoints],
  );

  return (
    <div className="grid gap-10">
      {/* CHART 1: OUTPUT SPEED VS INTELLIGENCE INDEX */}
      <ChartCard
        id="speed-vs-intelligence"
        takeaway={
          fastestHighIntel
            ? `${fastestHighIntel.name} delivers ${Math.round(fastestHighIntel.tokensPerSecond)} tok/s while scoring ${fastestHighIntel.intelligenceIndex.toFixed(1)} on the AA Intelligence Index.`
            : "Output speed (tokens/sec) vs Artificial Analysis Intelligence Index v5."
        }
        keyNumber={topIntel ? `${topIntel.intelligenceIndex.toFixed(1)}` : "—"}
        keyNumberLabel={topIntel ? `Top AA Index (${topIntel.name})` : "Top AA Index"}
        source={`Source: Artificial Analysis API v2 (artificialanalysis.ai) · Intelligence Index v5 · Snapshot ${data.snapshotDate}`}
        filename={`sgdev-aa-speed-intelligence-${data.snapshotDate}.png`}
        controls={
          <>
            <div className="flex flex-wrap items-center gap-1">
              {topCreators.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCreator(c)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[10px] uppercase tracking-[0.06em] border transition-colors ${
                    selectedCreator === c
                      ? "border-[var(--signal)] text-[var(--text)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter models..."
              className="font-mono ml-auto w-44 border border-[var(--grid)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--text)] placeholder:text-[var(--muted)]"
            />
          </>
        }
        footerExtra={`${speedIntelPoints.length} models plotted · ${speedFrontier.length} on speed–intelligence frontier`}
      >
        <PlotFigure
          ariaLabel="Output tokens per second vs Artificial Analysis Intelligence Index scatter plot"
          minHeight={380}
          deps={[speedIntelPoints, speedFrontier]}
          build={(width, palette) => ({
            height: width < 640 ? 320 : 420,
            marginTop: 22,
            marginRight: 28,
            marginBottom: 46,
            marginLeft: 56,
            x: {
              type: "log",
              grid: true,
              label: "Median output speed (tokens / sec, log) →",
            },
            y: {
              grid: true,
              label: "↑ AA Intelligence Index v5",
            },
            marks: [
              Plot.line(speedFrontier, {
                x: "tokensPerSecond",
                y: "intelligenceIndex",
                stroke: palette.signal,
                strokeWidth: 2,
              }),
              Plot.dot(speedIntelPoints, {
                x: "tokensPerSecond",
                y: "intelligenceIndex",
                r: (d) => (speedFrontier.some((f) => f.id === d.id) ? 5.5 : 4),
                fill: (d) =>
                  speedFrontier.some((f) => f.id === d.id) ? palette.signal : palette.electric,
                fillOpacity: (d) => (speedFrontier.some((f) => f.id === d.id) ? 0.95 : 0.65),
              }),
              Plot.text(
                speedFrontier.filter(
                  (_, idx) => idx === 0 || idx === speedFrontier.length - 1 || idx % 2 === 0,
                ),
                {
                  x: "tokensPerSecond",
                  y: "intelligenceIndex",
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
                speedIntelPoints,
                Plot.pointer({
                  x: "tokensPerSecond",
                  y: "intelligenceIndex",
                  fill: palette.surface,
                  stroke: palette.grid,
                  title: (d) =>
                    [
                      d.name,
                      `Creator: ${d.creator}`,
                      `AA Intelligence Index: ${d.intelligenceIndex.toFixed(1)}`,
                      `Speed: ${d.tokensPerSecond.toFixed(1)} tok/s`,
                      d.ttftSeconds != null ? `TTFT: ${d.ttftSeconds.toFixed(2)}s` : null,
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

      {/* CHART 2: LATENCY (TTFT) VS THROUGHPUT */}
      <ChartCard
        id="latency-vs-speed"
        takeaway="Low time-to-first-token (TTFT) and high output speed separate snappy chat models from slow reasoning runs."
        keyNumber={`${latencyPoints.length} models`}
        keyNumberLabel="With live speed & TTFT telemetry"
        keyNumberTone="electric"
        source={`Source: Artificial Analysis API v2 (artificialanalysis.ai) · Median TTFT & output tok/s · Snapshot ${data.snapshotDate}`}
        filename={`sgdev-aa-latency-speed-${data.snapshotDate}.png`}
      >
        <PlotFigure
          ariaLabel="Time to first token vs output speed scatter plot"
          minHeight={340}
          deps={[latencyPoints]}
          build={(width, palette) => ({
            height: width < 640 ? 290 : 360,
            marginTop: 20,
            marginRight: 28,
            marginBottom: 46,
            marginLeft: 62,
            x: {
              type: "log",
              grid: true,
              label: "Median Time to First Token (seconds, log — lower is faster) →",
              tickFormat: (d: number) => `${d}s`,
            },
            y: {
              type: "log",
              grid: true,
              label: "↑ Median output speed (tokens / sec, log)",
            },
            marks: [
              Plot.dot(latencyPoints, {
                x: "ttftSeconds",
                y: "tokensPerSecond",
                r: 4,
                fill: (d) =>
                  d.intelligenceIndex != null && d.intelligenceIndex >= 45
                    ? palette.signal
                    : palette.amber,
                fillOpacity: 0.72,
              }),
              Plot.tip(
                latencyPoints,
                Plot.pointer({
                  x: "ttftSeconds",
                  y: "tokensPerSecond",
                  fill: palette.surface,
                  stroke: palette.grid,
                  title: (d) =>
                    [
                      d.name,
                      `Creator: ${d.creator}`,
                      `TTFT: ${d.ttftSeconds.toFixed(2)}s · Speed: ${d.tokensPerSecond.toFixed(1)} tok/s`,
                      d.intelligenceIndex != null
                        ? `AA Index: ${d.intelligenceIndex.toFixed(1)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                }),
              ),
            ],
          })}
        />
      </ChartCard>
    </div>
  );
}
