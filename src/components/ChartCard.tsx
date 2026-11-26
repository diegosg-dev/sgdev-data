import { useRef, useState, type ReactNode } from "react";
import { copyChartElementAsImage } from "../lib/export-image";

interface ChartCardProps {
  id?: string;
  takeaway: string;
  keyNumber?: string;
  keyNumberLabel?: string;
  keyNumberTone?: "signal" | "electric" | "amber" | "danger";
  source: string;
  filename?: string;
  controls?: ReactNode;
  footerExtra?: ReactNode;
  children: ReactNode;
}

const TONE_CLASS: Record<NonNullable<ChartCardProps["keyNumberTone"]>, string> = {
  signal: "text-[var(--signal)]",
  electric: "text-[var(--electric)]",
  amber: "text-[var(--amber)]",
  danger: "text-[var(--danger)]",
};

export default function ChartCard({
  id,
  takeaway,
  keyNumber,
  keyNumberLabel,
  keyNumberTone = "signal",
  source,
  filename = "sgdev-chart.png",
  controls,
  footerExtra,
  children,
}: ChartCardProps) {
  const chartBodyRef = useRef<HTMLDivElement | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "busy" | "copied" | "downloaded" | "error">(
    "idle",
  );

  async function handleCopy() {
    if (!chartBodyRef.current || copyState === "busy") return;
    setCopyState("busy");
    try {
      const outcome = await copyChartElementAsImage({
        container: chartBodyRef.current,
        takeaway,
        keyNumber,
        keyNumberLabel,
        source,
        filename,
      });
      setCopyState(outcome);
      setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  const btnLabel =
    copyState === "busy"
      ? "Rendering..."
      : copyState === "copied"
        ? "Copied PNG"
        : copyState === "downloaded"
          ? "Saved PNG"
          : copyState === "error"
            ? "Export failed"
            : "Copy as image";

  return (
    <section
      id={id}
      className="chart-panel grid gap-4 p-5 md:p-6 md:grid-cols-12"
      data-chart-shell
    >
      <header className="md:col-span-8 space-y-2">
        <h2 className="chart-takeaway m-0">{takeaway}</h2>
        <p className="source-line m-0">{source}</p>
      </header>

      {keyNumber && (
        <div className="md:col-span-4 md:text-right space-y-1">
          {keyNumberLabel && (
            <p className="font-mono m-0 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {keyNumberLabel}
            </p>
          )}
          <p className={`chart-key-number m-0 ${TONE_CLASS[keyNumberTone]}`}>{keyNumber}</p>
        </div>
      )}

      {controls && (
        <div className="md:col-span-12 flex flex-wrap items-center gap-3 border-t border-b border-[var(--grid)] py-3">
          {controls}
        </div>
      )}

      <div ref={chartBodyRef} className="md:col-span-12 relative">
        {children}
      </div>

      <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-xs text-[var(--muted)] font-mono">{footerExtra}</div>
        <button
          type="button"
          onClick={handleCopy}
          disabled={copyState === "busy"}
          className="font-mono cursor-pointer border border-[var(--grid)] bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] transition-colors hover:border-[var(--signal)] hover:text-[var(--text)] disabled:opacity-50"
        >
          {btnLabel}
        </button>
      </div>
    </section>
  );
}
