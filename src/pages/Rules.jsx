// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Rules list + DSL editor. Save failures (e.g. parse errors) surface as toasts.
import { useState } from "preact/hooks";
import { rules, bootstrapRules, createRule, updateRule, enableRule,
         deleteRule as delRuleCall } from "../stores/rules.js";
import { showToast, withToast } from "../stores/ui.js";
import { Modal } from "../components/Modal.jsx";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { RuleHelp } from "../components/RuleHelp.jsx";

export function RulesPage() {
    const [editing, setEditing] = useState(null); // null | {}: new | existing rule
    const [tab, setTab] = useState("dsl");         // "dsl" | "help"

    function openNew() {
        setTab("dsl");
        setEditing({ name: "", dsl: "" });
    }
    function openEdit(r) {
        // Server returns the source as `src`; normalise to `dsl` for the
        // CodeEditor binding (display column also falls back via `r.dsl ||
        // r.src`). Without this the textarea opened empty even though the
        // list view showed the script body.
        const dsl = r.dsl || r.src || "";
        setTab("dsl");
        setEditing({ ...r, dsl });
    }
    function close() { setEditing(null); }

    async function toggle(r) {
        await withToast(() => enableRule(r.id, !r.enabled),
                         r.enabled ? "Disabled" : "Enabled", "Failed");
    }

    async function remove(r) {
        if (!confirm("Delete rule " + r.id + "?")) return;
        await withToast(() => delRuleCall(r.id), "Deleted", "Delete failed");
    }

    async function save() {
        if (!editing) return;
        const body = { name: (editing.name || "").trim(), dsl: editing.dsl || "" };
        // Parse errors come back with the DSL detail in `err.message`.
        const ok = await withToast(
            () => editing.id == null ? createRule(body)
                                      : updateRule({ id: editing.id, ...body }),
            "Rule saved", "Save failed");
        if (ok !== undefined) close();
    }

    return (
        <div class="page">
            <div class="toolbar">
                <button onClick={() => bootstrapRules().catch(e => showToast(e.message, "err"))}>Refresh</button>
                <button class="primary" onClick={openNew}>+ New Rule</button>
            </div>
            {rules.value.length === 0 ? (
                <p class="empty-text">No rules.</p>
            ) : (
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Name</th><th>DSL</th><th>Active</th><th></th></tr></thead>
                    <tbody>
                        {rules.value.map(r => (
                            <tr key={r.id}>
                                <td>{r.id}</td>
                                <td>{r.name || "—"}</td>
                                <td><span class="dsl">{r.dsl || r.src || ""}</span></td>
                                <td>
                                    <label class="toggle">
                                        <input type="checkbox" checked={!!r.enabled}
                                               onChange={() => toggle(r)} />
                                        <span class="toggle-slider" />
                                    </label>
                                </td>
                                <td>
                                    <button class="small" onClick={() => openEdit(r)}>Edit</button>{" "}
                                    <button class="small danger" onClick={() => remove(r)}>Del</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <Modal open={!!editing}
                   title={editing && editing.id != null ? `Edit Rule #${editing.id}` : "New Rule"}
                   onClose={close}
                   footer={<>
                       <button onClick={close}>Cancel</button>
                       <button class="primary" onClick={save}>Save</button>
                   </>}>
                {editing && (
                    <>
                        <label class="field-label">Name</label>
                        <input value={editing.name || ""} class="field-input"
                               onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />

                        <div class="tabs">
                            <button class={"tab" + (tab === "dsl" ? " active" : "")}
                                    onClick={() => setTab("dsl")}>DSL</button>
                            <button class={"tab" + (tab === "help" ? " active" : "")}
                                    onClick={() => setTab("help")}>Help</button>
                        </div>

                        {tab === "dsl" ? (
                            <>
                                <label class="field-label">DSL</label>
                                <CodeEditor value={editing.dsl || ""} rows={8}
                                            onInput={(v) => setEditing({ ...editing, dsl: v })} />
                                <p class="field-hint">
                                    Switch to <b>Help</b> tab for a quick reference.
                                    See Log page for parse errors.
                                </p>
                            </>
                        ) : (
                            <RuleHelp />
                        )}
                    </>
                )}
            </Modal>
        </div>
    );
}
