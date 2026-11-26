import { useEffect, useState } from "react";

export interface ThemePalette {
  mode: "dark" | "light";
  bg: string;
  surface: string;
  grid: string;
  text: string;
  muted: string;
  signal: string;
  electric: string;
  amber: string;
  danger: string;
}

const DARK_PALETTE: ThemePalette = {
  mode: "dark",
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

const LIGHT_PALETTE: ThemePalette = {
  mode: "light",
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

function readMode(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

export function useThemePalette(): ThemePalette {
  const [mode, setMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setMode(readMode());
    const observer = new MutationObserver(() => {
      setMode(readMode());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return mode === "light" ? LIGHT_PALETTE : DARK_PALETTE;
}
