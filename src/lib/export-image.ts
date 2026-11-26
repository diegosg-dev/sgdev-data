import { formatUsd, shortModelName } from "./analytics";
import type { GoodEnoughResult, TaskPreset } from "./schema";

function getThemePalette() {
  const isLight =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light";
  if (isLight) {
    return {
      bg: "#f4f6f8",
      surface: "#ffffff",
      grid: "#d8dee8",
      text: "#12151a",
      muted: "#5c6678",
      signal: "#0f9f6e",
      electric: "#2f6fe0",
      amber: "#c47a10",
      danger: "#d93a3a",
    };
  }
  return {
    bg: "#0b0d10",
    surface: "#13161b",
    grid: "#232832",
    text: "#e6e8eb",
    muted: "#8a93a3",
    signal: "#3ddc97",
    electric: "#4c8dff",
    amber: "#ffb547",
    danger: "#ff5c5c",
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Render an Observable Plot SVG (plus Terminal Editorial header & source line) to PNG
 * and copy to clipboard (falling back to PNG download if clipboard image write is unsupported).
 */
export async function copyChartElementAsImage(opts: {
  container: HTMLElement;
  takeaway: string;
  keyNumber?: string;
  keyNumberLabel?: string;
  source: string;
  filename: string;
}): Promise<"copied" | "downloaded"> {
  const svg = opts.container.querySelector("svg");
  if (!svg) {
    throw new Error("No SVG chart found to export");
  }

  const palette = getThemePalette();
  const rect = svg.getBoundingClientRect();
  const svgWidth = Math.max(600, Math.round(rect.width || Number(svg.getAttribute("width")) || 800));
  const svgHeight = Math.max(260, Math.round(rect.height || Number(svg.getAttribute("height")) || 400));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(svgWidth));
  clone.setAttribute("height", String(svgHeight));
  // Inline computed font & color so standalone SVG renders crisply
  clone.style.color = palette.text;
  clone.style.fontFamily = '"JetBrains Mono", ui-monospace, monospace';

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
    img.src = svgUrl;
  });
  URL.revokeObjectURL(svgUrl);

  const pad = 32;
  const headerH = 92;
  const footerH = 44;
  const canvasW = svgWidth + pad * 2;
  const canvasH = headerH + svgHeight + footerH + pad;
  const scale = 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW * scale;
  canvas.height = canvasH * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, canvasW - 1, canvasH - 1);

  // Header: takeaway
  ctx.fillStyle = palette.text;
  ctx.font = '600 20px "Inter", system-ui, sans-serif';
  const titleLines = wrapText(ctx, opts.takeaway, canvasW - pad * 2 - (opts.keyNumber ? 220 : 0));
  titleLines.slice(0, 2).forEach((line, idx) => {
    ctx.fillText(line, pad, pad + 20 + idx * 26);
  });

  // Key number (top-right)
  if (opts.keyNumber) {
    ctx.textAlign = "right";
    if (opts.keyNumberLabel) {
      ctx.fillStyle = palette.muted;
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillText(opts.keyNumberLabel.toUpperCase(), canvasW - pad, pad + 10);
    }
    ctx.fillStyle = palette.signal;
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillText(opts.keyNumber, canvasW - pad, pad + 40);
    ctx.textAlign = "left";
  }

  // Divider
  ctx.strokeStyle = palette.grid;
  ctx.beginPath();
  ctx.moveTo(pad, headerH - 8);
  ctx.lineTo(canvasW - pad, headerH - 8);
  ctx.stroke();

  // Chart SVG
  ctx.drawImage(img, pad, headerH, svgWidth, svgHeight);

  // Footer source + SGDev watermark
  const footerY = canvasH - 18;
  ctx.fillStyle = palette.muted;
  ctx.font = '400 11px "JetBrains Mono", monospace';
  ctx.fillText(opts.source, pad, footerY);

  ctx.textAlign = "right";
  ctx.fillStyle = palette.text;
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillText("SGDev/LLM · llm.sgdev.es", canvasW - pad, footerY);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas PNG failed"))), "image/png");
  });

  try {
    if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "copied";
    }
  } catch {
    // Fall back to download when clipboard permissions aren't granted
  }

  downloadBlob(blob, opts.filename);
  return "downloaded";
}

/**
 * Export a 1200x675 Terminal Editorial share card for Good-Enough Finder.
 */
export async function exportGoodEnoughCard(opts: {
  result: GoodEnoughResult;
  preset: TaskPreset;
  monthlyRuns: number;
  minScore: number;
  openOnly: boolean;
  snapshotDate: string;
}): Promise<void> {
  const { result, preset, monthlyRuns, minScore, openOnly, snapshotDate } = opts;
  if (!result.winner) return;

  const W = 1200;
  const H = 675;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Always render share cards in signature dark Terminal Editorial palette
  const bg = "#0b0d10";
  const surface = "#13161b";
  const grid = "#232832";
  const text = "#e6e8eb";
  const muted = "#8a93a3";
  const signal = "#3ddc97";
  const electric = "#4c8dff";
  const amber = "#ffb547";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle background grid
  ctx.strokeStyle = "rgba(35, 40, 50, 0.55)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  // Main surface panel
  const pad = 48;
  ctx.fillStyle = surface;
  ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

  // Top green accent bar
  ctx.fillStyle = signal;
  ctx.fillRect(pad, pad, W - pad * 2, 4);

  // Brand header
  ctx.fillStyle = text;
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText("SGDev", pad + 40, pad + 52);
  const sgWidth = ctx.measureText("SGDev").width;
  ctx.fillStyle = signal;
  ctx.fillText("/", pad + 40 + sgWidth, pad + 52);
  ctx.fillStyle = text;
  ctx.fillText("LLM DATA", pad + 40 + sgWidth + 12, pad + 52);

  ctx.textAlign = "right";
  ctx.fillStyle = muted;
  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.fillText(`GOOD-ENOUGH FINDER · ${snapshotDate}`, W - pad - 40, pad + 52);
  ctx.textAlign = "left";

  // Query summary pills
  ctx.fillStyle = muted;
  ctx.font = '500 16px "JetBrains Mono", monospace';
  const queryLine = `${preset.label.toUpperCase()}  ·  ${monthlyRuns.toLocaleString("en-US")} RUNS/MO  ·  ARENA >= ${minScore}${openOnly ? "  ·  OPEN WEIGHTS ONLY" : ""}`;
  ctx.fillText(queryLine, pad + 40, pad + 106);

  // Winner model name
  ctx.fillStyle = text;
  ctx.font = '700 44px "Inter", system-ui, sans-serif';
  const winnerName = shortModelName(result.winner.name);
  ctx.fillText(winnerName, pad + 40, pad + 178);

  // Badge: provider + open/closed + score
  ctx.fillStyle = result.winner.openWeights ? amber : electric;
  ctx.font = '600 16px "JetBrains Mono", monospace';
  const badgeText = `${result.winner.provider.toUpperCase()}  ·  ${result.winner.openWeights ? "OPEN WEIGHTS" : "CLOSED"}  ·  ARENA ${result.winner.arenaScore.toFixed(1)}`;
  ctx.fillText(badgeText, pad + 40, pad + 216);

  // KPI strip
  const kpiY = pad + 260;
  const kpiH = 128;
  const kpiW = (W - pad * 2 - 80 - 24) / 2;

  // Box 1: Monthly Cost
  ctx.fillStyle = bg;
  ctx.fillRect(pad + 40, kpiY, kpiW, kpiH);
  ctx.strokeStyle = grid;
  ctx.strokeRect(pad + 40, kpiY, kpiW, kpiH);
  ctx.fillStyle = muted;
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText("ESTIMATED MONTHLY COST", pad + 64, kpiY + 34);
  ctx.fillStyle = signal;
  ctx.font = '700 48px "JetBrains Mono", monospace';
  ctx.fillText(`${formatUsd(result.winner.monthlyCost)}/mo`, pad + 64, kpiY + 96);

  // Box 2: Savings vs Premium
  const box2X = pad + 40 + kpiW + 24;
  ctx.fillStyle = bg;
  ctx.fillRect(box2X, kpiY, kpiW, kpiH);
  ctx.strokeStyle = grid;
  ctx.strokeRect(box2X, kpiY, kpiW, kpiH);
  ctx.fillStyle = muted;
  ctx.font = '500 13px "JetBrains Mono", monospace';
  const baseName = result.premiumBaseline
    ? shortModelName(result.premiumBaseline.name)
    : "PREMIUM";
  ctx.fillText(`SAVINGS VS ${baseName.toUpperCase()}`, box2X + 24, kpiY + 34);
  ctx.fillStyle = text;
  ctx.font = '700 44px "JetBrains Mono", monospace';
  ctx.fillText(
    `${Math.round(result.savingsPct)}% (${formatUsd(result.monthlySavings)}/mo)`,
    box2X + 24,
    kpiY + 96,
  );

  // Top alternatives line
  if (result.alternatives.length > 0) {
    ctx.fillStyle = muted;
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillText("RUNNER-UPS:", pad + 40, kpiY + kpiH + 46);
    const altsText = result.alternatives
      .slice(0, 3)
      .map((a) => `${shortModelName(a.name)} (${formatUsd(a.monthlyCost)}/mo)`)
      .join("   ·   ");
    ctx.fillStyle = text;
    ctx.font = '400 14px "JetBrains Mono", monospace';
    ctx.fillText(altsText, pad + 150, kpiY + kpiH + 46);
  }

  // Footer attribution
  ctx.strokeStyle = grid;
  ctx.beginPath();
  ctx.moveTo(pad + 40, H - pad - 56);
  ctx.lineTo(W - pad - 40, H - pad - 56);
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = '400 13px "JetBrains Mono", monospace';
  ctx.fillText(
    "Source: OpenRouter (openrouter.ai) · LMArena style-control (CC BY 4.0) · @DiegoSGDev",
    pad + 40,
    H - pad - 24,
  );

  ctx.textAlign = "right";
  ctx.fillStyle = signal;
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText("llm.sgdev.es", W - pad - 40, H - pad - 24);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Card export failed"))), "image/png");
  });
  downloadBlob(blob, `sgdev-good-enough-${preset.id}-${minScore}.png`);
}
