import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import { useThemePalette, type ThemePalette } from "./useThemePalette";

interface PlotFigureProps {
  build: (width: number, palette: ThemePalette) => Plot.PlotOptions;
  deps?: unknown[];
  minHeight?: number;
  ariaLabel: string;
}

export default function PlotFigure({
  build,
  deps = [],
  minHeight = 320,
  ariaLabel,
}: PlotFigureProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const palette = useThemePalette();
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || width <= 0) return;

    const options = build(width, palette);
    const chart = Plot.plot({
      ...options,
      width,
      style: {
        background: "transparent",
        color: palette.muted,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: "11px",
        overflow: "visible",
        ...(typeof options.style === "object" && options.style !== null ? options.style : {}),
      },
    });

    el.innerHTML = "";
    el.append(chart);

    return () => {
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, palette, ...deps]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className="w-full overflow-x-auto"
      style={{ minHeight }}
    />
  );
}
