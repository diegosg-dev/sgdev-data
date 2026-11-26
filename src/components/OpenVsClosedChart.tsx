import { useMemo } from "react";
import * as Plot from "@observablehq/plot";
import type { OpenVsClosedData } from "../lib/schema";
import ChartCard from "./ChartCard";
import PlotFigure from "./PlotFigure";

interface Props {
  data: OpenVsClosedData;
}

export default function OpenVsClosedChart({ data }: Props) {
  const parsed = useMemo(
    () =>
      data.series.map((d) => ({
        ...d,
        dt: new Date(`${d.date}T00:00:00Z`),
      })),
    [data.series],
  );

  const latest = parsed[parsed.length - 1] ?? null;
  const earliest = parsed[0] ?? null;
  const gapDelta = latest && earliest ? latest.gap - earliest.gap : null;

  return (
    <div className="grid gap-10">
      <ChartCard
        id="open-vs-closed-lines"
        takeaway={
          latest
            ? `Open-weights models trail the top closed model by ${latest.gap.toFixed(1)} Arena points (${latest.bestOpenModel} vs ${latest.bestClosedModel}).`
            : "Best open-weights vs best closed Arena score over time."
        }
        keyNumber={latest ? `${latest.gap.toFixed(1)} pts` : "—"}
        keyNumberLabel="Current open vs closed gap"
        keyNumberTone="amber"
        source={`Source: LMArena text_style_control full history (CC BY 4.0) · ${parsed.length} leaderboard snapshots`}
        filename="sgdev-open-vs-closed.png"
        footerExtra={
          <span className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[var(--electric)]" />
              Best closed ({latest ? latest.bestClosedScore.toFixed(1) : "—"})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-[var(--amber)]" />
              Best open weights ({latest ? latest.bestOpenScore.toFixed(1) : "—"})
            </span>
          </span>
        }
      >
        <PlotFigure
          ariaLabel="Best open-weights vs best closed LMArena score over time"
          minHeight={360}
          deps={[parsed]}
          build={(width, palette) => ({
            height: width < 640 ? 300 : 380,
            marginTop: 22,
            marginRight: 28,
            marginBottom: 42,
            marginLeft: 56,
            x: { type: "utc", label: "Leaderboard publish date →", grid: true },
            y: { label: "↑ LMArena score (style-control)", grid: true },
            marks: [
              Plot.areaY(parsed, {
                x: "dt",
                y1: "bestOpenScore",
                y2: "bestClosedScore",
                fill: palette.amber,
                fillOpacity: 0.1,
              }),
              Plot.line(parsed, {
                x: "dt",
                y: "bestClosedScore",
                stroke: palette.electric,
                strokeWidth: 2,
              }),
              Plot.line(parsed, {
                x: "dt",
                y: "bestOpenScore",
                stroke: palette.amber,
                strokeWidth: 2,
              }),
              Plot.tip(
                parsed,
                Plot.pointerX({
                  x: "dt",
                  y: "bestClosedScore",
                  fill: palette.surface,
                  stroke: palette.grid,
                  title: (d) =>
                    [
                      d.date,
                      `Closed: ${d.bestClosedModel} (${d.bestClosedScore.toFixed(1)})`,
                      `Open:   ${d.bestOpenModel} (${d.bestOpenScore.toFixed(1)})`,
                      `Gap:    ${d.gap.toFixed(1)} pts`,
                    ].join("\n"),
                }),
              ),
            ],
          })}
        />
      </ChartCard>

      <ChartCard
        id="open-vs-closed-gap"
        takeaway="Tracking the point spread between closed and open-weights leaders across every LMArena release."
        keyNumber={
          gapDelta !== null
            ? `${gapDelta > 0 ? "+" : ""}${gapDelta.toFixed(1)} pts`
            : "—"
        }
        keyNumberLabel={earliest ? `Gap change since ${earliest.date}` : "Gap change"}
        keyNumberTone={gapDelta !== null && gapDelta <= 0 ? "signal" : "danger"}
        source="Source: LMArena text_style_control full history (CC BY 4.0)"
        filename="sgdev-open-closed-gap.png"
      >
        <PlotFigure
          ariaLabel="Point gap between best closed and best open-weights Arena score over time"
          minHeight={240}
          deps={[parsed]}
          build={(width, palette) => ({
            height: 250,
            marginTop: 18,
            marginRight: 28,
            marginBottom: 40,
            marginLeft: 56,
            x: { type: "utc", label: "Date →", grid: true },
            y: { label: "↑ Closed − Open (Arena pts)", grid: true },
            marks: [
              Plot.ruleY([0], { stroke: palette.grid }),
              Plot.areaY(parsed, {
                x: "dt",
                y: "gap",
                fill: palette.amber,
                fillOpacity: 0.14,
              }),
              Plot.line(parsed, {
                x: "dt",
                y: "gap",
                stroke: palette.amber,
                strokeWidth: 1.75,
              }),
              Plot.tip(
                parsed,
                Plot.pointerX({
                  x: "dt",
                  y: "gap",
                  fill: palette.surface,
                  stroke: palette.grid,
                  title: (d) =>
                    `${d.date}\nGap: ${d.gap.toFixed(1)} pts\n${d.bestClosedModel} vs ${d.bestOpenModel}`,
                }),
              ),
            ],
          })}
        />
      </ChartCard>
    </div>
  );
}
