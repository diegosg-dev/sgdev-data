import { useMemo, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { TimelineData } from "../lib/schema";
import { formatContext, formatPricePerM, shortModelName } from "../lib/analytics";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  data: TimelineData;
}

export default function TimelineChart({ data }: Props) {
  const [weightFilter, setWeightFilter] = useState<"all" | "closed" | "open">("all");

  const points = useMemo(() => {
    return data.models
      .filter((m) => {
        if (weightFilter === "closed" && m.openWeights) return false;
        if (weightFilter === "open" && !m.openWeights) return false;
        return m.contextLength > 0 && Boolean(m.releaseDate);
      })
      .map((m) => ({
        ...m,
        dt: new Date(`${m.releaseDate}T00:00:00Z`),
      }))
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());
  }, [data.models, weightFilter]);

  const maxEnvelope = useMemo(() => {
    const out: typeof points = [];
    let best = 0;
    for (const p of points) {
      if (p.contextLength > best) {
        best = p.contextLength;
        out.push(p);
      }
    }
    return out;
  }, [points]);

  const maxCtx = useMemo(
    () => points.reduce((acc, p) => Math.max(acc, p.contextLength), 0),
    [points],
  );

  return (
    <ChartCard
      id="release-timeline"
      takeaway={`Context windows have scaled to ${formatContext(maxCtx)} tokens across ${points.length} tracked releases.`}
      keyNumber={formatContext(maxCtx)}
      keyNumberLabel="Max context window"
      source={`Source: OpenRouter model metadata (created timestamp & context_length) · LMArena (CC BY 4.0) · Snapshot ${data.snapshotDate}`}
      filename="sgdev-context-timeline.png"
      controls={
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Weights:
          </span>
          {(["all", "closed", "open"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeightFilter(w)}
              className={`font-mono cursor-pointer px-2.5 py-1 text-[11px] uppercase border ${
                weightFilter === w
                  ? "border-[var(--signal)] text-[var(--text)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                  : "border-[var(--grid)] text-[var(--muted)]"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      }
      footerExtra={
        <span className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--electric)]" />
            Closed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
            Open weights
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[var(--signal)]" />
            Record context frontier
          </span>
        </span>
      }
    >
      <PlotFigure
        ariaLabel="Model release date vs context window size timeline"
        minHeight={360}
        deps={[points, maxEnvelope]}
        build={(width, palette) => ({
          height: width < 640 ? 300 : 390,
          marginTop: 22,
          marginRight: 28,
          marginBottom: 42,
          marginLeft: 62,
          x: { type: "utc", label: "Model release / first-seen date →", grid: true },
          y: {
            type: "log",
            grid: true,
            label: "↑ Context window (tokens, log)",
            tickFormat: (d: number) => formatContext(d),
          },
          marks: [
            Plot.line(maxEnvelope, {
              x: "dt",
              y: "contextLength",
              stroke: palette.signal,
              strokeWidth: 1.75,
              curve: "step-after",
            }),
            Plot.dot(points, {
              x: "dt",
              y: "contextLength",
              r: 4.5,
              fill: (d) => (d.openWeights ? palette.amber : palette.electric),
              fillOpacity: 0.78,
            }),
            Plot.tip(
              points,
              Plot.pointer({
                x: "dt",
                y: "contextLength",
                fill: palette.surface,
                stroke: palette.grid,
                title: (d) =>
                  [
                    shortModelName(d.name),
                    `${d.provider} · ${d.openWeights ? "Open weights" : "Closed"}`,
                    `Date: ${d.releaseDate}`,
                    `Context: ${formatContext(d.contextLength)} tokens`,
                    `Arena: ${d.arenaScore.toFixed(1)} · ${formatPricePerM(d.blended)} / 1M`,
                  ].join("\n"),
              }),
            ),
          ],
        })}
      />
    </ChartCard>
  );
}
