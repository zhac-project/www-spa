// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Lua script list + editor.
// Scripts are named (lowercase, [-_a-z0-9], max 24 chars); file size reported
// by the server. Editor uses the plain CodeEditor component (textarea + gutter).
import { useState } from "preact/hooks";
import { scripts, bootstrapScripts, readScript, writeScript,
         deleteScript as delScript, runScript } from "../stores/scripts.js";
import { showToast } from "../stores/ui.js";
import { fmtBytes } from "../utils.js";
import { Modal } from "../components/Modal.jsx";
import { LuaEditor } from "../components/LuaEditor.jsx";
import { ScriptHelp } from "../components/ScriptHelp.jsx";

const NAME_RE = /^[a-z][a-z0-9_-]{0,23}$/;

export function ScriptsPage() {
    const [editing, setEditing] = useState(null); // { name, src, isNew }
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState("src");         // "src" | "help"

    async function openEdit(name) {
        setLoading(true);
        setTab("src");
        try {
            const rsp = await readScript(name);
            const src = (rsp && typeof rsp.src === "string") ? rsp.src : "";
            setEditing({ name, src, isNew: false });
        } catch (e) { showToast("Load failed: " + e.message, "err"); }
        finally { setLoading(false); }
    }

    function openNew() {
        setTab("src");
        setEditing({ name: "", src: "", isNew: true });
    }

    async function save() {
        if (!editing) return;
        const rawName = editing.isNew
            ? (editing.name || "").trim().toLowerCase()
            : editing.name;
        if (!NAME_RE.test(rawName)) {
            showToast("Invalid name: lowercase letters, digits, _ or -, max 24, starts with a letter", "err");
            return;
        }
        try {
            await writeScript(rawName, editing.src || "");
            showToast("Script saved", "ok");
            setEditing(null);
        } catch (e) { showToast("Save failed: " + e.message, "err"); }
    }

    async function remove(name) {
        if (!confirm(`Delete script "${name}"?`)) return;
        try { await delScript(name); showToast("Deleted", "ok"); }
        catch (e) { showToast("Delete failed: " + e.message, "err"); }
    }

    async function run(name) {
        try { await runScript(name); showToast(`Ran ${name}`, "ok"); }
        catch (e) { showToast("Run failed: " + e.message, "err"); }
    }

    return (
        <div class="page">
            <div class="toolbar">
                <button onClick={() => bootstrapScripts().catch(e => showToast(e.message, "err"))}>Refresh</button>
                <button class="primary" onClick={openNew}>+ New Script</button>
            </div>

            {scripts.value.length === 0 ? (
                <p class="empty-text">No scripts.</p>
            ) : (
                <table class="data-table">
                    <thead><tr><th>Name</th><th>Size</th><th></th></tr></thead>
                    <tbody>
                        {scripts.value.map(s => (
                            <tr key={s.name}>
                                <td><code class="mono">{s.name}</code></td>
                                <td>{s.size != null ? fmtBytes(s.size) : "—"}</td>
                                <td>
                                    <button class="small" onClick={() => run(s.name)}>Run</button>{" "}
                                    <button class="small" onClick={() => openEdit(s.name)} disabled={loading}>Edit</button>{" "}
                                    <button class="small danger" onClick={() => remove(s.name)}>Del</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <Modal open={!!editing}
                   title={editing?.isNew ? "New Script" : `Edit — ${editing?.name || ""}`}
                   onClose={() => setEditing(null)}
                   footer={<>
                       <button onClick={() => setEditing(null)}>Cancel</button>
                       <button class="primary" onClick={save}>Save</button>
                   </>}>
                {editing && (
                    <>
                        <label class="field-label">Name</label>
                        <input class="field-input"
                               value={editing.name}
                               readonly={!editing.isNew}
                               onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />

                        <div class="tabs">
                            <button class={"tab" + (tab === "src" ? " active" : "")}
                                    onClick={() => setTab("src")}>Source</button>
                            <button class={"tab" + (tab === "help" ? " active" : "")}
                                    onClick={() => setTab("help")}>Help</button>
                        </div>

                        {tab === "src" ? (
                            <>
                                <label class="field-label">Lua source</label>
                                <LuaEditor value={editing.src || ""} rows={16}
                                           onInput={(v) => setEditing({ ...editing, src: v })}
                                           onSave={save}
                                           onRun={editing.isNew ? null : () => run(editing.name)} />
                                <p class="field-hint">
                                    <code>Ctrl-S</code> save · <code>Ctrl-Enter</code> run ·
                                    switch to <b>Help</b> tab for API reference.
                                </p>
                            </>
                        ) : (
                            <ScriptHelp />
                        )}
                    </>
                )}
            </Modal>
        </div>
    );
}
