/**
 * Monaco custom theme definitions — Dracula, Monokai, Nord, Light.
 *
 * Each export is a monaco.editor.IStandaloneThemeData-compatible object.
 * Registered via `monaco.editor.defineTheme(name, data)` in beforeMount.
 */

/* eslint-disable sonarjs/no-duplicate-string -- theme data has naturally repeated color tokens */

import type { EditorThemeName } from "@/hooks/use-editor-theme";

interface MonacoThemeData {
  base: "vs" | "vs-dark" | "hc-black";
  inherit: boolean;
  rules: Array<{ token: string; foreground?: string; fontStyle?: string }>;
  colors: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Dracula — matches user's screenshot                                */
/* ------------------------------------------------------------------ */

const dracula: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "f8f8f2" },
    { token: "comment", foreground: "6272a4", fontStyle: "italic" },
    { token: "keyword", foreground: "ff79c6" },
    { token: "keyword.control", foreground: "ff79c6" },
    { token: "storage", foreground: "ff79c6" },
    { token: "storage.type", foreground: "8be9fd", fontStyle: "italic" },
    { token: "string", foreground: "f1fa8c" },
    { token: "string.key.json", foreground: "8be9fd" },
    { token: "string.value.json", foreground: "f1fa8c" },
    { token: "number", foreground: "bd93f9" },
    { token: "number.json", foreground: "bd93f9" },
    { token: "constant", foreground: "bd93f9" },
    { token: "variable", foreground: "f8f8f2" },
    { token: "variable.parameter", foreground: "ffb86c", fontStyle: "italic" },
    { token: "type", foreground: "8be9fd", fontStyle: "italic" },
    { token: "type.identifier", foreground: "8be9fd", fontStyle: "italic" },
    { token: "function", foreground: "50fa7b" },
    { token: "identifier", foreground: "f8f8f2" },
    { token: "delimiter", foreground: "f8f8f2" },
    { token: "delimiter.bracket", foreground: "f8f8f2" },
    { token: "operator", foreground: "ff79c6" },
    { token: "tag", foreground: "ff79c6" },
    { token: "attribute.name", foreground: "50fa7b" },
    { token: "attribute.value", foreground: "f1fa8c" },
    { token: "metatag", foreground: "f8f8f2" },
    { token: "regexp", foreground: "ff5555" },
  ],
  colors: {
    "editor.background": "#282a36",
    "editor.foreground": "#f8f8f2",
    "editor.lineHighlightBackground": "#44475a",
    "editor.selectionBackground": "#44475a",
    "editor.selectionHighlightBackground": "#44475a80",
    "editorCursor.foreground": "#f8f8f2",
    "editorWhitespace.foreground": "#44475a",
    "editorIndentGuide.background": "#44475a",
    "editorLineNumber.foreground": "#6272a4",
    "editorLineNumber.activeForeground": "#f8f8f2",
    "editor.findMatchBackground": "#ffb86c40",
    "editor.findMatchHighlightBackground": "#ffb86c20",
    "editorGutter.background": "#282a36",
    "editorWidget.background": "#21222c",
    "editorWidget.border": "#44475a",
    "input.background": "#21222c",
    "dropdown.background": "#21222c",
    "list.activeSelectionBackground": "#44475a",
    "list.hoverBackground": "#44475a80",
    "scrollbarSlider.background": "#44475a80",
    "scrollbarSlider.hoverBackground": "#44475aCC",
  },
};

/* ------------------------------------------------------------------ */
/*  Monokai                                                            */
/* ------------------------------------------------------------------ */

const monokai: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "f8f8f2" },
    { token: "comment", foreground: "75715e", fontStyle: "italic" },
    { token: "keyword", foreground: "f92672" },
    { token: "keyword.control", foreground: "f92672" },
    { token: "storage", foreground: "f92672" },
    { token: "storage.type", foreground: "66d9ef", fontStyle: "italic" },
    { token: "string", foreground: "e6db74" },
    { token: "string.key.json", foreground: "f92672" },
    { token: "string.value.json", foreground: "e6db74" },
    { token: "number", foreground: "ae81ff" },
    { token: "number.json", foreground: "ae81ff" },
    { token: "constant", foreground: "ae81ff" },
    { token: "variable", foreground: "f8f8f2" },
    { token: "variable.parameter", foreground: "fd971f", fontStyle: "italic" },
    { token: "type", foreground: "66d9ef", fontStyle: "italic" },
    { token: "type.identifier", foreground: "a6e22e" },
    { token: "function", foreground: "a6e22e" },
    { token: "identifier", foreground: "f8f8f2" },
    { token: "delimiter", foreground: "f8f8f2" },
    { token: "operator", foreground: "f92672" },
    { token: "tag", foreground: "f92672" },
    { token: "attribute.name", foreground: "a6e22e" },
    { token: "attribute.value", foreground: "e6db74" },
    { token: "regexp", foreground: "e6db74" },
  ],
  colors: {
    "editor.background": "#272822",
    "editor.foreground": "#f8f8f2",
    "editor.lineHighlightBackground": "#3e3d32",
    "editor.selectionBackground": "#49483e",
    "editorCursor.foreground": "#f8f8f0",
    "editorWhitespace.foreground": "#3b3a32",
    "editorIndentGuide.background": "#3b3a32",
    "editorLineNumber.foreground": "#90908a",
    "editorLineNumber.activeForeground": "#c2c2bf",
    "editorGutter.background": "#272822",
    "editorWidget.background": "#1e1f1c",
    "scrollbarSlider.background": "#49483e80",
  },
};

/* ------------------------------------------------------------------ */
/*  Nord                                                               */
/* ------------------------------------------------------------------ */

const nord: MonacoThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "d8dee9" },
    { token: "comment", foreground: "616e88", fontStyle: "italic" },
    { token: "keyword", foreground: "81a1c1" },
    { token: "keyword.control", foreground: "81a1c1" },
    { token: "storage", foreground: "81a1c1" },
    { token: "storage.type", foreground: "81a1c1" },
    { token: "string", foreground: "a3be8c" },
    { token: "string.key.json", foreground: "8fbcbb" },
    { token: "string.value.json", foreground: "a3be8c" },
    { token: "number", foreground: "b48ead" },
    { token: "number.json", foreground: "b48ead" },
    { token: "constant", foreground: "b48ead" },
    { token: "variable", foreground: "d8dee9" },
    { token: "variable.parameter", foreground: "d8dee9" },
    { token: "type", foreground: "8fbcbb" },
    { token: "type.identifier", foreground: "8fbcbb" },
    { token: "function", foreground: "88c0d0" },
    { token: "identifier", foreground: "d8dee9" },
    { token: "delimiter", foreground: "eceff4" },
    { token: "operator", foreground: "81a1c1" },
    { token: "tag", foreground: "81a1c1" },
    { token: "attribute.name", foreground: "8fbcbb" },
    { token: "attribute.value", foreground: "a3be8c" },
    { token: "regexp", foreground: "ebcb8b" },
  ],
  colors: {
    "editor.background": "#2e3440",
    "editor.foreground": "#d8dee9",
    "editor.lineHighlightBackground": "#3b4252",
    "editor.selectionBackground": "#434c5e",
    "editorCursor.foreground": "#d8dee9",
    "editorWhitespace.foreground": "#434c5e",
    "editorIndentGuide.background": "#434c5e",
    "editorLineNumber.foreground": "#4c566a",
    "editorLineNumber.activeForeground": "#d8dee9",
    "editorGutter.background": "#2e3440",
    "editorWidget.background": "#2e3440",
    "scrollbarSlider.background": "#434c5e80",
  },
};

/* ------------------------------------------------------------------ */
/*  Light                                                              */
/* ------------------------------------------------------------------ */

const light: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "", foreground: "383a42" },
    { token: "comment", foreground: "a0a1a7", fontStyle: "italic" },
    { token: "keyword", foreground: "a626a4" },
    { token: "keyword.control", foreground: "a626a4" },
    { token: "storage", foreground: "a626a4" },
    { token: "storage.type", foreground: "a626a4" },
    { token: "string", foreground: "50a14f" },
    { token: "string.key.json", foreground: "e45649" },
    { token: "string.value.json", foreground: "50a14f" },
    { token: "number", foreground: "986801" },
    { token: "number.json", foreground: "986801" },
    { token: "constant", foreground: "986801" },
    { token: "variable", foreground: "383a42" },
    { token: "variable.parameter", foreground: "383a42" },
    { token: "type", foreground: "c18401" },
    { token: "type.identifier", foreground: "c18401" },
    { token: "function", foreground: "4078f2" },
    { token: "identifier", foreground: "383a42" },
    { token: "delimiter", foreground: "383a42" },
    { token: "operator", foreground: "a626a4" },
    { token: "tag", foreground: "e45649" },
    { token: "attribute.name", foreground: "986801" },
    { token: "attribute.value", foreground: "50a14f" },
    { token: "regexp", foreground: "986801" },
  ],
  colors: {
    "editor.background": "#fafafa",
    "editor.foreground": "#383a42",
    "editor.lineHighlightBackground": "#f0f0f0",
    "editor.selectionBackground": "#bfceff",
    "editorCursor.foreground": "#526eff",
    "editorWhitespace.foreground": "#d3d3d3",
    "editorIndentGuide.background": "#d3d3d3",
    "editorLineNumber.foreground": "#9d9d9f",
    "editorLineNumber.activeForeground": "#383a42",
    "editorGutter.background": "#fafafa",
    "editorWidget.background": "#f0f0f0",
    "scrollbarSlider.background": "#c0c0c080",
  },
};

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

export const MONACO_THEMES: Record<EditorThemeName, MonacoThemeData> = {
  dracula,
  monokai,
  nord,
  light,
};

/** Register all custom themes with a Monaco instance. */
export function registerCustomThemes(monaco: { editor: { defineTheme: (name: string, data: MonacoThemeData) => void } }): void {
  for (const [name, data] of Object.entries(MONACO_THEMES)) {
    monaco.editor.defineTheme(name, data);
  }
}
