import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Theme system (build-plan §2): light / dark / auto, persisted in
 * localStorage, defaulting to system-following. "auto" re-evaluates on
 * system changes while the tab is open.
 */
export type ThemeMode = "light" | "dark" | "auto";

const STORAGE_KEY = "mt_theme";
const CYCLE: ThemeMode[] = ["light", "dark", "auto"];

function readStored(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "auto" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored);

  useEffect(() => {
    apply(mode);
    if (mode !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const cycle = useCallback(() => {
    setMode(CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length] ?? "auto");
  }, [mode, setMode]);

  return <ThemeContext.Provider value={{ mode, setMode, cycle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}

/** Pre-paint kick to avoid a light flash before React mounts. */
export function applyStoredTheme(): void {
  apply(readStored());
}
