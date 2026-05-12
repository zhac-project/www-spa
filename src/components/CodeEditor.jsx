// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Bare-bones code editor — wraps a <textarea> with a line-number gutter.
// Deliberately zero deps (no CodeMirror / Monaco) to keep bundle small.
import { useEffect, useRef, useState } from "preact/hooks";

export function CodeEditor({ value, onInput, rows = 14, placeholder = "" }) {
    const [text, setText] = useState(value ?? "");
    const [scrollTop, setScrollTop] = useState(0);
    const gutterRef = useRef(null);

    useEffect(() => { setText(value ?? ""); }, [value]);

    const lines = (text || "").split("\n");
    const count = Math.max(lines.length, rows);
    const gutter = [];
    for (let i = 1; i <= count; i++) gutter.push(i);

    useEffect(() => {
        if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
    }, [scrollTop]);

    return (
        <div class="code-editor">
            <div class="code-editor-gutter" ref={gutterRef}>
                {gutter.map(n => <div key={n} class="code-editor-linenum">{n}</div>)}
            </div>
            <textarea
                class="code-editor-input"
                rows={rows}
                placeholder={placeholder}
                value={text}
                onInput={(e) => { setText(e.currentTarget.value); onInput?.(e.currentTarget.value); }}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                spellcheck={false}
            />
        </div>
    );
}
