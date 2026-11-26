import * as Plot from "@observablehq/plot";
import type { MoversData } from "../lib/schema";
import { formatPricePerM, shortModelName } from "../lib/analytics";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  data: MoversData;
}

export default function MoversView({ data }: Props) {
  const combinedMoves = [...data.drops.slice(0, 10), ...data.increases.slice(0, 10)].sort(
    (a, b) => a.pctChange - b.pctChange,
  );
  const biggestDrop = data.drops[0] ?? null;

  return (
    <div className="grid gap-10">
      <ChartCard
        id="price-movers"
        takeaway={
          data.isInitialSnapshot
            ? `Initial baseline captured on ${data.snapshotDate} — week-over-week price movers appear starting with snapshot #2.`
            : biggestDrop
              ? `${shortModelName(biggestDrop.name)} dropped ${Math.abs(biggestDrop.pctChange).toFixed(1)}% since ${data.previousSnapshotDate}.`
              : `No price changes recorded between ${data.previousSnapshotDate} and ${data.snapshotDate}.`
        }
        keyNumber={
          biggestDrop
            ? `${biggestDrop.pctChange.toFixed(1)}%`
            : `${data.newEntrants.length} new`
        }
        keyNumberLabel={biggestDrop ? "Biggest price drop" : "Recent releases tracked"}
        keyNumberTone={biggestDrop ? "signal" : "amber"}
        source={`Source: OpenRouter weekly snapshots · LMArena style-control (CC BY 4.0) · Snapshot ${data.snapshotDate}`}
        filename={`sgdev-movers-${data.snapshotDate}.png`}
      >
        {combinedMoves.length > 0 ? (
          <PlotFigure
            ariaLabel="Biggest price drops and increases since previous snapshot"
            minHeight={280}
            deps={[combinedMoves]}
            build={(width, palette) => ({
              height: Math.max(240, combinedMoves.length * 32 + 56),
              marginTop: 14,
              marginRight: 52,
              marginBottom: 40,
              marginLeft: width < 640 ? 130 : 200,
              x: {
                grid: true,
                label: "Blended price change (%) →",
                tickFormat: (d: number) => `${d > 0 ? "+" : ""}${d}%`,
              },
              y: {
                domain: combinedMoves.map((m) => shortModelName(m.name)),
                label: null,
              },
              marks: [
                Plot.ruleX([0], { stroke: palette.grid }),
                Plot.barX(combinedMoves, {
                  x: "pctChange",
                  y: (d) => shortModelName(d.name),
                  fill: (d) => (d.pctChange < 0 ? palette.signal : palette.danger),
                }),
                Plot.tip(
                  combinedMoves,
                  Plot.pointer({
                    x: "pctChange",
                    y: (d) => shortModelName(d.name),
                    fill: palette.surface,
                    stroke: palette.grid,
                    title: (d) =>
                      `${shortModelName(d.name)}\n${formatPricePerM(d.prevBlended)} → ${formatPricePerM(d.currBlended)} / 1M (${d.pctChange > 0 ? "+" : ""}${d.pctChange}%)`,
                  }),
                ),
              ],
            })}
          />
        ) : (
          <PlotFigure
            ariaLabel="Recent model entrants by blended price and Arena score"
            minHeight={280}
            deps={[data.newEntrants]}
            build={(width, palette) => ({
              height: 300,
              marginTop: 18,
              marginRight: 28,
              marginBottom: 42,
              marginLeft: 58,
              x: {
                type: "log",
                grid: true,
                label: "Blended price (USD / 1M tokens) →",
                tickFormat: (d: number) => formatPricePerM(d),
              },
              y: {
                grid: true,
                label: "↑ LMArena score",
              },
              marks: [
                Plot.dot(
                  data.newEntrants.filter((e) => e.blended > 0),
                  {
                    x: "blended",
                    y: "arenaScore",
                    r: 5.5,
                    fill: (d) => (d.openWeights ? palette.amber : palette.electric),
                  },
                ),
                Plot.text(
                  data.newEntrants.filter((e) => e.blended > 0),
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
                Plot.tip(
                  data.newEntrants.filter((e) => e.blended > 0),
                  Plot.pointer({
                    x: "blended",
                    y: "arenaScore",
                    fill: palette.surface,
                    stroke: palette.grid,
                    title: (d) =>
                      `${shortModelName(d.name)}\n${d.provider} · ${d.firstSeenDate}\n${formatPricePerM(d.blended)} / 1M · Arena ${d.arenaScore.toFixed(1)}`,
                  }),
                ),
              ],
            })}
          />
        )}
      </ChartCard>

      {/* New entrants table */}
      <section className="chart-panel p-5 md:p-6 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-mono m-0 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            {data.isInitialSnapshot
              ? "Most recently released models in baseline snapshot"
              : `New entrants since ${data.previousSnapshotDate}`}
          </h3>
          <span className="font-mono text-[11px] text-[var(--muted)]">
            {data.newEntrants.length} models
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[var(--grid)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Weights</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Arena</th>
                <th className="py-2 text-right">Blended / 1M</th>
              </tr>
            </thead>
            <tbody>
              {data.newEntrants.map((m) => (
                <tr key={m.id} className="border-b border-[var(--grid)]/60 last:border-0">
                  <td className="py-2 pr-3 text-[var(--text)]">
                    {shortModelName(m.name)}
                    <span className="ml-1.5 text-[10px] text-[var(--muted)]">{m.provider}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={m.openWeights ? "text-[var(--amber)]" : "text-[var(--electric)]"}>
                      {m.openWeights ? "Open" : "Closed"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-[var(--muted)]">{m.firstSeenDate}</td>
                  <td className="py-2 pr-3 text-right tabular">{m.arenaScore.toFixed(1)}</td>
                  <td className="py-2 text-right tabular text-[var(--signal)]">
                    {formatPricePerM(m.blended)}
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
