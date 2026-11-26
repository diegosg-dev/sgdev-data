import { useMemo, useState } from "react";
import * as Plot from "@observablehq/plot";
import type { FrontierData, TaskPresetId } from "../lib/schema";
import {
  TASK_PRESETS,
  computeDollarBuys,
  formatCompact,
  formatPricePerM,
  getPreset,
  shortModelName,
} from "../lib/analytics";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  frontierData: FrontierData;
}

const QUALITY_FLOORS = [0, 1350, 1400, 1450];

export default function DollarBuysChart({ frontierData }: Props) {
  const [presetId, setPresetId] = useState<TaskPresetId>("coding");
  const [minArena, setMinArena] = useState<number>(1400);

  const preset = getPreset(presetId);

  const rows = useMemo(() => {
    const filtered = frontierData.models.filter((m) => m.arenaScore >= minArena);
    return computeDollarBuys(filtered, preset).slice(0, 16);
  }, [frontierData.models, preset, minArena]);

  const topRow = rows[0] ?? null;

  return (
    <div className="grid gap-8">
      <ChartCard
        id="dollar-buys"
        takeaway={
          topRow
            ? `$1 buys ${formatCompact(topRow.runsPerDollar)} ${preset.unitLabel} on ${shortModelName(topRow.name)} (${formatCompact(topRow.tokensPerDollar)} tokens).`
            : `What $1 buys for ${preset.label.toLowerCase()} workloads.`
        }
        keyNumber={topRow ? `${formatCompact(topRow.runsPerDollar)}` : "—"}
        keyNumberLabel={topRow ? `${preset.unitLabel} per $1` : "Tasks per $1"}
        source={`Source: OpenRouter prices · LMArena style-control (CC BY 4.0) · ${preset.description}`}
        filename={`sgdev-dollar-buys-${preset.id}.png`}
        controls={
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Task:
              </span>
              {TASK_PRESETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPresetId(t.id)}
                  className={`font-mono cursor-pointer px-2.5 py-1 text-xs border transition-colors ${
                    presetId === t.id
                      ? "border-[var(--signal)] text-[var(--text)] bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                      : "border-[var(--grid)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Quality floor:
              </span>
              {QUALITY_FLOORS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setMinArena(q)}
                  className={`font-mono cursor-pointer px-2 py-1 text-[11px] border ${
                    minArena === q
                      ? "border-[var(--electric)] text-[var(--text)] bg-[color-mix(in_srgb,var(--electric)_14%,transparent)]"
                      : "border-[var(--grid)] text-[var(--muted)]"
                  }`}
                >
                  {q === 0 ? "All" : `>= ${q}`}
                </button>
              ))}
            </div>
          </>
        }
      >
        <PlotFigure
          ariaLabel={`Horizontal bar chart of ${preset.unitLabel} per dollar`}
          minHeight={340}
          deps={[rows, preset]}
          build={(width, palette) => ({
            height: Math.max(260, rows.length * 30 + 60),
            marginTop: 12,
            marginRight: 78,
            marginBottom: 42,
            marginLeft: width < 640 ? 140 : 210,
            x: {
              grid: true,
              label: `${preset.unitLabel} per $1 USD →`,
              tickFormat: (d: number) => formatCompact(d),
            },
            y: {
              domain: rows.map((r) => shortModelName(r.name)),
              label: null,
            },
            marks: [
              Plot.barX(rows, {
                x: "runsPerDollar",
                y: (d) => shortModelName(d.name),
                fill: (d) => (d.openWeights ? palette.amber : palette.electric),
                fillOpacity: 0.85,
              }),
              Plot.text(rows, {
                x: "runsPerDollar",
                y: (d) => shortModelName(d.name),
                text: (d) => formatCompact(d.runsPerDollar),
                dx: 6,
                textAnchor: "start",
                fill: palette.text,
                fontSize: 10,
              }),
              Plot.tip(
                rows,
                Plot.pointer({
                  x: "runsPerDollar",
                  y: (d) => shortModelName(d.name),
                  fill: palette.surface,
                  stroke: palette.grid,
                  title: (d) =>
                    [
                      shortModelName(d.name),
                      `${formatCompact(d.runsPerDollar)} ${preset.unitLabel} / $1`,
                      `${formatCompact(d.tokensPerDollar)} tokens / $1`,
                      `Arena: ${d.arenaScore.toFixed(1)} · Blended: ${formatPricePerM(d.blended)}/1M`,
                    ].join("\n"),
                }),
              ),
            ],
          })}
        />
      </ChartCard>

      {/* Compact tabular breakdown */}
      <section className="chart-panel p-5 md:p-6 space-y-3">
        <h3 className="font-mono m-0 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
          Token &amp; task breakdown ({preset.description})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[var(--grid)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Weights</th>
                <th className="py-2 pr-3 text-right">Arena</th>
                <th className="py-2 pr-3 text-right">Tokens / $1</th>
                <th className="py-2 text-right">{preset.unitLabel} / $1</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--grid)]/60 last:border-0">
                  <td className="py-2 pr-3 text-[var(--text)]">
                    {shortModelName(r.name)}
                    <span className="ml-1.5 text-[10px] text-[var(--muted)]">{r.provider}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={r.openWeights ? "text-[var(--amber)]" : "text-[var(--electric)]"}>
                      {r.openWeights ? "Open" : "Closed"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular">{r.arenaScore.toFixed(1)}</td>
                  <td className="py-2 pr-3 text-right tabular">{formatCompact(r.tokensPerDollar)}</td>
                  <td className="py-2 text-right tabular text-[var(--signal)] font-medium">
                    {formatCompact(r.runsPerDollar)}
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
