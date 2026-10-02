import { useState, useEffect } from "react";
import { BRANDING, APP_STORAGE_KEYS } from "../config/branding.js";

export type ThemeName = "obsidian" | "phantom" | "blood" | "frost" | "pink";

export const THEMES: { id: ThemeName; label: string }[] = [
  { id: "pink", label: "Lily Blossom (Soft Pink Glass)" },
  { id: "obsidian", label: "Obsidian" },
  { id: "phantom", label: "Phantom Violet" },
  { id: "blood", label: "Blood Circuit" },
  { id: "frost", label: "Neon Frost" },
];

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(APP_STORAGE_KEYS.theme);
    const oldSaved = localStorage.getItem("teleoffer-theme");
    if (oldSaved && !saved) {
      localStorage.setItem(APP_STORAGE_KEYS.theme, oldSaved);
      localStorage.removeItem("teleoffer-theme");
      return oldSaved as ThemeName;
    }
    return (saved as ThemeName) || "pink";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(APP_STORAGE_KEYS.theme, theme);
    document.title = `${BRANDING.productName} Dashboard`;
  }, [theme]);

  return { theme, setTheme, themes: THEMES };
}
