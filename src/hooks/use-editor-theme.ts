/**
 * Global editor theme hook — persists the user's Monaco theme choice in localStorage.
 */

import { useState, useCallback, useSyncExternalStore } from "react";

export type EditorThemeName = "dracula" | "monokai" | "nord" | "light";

const STORAGE_KEY = "marco_editor_theme";
const DEFAULT_THEME: EditorThemeName = "dracula";

const VALID: Set<string> = new Set<EditorThemeName>(["dracula", "monokai", "nord", "light"]);

let listeners: Array<() => void> = [];
function emit() { listeners.forEach((l) => l()); }

function getSnapshot(): EditorThemeName {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && VALID.has(v)) return v as EditorThemeName;
  } catch { /* SSR / sandbox */ }
  return DEFAULT_THEME;
}

/** React hook — returns current theme + setter. */
export function useEditorTheme() {
  const theme = useSyncExternalStore(
    (cb) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; },
    getSnapshot,
    () => DEFAULT_THEME,
  );

  const setTheme = useCallback((t: EditorThemeName) => {
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
    emit();
  }, []);

  return { editorTheme: theme, setEditorTheme: setTheme } as const;
}

export const EDITOR_THEME_OPTIONS: Array<{
  value: EditorThemeName;
  label: string;
  bg: string;
  accents: string[];
}> = [
  { value: "dracula", label: "Dracula", bg: "#282a36", accents: ["#ff79c6", "#f1fa8c", "#8be9fd"] },
  { value: "monokai", label: "Monokai", bg: "#272822", accents: ["#f92672", "#e6db74", "#66d9ef"] },
  { value: "nord", label: "Nord", bg: "#2e3440", accents: ["#81a1c1", "#a3be8c", "#ebcb8b"] },
  { value: "light", label: "Light", bg: "#fafafa", accents: ["#4078f2", "#50a14f", "#e45649"] },
];
