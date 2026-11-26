import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("sgdev-theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="font-mono inline-flex items-center gap-2 border border-[var(--grid)] bg-[var(--surface)] px-3 py-1.5 text-xs uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: theme === "dark" ? "var(--signal)" : "var(--amber)" }}
        aria-hidden
      />
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
