import { useMemo, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { ProvidersData } from "../lib/schema";
import { formatPricePerM, shortModelName } from "../lib/analytics";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  data: ProvidersData;
}

export default function ProvidersChart({ data }: Props) {
  const [sortBy, setSortBy] = useState<"spread" | "arena">("spread");
  const [query, setQuery] = useState("");

  const sortedModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data.models]
      .filter((m) => !q || m.modelName.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q))
      .sort((a, b) =>
        sortBy === "spread"
          ? b.spreadRatio - a.spreadRatio
          : (b.arenaScore ?? 0) - (a.arenaScore ?? 0),
      )
      .slice(0, 18);
  }, [data.models, sortBy, query]);

  const flatQuotes = useMemo(() => {
    const out: {
      modelLabel: string;
      provider: string;
      blended: number;
      inputPrice: number;
      outputPrice: number;
      quantization: string;
      isMin: boolean;
      isMax: boolean;
    }[] = [];
    for (const m of sortedModels) {
      const label = shortModelName(m.modelName);
      for (const q of m.quotes) {
        out.push({
          modelLabel: label,
          provider: q.provider,
          blended: q.blended,
          inputPrice: q.inputPrice,
          outputPrice: q.outputPrice,
          quantization: q.quantization || "default",
          isMin: q.blended === m.minBlended,
          isMax: q.blended === m.maxBlended,
        });
      }
    }
    return out;
  }, [sortedModels]);

  const rangeRows = useMemo(
    () =>
      sortedModels.map((m) => ({
        modelLabel: shortModelName(m.modelName),
        minBlended: m.minBlended,
        maxBlended: m.maxBlended,
        spreadRatio: m.spreadRatio,
        providerCount: m.quotes.length,
      })),
    [sortedModels],
  );

  const biggestSpread = useMemo(
    () => [...data.models].sort((a, b) => b.spreadRatio - a.spreadRatio)[0] ?? null,
    [data.models],
  );

  return (
    <ChartCard
      id="provider-spread"
      takeaway={
        biggestSpread
          ? `The exact same open-weights model can cost up to ${biggestSpread.spreadRatio.toFixed(1)}× more depending on the inference host.`
          : "Same open-weights model priced across inference providers."
      }
      keyNumber={biggestSpread ? `${biggestSpread.spreadRatio.toFixed(1)}×` : "—"}
      keyNumberLabel={
        biggestSpread ? `Widest spread (${shortModelName(biggestSpread.modelName)})` : "Widest spread"
      }
      keyNumberTone="amber"
      source={`Source: OpenRouter model endpoints (openrouter.ai) · Blended 3:1 in:out · Snapshot ${data.snapshotDate}`}
      filename={`sgdev-provider-spread-${data.snapshotDate}.png`}
      controls={
        <>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Sort:
            </span>
            <button
              type="button"
              onClick={() => setSortBy("spread")}
              className={`font-mono cursor-pointer px-2.5 py-1 text-[11px] border ${
                sortBy === "spread"
                  ? "border-[var(--amber)] text-[var(--text)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)]"
                  : "border-[var(--grid)] text-[var(--muted)]"
              }`}
            >
              Widest spread
            </button>
            <button
              type="button"
              onClick={() => setSortBy("arena")}
              className={`font-mono cursor-pointer px-2.5 py-1 text-[11px] border ${
                sortBy === "arena"
                  ? "border-[var(--amber)] text-[var(--text)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)]"
                  : "border-[var(--grid)] text-[var(--muted)]"
              }`}
            >
              Highest Arena
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter open models..."
            className="font-mono ml-auto w-48 border border-[var(--grid)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--text)] placeholder:text-[var(--muted)]"
          />
        </>
      }
      footerExtra={
        <span className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--signal)]" />
            Cheapest provider
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
            Other providers
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--danger)]" />
            Most expensive provider
          </span>
        </span>
      }
    >
      <PlotFigure
        ariaLabel="Provider price spread dot and range plot for open-weights models"
        minHeight={360}
        deps={[rangeRows, flatQuotes]}
        build={(width, palette) => ({
          height: Math.max(300, rangeRows.length * 34 + 64),
          marginTop: 16,
          marginRight: 58,
          marginBottom: 44,
          marginLeft: width < 640 ? 140 : 220,
          x: {
            type: "log",
            grid: true,
            label: "Blended price (USD / 1M tokens, log scale) →",
            tickFormat: (d: number) => formatPricePerM(d),
          },
          y: {
            domain: rangeRows.map((r) => r.modelLabel),
            label: null,
          },
          marks: [
            Plot.link(rangeRows, {
              x1: "minBlended",
              x2: "maxBlended",
              y1: "modelLabel",
              y2: "modelLabel",
              stroke: palette.grid,
              strokeWidth: 2.5,
            }),
            Plot.dot(flatQuotes, {
              x: "blended",
              y: "modelLabel",
              r: (d) => (d.isMin || d.isMax ? 5 : 3.8),
              fill: (d) =>
                d.isMin ? palette.signal : d.isMax ? palette.danger : palette.amber,
              fillOpacity: 0.9,
            }),
            Plot.text(rangeRows, {
              x: "maxBlended",
              y: "modelLabel",
              text: (d) => `${d.spreadRatio.toFixed(1)}×`,
              dx: 10,
              textAnchor: "start",
              fill: palette.muted,
              fontSize: 10,
            }),
            Plot.tip(
              flatQuotes,
              Plot.pointer({
                x: "blended",
                y: "modelLabel",
                fill: palette.surface,
                stroke: palette.grid,
                title: (d) =>
                  [
                    d.modelLabel,
                    `Provider: ${d.provider} (${d.quantization})`,
                    `Blended: ${formatPricePerM(d.blended)} / 1M`,
                    `In: ${formatPricePerM(d.inputPrice)} · Out: ${formatPricePerM(d.outputPrice)}`,
                  ].join("\n"),
              }),
            ),
          ],
        })}
      />
    </ChartCard>
  );
}
