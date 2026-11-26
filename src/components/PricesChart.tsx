import { useMemo, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { PricesHistoryData } from "../lib/schema";
import { formatPricePerM, shortModelName } from "../lib/analytics";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  data: PricesHistoryData;
}

export default function PricesChart({ data }: Props) {
  const [selectedThreshold, setSelectedThreshold] = useState<number>(
    data.thresholds.includes(1400) ? 1400 : data.thresholds[0] ?? 1350,
  );
  const [modelSearch, setModelSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    data.models.slice(0, 6).map((m) => m.id),
  );

  const thresholdPoints = useMemo(
    () => data.cheapestByThreshold.filter((p) => p.threshold === selectedThreshold),
    [data.cheapestByThreshold, selectedThreshold],
  );

  const latestThresholdPoint = thresholdPoints[thresholdPoints.length - 1] ?? null;

  const latestByThreshold = useMemo(() => {
    const latestDate = data.snapshotDates[data.snapshotDates.length - 1];
    return data.cheapestByThreshold
      .filter((p) => p.date === latestDate)
      .sort((a, b) => a.threshold - b.threshold);
  }, [data.cheapestByThreshold, data.snapshotDates]);

  const selectedModels = useMemo(
    () => data.models.filter((m) => selectedIds.includes(m.id)),
    [data.models, selectedIds],
  );

  const modelSeriesFlat = useMemo(() => {
    const rows: {
      date: string;
      modelId: string;
      name: string;
      blended: number;
      inputPrice: number;
      outputPrice: number;
      openWeights: boolean;
      arenaScore: number;
    }[] = [];
    for (const m of selectedModels) {
      for (const pt of m.points) {
        if (pt.blended <= 0) continue;
        rows.push({
          date: pt.date,
          modelId: m.id,
          name: shortModelName(m.name),
          blended: pt.blended,
          inputPrice: pt.inputPrice,
          outputPrice: pt.outputPrice,
          openWeights: m.openWeights,
          arenaScore: pt.arenaScore,
        });
      }
    }
    return rows;
  }, [selectedModels]);

  const filteredPickerModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return data.models
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
      .slice(0, 14);
  }, [data.models, modelSearch]);

  function toggleModel(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-8),
    );
  }

  const isMultiSnapshot = data.snapshotDates.length > 1;

  return (
    <div className="grid gap-10">
      {/* CHART 1: CHEAPEST PRICE FOR SCORE >= X */}
      <ChartCard
        id="cheapest-threshold"
        takeaway={`The cheapest model clearing Arena >= ${selectedThreshold} costs ${
          latestThresholdPoint ? formatPricePerM(latestThresholdPoint.blended) : "—"
        } per 1M blended tokens.`}
        keyNumber={latestThresholdPoint ? `${formatPricePerM(latestThresholdPoint.blended)} / 1M` : "—"}
        keyNumberLabel={
          latestThresholdPoint
            ? `${shortModelName(latestThresholdPoint.modelName)} (Arena ${latestThresholdPoint.arenaScore.toFixed(1)})`
            : `Arena >= ${selectedThreshold}`
        }
        source="Source: OpenRouter prices (3:1 in:out) · LMArena style-control overall (CC BY 4.0)"
        filename={`sgdev-cheapest-arena-${selectedThreshold}.png`}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Quality floor:
            </span>
            {data.thresholds.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedThreshold(t)}
                className={`font-mono cursor-pointer px-2.5 py-1 text-xs border transition-colors ${
                  selectedThreshold === t
                    ? "border-[var(--signal)] text-[var(--text)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                    : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                Arena &gt;= {t}
              </button>
            ))}
          </div>
        }
        footerExtra={
          isMultiSnapshot
            ? `${data.snapshotDates.length} weekly snapshots (${data.snapshotDates[0]} → ${data.snapshotDates[data.snapshotDates.length - 1]})`
            : `Baseline snapshot ${data.snapshotDates[0]} — weekly ETL cron extends this curve every Monday.`
        }
      >
        {isMultiSnapshot ? (
          <PlotFigure
            ariaLabel={`Cheapest price for Arena score >= ${selectedThreshold} over time`}
            minHeight={280}
            deps={[thresholdPoints]}
            build={(width, palette) => ({
              height: 300,
              marginTop: 20,
              marginRight: 28,
              marginBottom: 40,
              marginLeft: 58,
              x: { type: "point", label: "Snapshot date" },
              y: {
                grid: true,
                label: "↑ Blended USD / 1M (3:1)",
                tickFormat: (d: number) => formatPricePerM(d),
              },
              marks: [
                Plot.line(thresholdPoints, {
                  x: "date",
                  y: "blended",
                  stroke: palette.signal,
                  strokeWidth: 2,
                }),
                Plot.dot(thresholdPoints, {
                  x: "date",
                  y: "blended",
                  r: 4.5,
                  fill: palette.signal,
                }),
                Plot.tip(
                  thresholdPoints,
                  Plot.pointer({
                    x: "date",
                    y: "blended",
                    fill: palette.surface,
                    stroke: palette.grid,
                    title: (d) =>
                      `${d.date}\n${shortModelName(d.modelName)}\n${formatPricePerM(d.blended)} / 1M (Arena ${d.arenaScore.toFixed(1)})`,
                  }),
                ),
              ],
            })}
          />
        ) : (
          <PlotFigure
            ariaLabel="Cheapest blended price per quality floor on current snapshot"
            minHeight={260}
            deps={[latestByThreshold, selectedThreshold]}
            build={(width, palette) => ({
              height: 280,
              marginTop: 20,
              marginRight: 32,
              marginBottom: 42,
              marginLeft: 64,
              x: {
                type: "band",
                label: "Minimum LMArena score tier →",
                tickFormat: (d: number) => `>= ${d}`,
              },
              y: {
                grid: true,
                label: "↑ Cheapest blended USD / 1M",
                tickFormat: (d: number) => formatPricePerM(d),
              },
              marks: [
                Plot.barY(latestByThreshold, {
                  x: "threshold",
                  y: "blended",
                  fill: (d) => (d.threshold === selectedThreshold ? palette.signal : palette.electric),
                  fillOpacity: (d) => (d.threshold === selectedThreshold ? 0.95 : 0.45),
                }),
                Plot.text(latestByThreshold, {
                  x: "threshold",
                  y: "blended",
                  text: (d) => `${formatPricePerM(d.blended)}`,
                  dy: -8,
                  fill: palette.text,
                  fontSize: 11,
                }),
                Plot.tip(
                  latestByThreshold,
                  Plot.pointer({
                    x: "threshold",
                    y: "blended",
                    fill: palette.surface,
                    stroke: palette.grid,
                    title: (d) =>
                      `Tier >= ${d.threshold}\n${shortModelName(d.modelName)}\n${formatPricePerM(d.blended)} / 1M (Arena ${d.arenaScore.toFixed(1)})`,
                  }),
                ),
              ],
            })}
          />
        )}
      </ChartCard>

      {/* CHART 2: PER-MODEL PRICE TRACKER */}
      <ChartCard
        id="price-per-model"
        takeaway="Compare blended API pricing (3:1 in:out) across flagship and budget models."
        keyNumber={`${selectedModels.length} tracked`}
        keyNumberLabel="Selected models"
        keyNumberTone="electric"
        source="Source: OpenRouter public models API (openrouter.ai) · Blended 3:1 input:output"
        filename="sgdev-price-per-model.png"
        controls={
          <div className="w-full space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Toggle up to 8 models:
              </span>
              <input
                type="search"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Filter models..."
                className="font-mono w-48 border border-[var(--grid)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--text)] placeholder:text-[var(--muted)]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredPickerModels.map((m) => {
                const active = selectedIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModel(m.id)}
                    className={`font-mono cursor-pointer px-2 py-1 text-[11px] border transition-colors ${
                      active
                        ? "border-[var(--signal)] text-[var(--text)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                        : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {shortModelName(m.name)}
                  </button>
                );
              })}
            </div>
          </div>
        }
      >
        <PlotFigure
          ariaLabel="Blended price per model comparison"
          minHeight={300}
          deps={[modelSeriesFlat, isMultiSnapshot]}
          build={(width, palette) =>
            isMultiSnapshot
              ? {
                  height: 340,
                  marginTop: 20,
                  marginRight: 28,
                  marginBottom: 42,
                  marginLeft: 62,
                  x: { type: "point", label: "Snapshot date" },
                  y: {
                    type: "log",
                    grid: true,
                    label: "↑ Blended USD / 1M (log)",
                    tickFormat: (d: number) => formatPricePerM(d),
                  },
                  marks: [
                    Plot.line(modelSeriesFlat, {
                      x: "date",
                      y: "blended",
                      z: "name",
                      stroke: (d) => (d.openWeights ? palette.amber : palette.electric),
                      strokeWidth: 2,
                    }),
                    Plot.dot(modelSeriesFlat, {
                      x: "date",
                      y: "blended",
                      r: 4,
                      fill: (d) => (d.openWeights ? palette.amber : palette.electric),
                    }),
                    Plot.tip(
                      modelSeriesFlat,
                      Plot.pointer({
                        x: "date",
                        y: "blended",
                        fill: palette.surface,
                        stroke: palette.grid,
                        title: (d) =>
                          `${d.name} (${d.date})\nBlended: ${formatPricePerM(d.blended)} / 1M\nIn: ${formatPricePerM(d.inputPrice)} · Out: ${formatPricePerM(d.outputPrice)}`,
                      }),
                    ),
                  ],
                }
              : {
                  height: Math.max(220, selectedModels.length * 40 + 60),
                  marginTop: 12,
                  marginRight: 72,
                  marginBottom: 42,
                  marginLeft: width < 640 ? 130 : 200,
                  x: {
                    grid: true,
                    label: "Blended USD / 1M tokens (3:1 in:out) →",
                    tickFormat: (d: number) => formatPricePerM(d),
                  },
                  y: { label: null },
                  marks: [
                    Plot.barX(modelSeriesFlat, {
                      x: "blended",
                      y: "name",
                      sort: { y: "x", reverse: true },
                      fill: (d) => (d.openWeights ? palette.amber : palette.electric),
                      fillOpacity: 0.85,
                    }),
                    Plot.text(modelSeriesFlat, {
                      x: "blended",
                      y: "name",
                      text: (d) => formatPricePerM(d.blended),
                      dx: 6,
                      textAnchor: "start",
                      fill: palette.text,
                      fontSize: 11,
                    }),
                    Plot.tip(
                      modelSeriesFlat,
                      Plot.pointer({
                        x: "blended",
                        y: "name",
                        fill: palette.surface,
                        stroke: palette.grid,
                        title: (d) =>
                          `${d.name}\nBlended: ${formatPricePerM(d.blended)} / 1M\nInput: ${formatPricePerM(d.inputPrice)} · Output: ${formatPricePerM(d.outputPrice)}\nArena: ${d.arenaScore.toFixed(1)}`,
                      }),
                    ),
                  ],
                }
          }
        />
      </ChartCard>
    </div>
  );
}
