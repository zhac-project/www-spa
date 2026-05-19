// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Rich Lua editor wrapping CodeMirror 6.
// Lazy-loaded: the CM6 bundle (~60 kB gz) is pulled on first mount,
// so the main SPA bundle stays lean. Falls back to a disabled textarea
// while the chunk is loading.
import { useEffect, useRef, useState } from "preact/hooks";

export function LuaEditor({ value, onInput, rows = 16, onSave, onRun }) {
    const hostRef = useRef(null);
    const viewRef = useRef(null);
    // Keep the latest `value` available to the async setup so a value
    // change while CM6 is still loading doesn't get dropped.
    const latestRef = useRef(value ?? "");
    useEffect(() => { latestRef.current = value ?? ""; }, [value]);

    // Refs for the imperative callbacks so the CM6 keymap always fires
    // the *current* onSave / onRun — not whichever closure happened to be
    // alive at editor-mount time. The mount effect runs once on purpose
    // (rebuilding CM6 on every prop change would flicker + lose history),
    // so we have to ferry the latest props in through refs.
    const onSaveRef = useRef(onSave);
    const onRunRef  = useRef(onRun);
    const onInputRef = useRef(onInput);
    useEffect(() => { onSaveRef.current = onSave; },  [onSave]);
    useEffect(() => { onRunRef.current  = onRun;  },  [onRun]);
    useEffect(() => { onInputRef.current = onInput; }, [onInput]);

    const [ready, setReady] = useState(false);
    const [loadErr, setLoadErr] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [
                    { EditorState },
                    { EditorView, keymap, lineNumbers, highlightActiveLine,
                       highlightActiveLineGutter, drawSelection },
                    { defaultKeymap, history, historyKeymap, indentWithTab },
                    { StreamLanguage, bracketMatching, indentOnInput },
                    { completionKeymap },
                    { lintGutter },
                    { lua },
                    theme,
                    { zhacAutocomplete },
                    { zhacLinter },
                ] = await Promise.all([
                    import("@codemirror/state"),
                    import("@codemirror/view"),
                    import("@codemirror/commands"),
                    import("@codemirror/language"),
                    import("@codemirror/autocomplete"),
                    import("@codemirror/lint"),
                    import("@codemirror/legacy-modes/mode/lua"),
                    import("../editor/lua-theme.js"),
                    import("../editor/zhac-autocomplete.js"),
                    import("../editor/script-lint.js"),
                ]);
                if (cancelled) return;

                const saveRunKeymap = keymap.of([
                    { key: "Mod-s", preventDefault: true,
                      run: () => { onSaveRef.current && onSaveRef.current(); return true; } },
                    { key: "Mod-Enter", preventDefault: true,
                      run: () => { onRunRef.current  && onRunRef.current();  return true; } },
                ]);

                const state = EditorState.create({
                    doc: latestRef.current,
                    extensions: [
                        lineNumbers(),
                        history(),
                        drawSelection(),
                        bracketMatching(),
                        indentOnInput(),
                        highlightActiveLine(),
                        highlightActiveLineGutter(),
                        StreamLanguage.define(lua),
                        theme.zhacTheme,
                        theme.zhacHighlight,
                        lintGutter(),
                        zhacLinter,
                        zhacAutocomplete,
                        keymap.of([...defaultKeymap, ...historyKeymap,
                                    ...completionKeymap, indentWithTab]),
                        saveRunKeymap,
                        EditorView.updateListener.of(u => {
                            if (u.docChanged && onInputRef.current) {
                                onInputRef.current(u.state.doc.toString());
                            }
                        }),
                    ],
                });

                viewRef.current = new EditorView({
                    state, parent: hostRef.current,
                });
                setReady(true);
            } catch (e) {
                setLoadErr(e?.message || "editor load failed");
            }
        })();
        return () => {
            cancelled = true;
            if (viewRef.current) {
                viewRef.current.destroy();
                viewRef.current = null;
            }
        };
        // Mount once — onSave/onRun are read via refs via closure and stay
        // live for the lifetime of the editor. `value` sync happens in the
        // next effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // External-value sync: e.g. parent swapped in a different script.
    useEffect(() => {
        const v = viewRef.current;
        if (!v) return;
        const cur = v.state.doc.toString();
        if (cur === (value ?? "")) return;
        v.dispatch({ changes: { from: 0, to: cur.length, insert: value ?? "" } });
    }, [value]);

    const minHeight = `${Math.max(10, rows) * 1.5}em`;

    async function copyToClipboard() {
        const v = viewRef.current;
        const txt = v ? v.state.doc.toString() : (value ?? "");
        try { await navigator.clipboard.writeText(txt); }
        catch (_) { /* some browsers gate clipboard on secure contexts — fail quietly */ }
    }

    if (loadErr) {
        return (
            <div class="lua-editor-fallback">
                <p class="err-text">Editor failed to load: {loadErr}</p>
                <textarea class="code-editor-input" rows={rows}
                          value={value ?? ""}
                          onInput={(e) => onInput?.(e.currentTarget.value)} />
            </div>
        );
    }

    return (
        <div class="lua-editor-wrap">
            <div class="lua-editor-toolbar">
                <button type="button" class="small"
                        onClick={copyToClipboard}
                        disabled={!ready}>Copy</button>
                <span class="muted">
                    <code>Ctrl-Space</code> completions ·
                    <code>Ctrl-S</code> save ·
                    <code>Ctrl-Enter</code> run
                </span>
            </div>
            <div class="lua-editor"
                 ref={hostRef}
                 style={{ minHeight }}
                 data-ready={ready ? "1" : "0"} />
        </div>
    );
}
