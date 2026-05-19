// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// CM6 theme + syntax highlight style. All colours flow through CSS
// variables defined in `styles.css`, so the editor automatically tracks
// `prefers-color-scheme: dark` along with the rest of the SPA.
// We intentionally do NOT pass `{ dark: ... }` here — letting CM6
// pick light/dark itself causes its baseTheme to fight the SPA palette.
// The hard-coded `dark: false` flag is dropped so CM6 falls back to
// neutral defaults that our CSS-var rules then override.
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
    ".cm-activeLine":       { backgroundColor: "var(--cm-active-line)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--cm-active-line-gutter)",
                              color: "var(--text)" },
    ".cm-selectionBackground, ::selection, .cm-content ::selection": {
        backgroundColor: "var(--cm-selection)",
    },
    ".cm-focused":    { outline: "none" },
});

export const zhacHighlight = syntaxHighlighting(HighlightStyle.define([
    { tag: t.keyword,                color: "var(--syn-keyword)", fontWeight: "600" },
    { tag: [t.string, t.regexp],     color: "var(--syn-string)" },
    { tag: [t.number, t.bool, t.null], color: "var(--syn-number)" },
    { tag: t.comment,                color: "var(--syn-comment)", fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)],
                                     color: "var(--syn-function)" },
    { tag: t.operator,               color: "var(--syn-operator)" },
    { tag: t.typeName,               color: "var(--syn-type)" },
]));
