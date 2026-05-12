// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// CM6 theme + syntax highlight style tuned to the SPA's light palette.
// Single import — both the chrome theme and the token colours live here.
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const zhacTheme = EditorView.theme({
    "&": {
        color: "var(--text)",
        backgroundColor: "var(--card-bg)",
        fontSize: "13px",
        fontFamily: "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
        border: "1px solid var(--border)",
        borderRadius: "4px",
    },
    ".cm-scroller":   { fontFamily: "inherit" },
    ".cm-content":    { padding: "6px 0", caretColor: "var(--blue)" },
    ".cm-gutters":    {
        backgroundColor: "var(--row-a)",
        color:           "var(--muted)",
        border:          "none",
        borderRight:     "1px solid var(--border)",
    },
    ".cm-activeLine":       { backgroundColor: "rgba(26,115,232,0.06)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(26,115,232,0.08)",
                              color: "var(--text)" },
    ".cm-selectionBackground, ::selection, .cm-content ::selection": {
        backgroundColor: "rgba(26,115,232,0.18)",
    },
    ".cm-focused":    { outline: "none" },
}, { dark: false });

export const zhacHighlight = syntaxHighlighting(HighlightStyle.define([
    { tag: t.keyword,                color: "#1558b0", fontWeight: "600" },
    { tag: [t.string, t.regexp],     color: "#2e7d32" },
    { tag: [t.number, t.bool, t.null], color: "#b58100" },
    { tag: t.comment,                color: "#6b7280", fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)],
                                     color: "#6f42c1" },
    { tag: t.operator,               color: "#212121" },
    { tag: t.typeName,               color: "#b58100" },
]));
