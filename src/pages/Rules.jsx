// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Rules list + recipe builder + DSL editor. Save failures (e.g. parse errors)
// surface as toasts.
import { RULE_TEMPLATES } from "../templates.js";
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { status, bootstrapStatus, lendBrowserClock } from "../stores/status.js";
import { rules, bootstrapRules, createRule, updateRule, enableRule,
         deleteRule as delRuleCall } from "../stores/rules.js";
import { devices, bootstrapDevices, getDevice, setDeviceAttr } from "../stores/devices.js";
import { showToast, withToast, SUCCESS } from "../stores/ui.js";
import { Modal } from "../components/Modal.jsx";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { RuleHelp } from "../components/RuleHelp.jsx";
import { RECIPES, buildRules, describe, deviceFits, freeTimerIndex, humanize,
         missingField, unknownRefs } from "../recipes.js";

// device.list rows carry no exposes; the pickers need them to know which
// device is a motion sensor and which a light. Fetched once per page visit,
// kept here so reopening the modal is instant.
const deviceDetails = signal({});   // ieee -> detail (with exposes)
let detailsLoading = null;

async function loadDetails() {
    if (detailsLoading) return detailsLoading;
    detailsLoading = (async () => {
        try { if (devices.value.length === 0) await bootstrapDevices(); } catch { /* shown as "no devices" */ }
        const out = { ...deviceDetails.value };
        await Promise.all(devices.value.map(async d => {
            if (out[d.ieee]) return;
            try { out[d.ieee] = await getDevice(d.ieee); } catch { out[d.ieee] = { ieee: d.ieee, exposes: [] }; }
        }));
        deviceDetails.value = out;
    })();
    try { await detailsLoading; } finally { detailsLoading = null; }
}

function nameOf(ref) {
    const d = devices.value.find(x => x.ieee === ref);
    return d ? (d.name || d.friendly || d.ieee) : ref;
}

// One field of a recipe: a device picker limited to devices that fit, or a
// number / time input.
function RecipeField({ field, value, onChange }) {
    if (field.kind === "device") {
        const fitting = devices.value.filter(d => deviceFits(field, deviceDetails.value[d.ieee]));
        return (
            <label class="field-label">
                {field.label}
                <select class="field-input" value={value || ""} onChange={e => onChange(e.currentTarget.value)}>
                    <option value="">— choose —</option>
                    {fitting.map(d => <option key={d.ieee} value={d.ieee}>{d.name || d.friendly || d.ieee}</option>)}
                </select>
                {fitting.length === 0 && (
                    <span class="field-hint">No paired device reports <code>{field.expose}</code>
                        {field.writable ? " that the hub can set" : ""}. Pair one first (Devices → Add a device).</span>
                )}
            </label>
        );
    }
    if (field.kind === "time") {
        return (
            <label class="field-label">{field.label}
                <input class="field-input" type="time" value={value || ""} onInput={e => onChange(e.currentTarget.value)} />
            </label>
        );
    }
    return (
        <label class="field-label">{field.label}
            <input class="field-input" type="number" min={field.min || 1} max={field.max || 9999} value={value ?? ""}
                   onInput={e => onChange(e.currentTarget.value)} />
        </label>
    );
}

// The Recipe tab of the New Rule modal.
function RecipeBuilder({ name, setName, onSaved, onEditAsDsl }) {
    const [recipeId, setRecipeId] = useState("");
    const [values, setValues] = useState({});
    const [loading, setLoading] = useState(true);
    const [testing, setTesting] = useState(false);
    useEffect(() => { loadDetails().finally(() => setLoading(false)); }, []);

    const recipe = RECIPES.find(r => r.id === recipeId);
    function pick(id) {
        const r = RECIPES.find(x => x.id === id);
        setRecipeId(id);
        const v = {};
        for (const f of (r ? r.fields : [])) if (f.def !== undefined) v[f.key] = f.def;
        setValues(v);
        if (r && !name) setName(r.title);
    }

    const missing = recipe ? missingField(recipe, values) : "";
    const timer = freeTimerIndex(rules.value.map(r => r.dsl || r.src || ""));
    const needsTimer = recipe && recipe.id === "motion_light";
    const built = recipe && !missing ? buildRules(recipe, values, { name: name || recipe.title, timer }) : [];

    async function testAction() {
        const a = recipe.test(values);
        setTesting(true);
        await withToast(() => setDeviceAttr(a.ieee, a.key, a.value),
                        `Sent: ${nameOf(a.ieee)} ${a.key} → ${a.value ? "on" : "off"}. Did it react?`, "The hub refused");
        setTesting(false);
    }

    async function save() {
        if (needsTimer && !timer) { showToast("All eight timers are in use by other rules", "err"); return; }
        for (const r of built) {
            const ok = await withToast(() => createRule({ name: r.name, dsl: r.dsl }), `Saved: ${r.name}`, "Save failed");
            if (ok !== SUCCESS) return;
        }
        onSaved();
    }

    return (
        <>
            <label class="field-label">What should happen?
                <select class="field-input" value={recipeId} onChange={e => pick(e.currentTarget.value)}>
                    <option value="">— choose a recipe —</option>
                    {RECIPES.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
            </label>
            {recipe && loading && <p class="field-hint">Reading what your devices can do…</p>}
            {recipe && !loading && recipe.fields.map(f => (
                <RecipeField key={f.key} field={f} value={values[f.key]}
                             onChange={v => setValues({ ...values, [f.key]: v })} />
            ))}
            {recipe && !loading && (
                <div class="recipe-preview">
                    {missing
                        ? <p class="field-hint">Choose: <strong>{missing}</strong>.</p>
                        : <>
                            <p><strong>{describe(recipe, values, nameOf)}</strong></p>
                            {needsTimer && !timer && <p class="error-text">All eight timers are in use by other rules; free one first.</p>}
                            <pre class="dsl-preview">{built.map(r => humanize(r.dsl, devices.value)).join("\n")}</pre>
                            <div class="btn-strip">
                                <button onClick={testAction} disabled={testing}>Test the action now</button>
                                <button onClick={() => onEditAsDsl(built)} disabled={built.length !== 1}
                                        title={built.length !== 1 ? "This recipe makes two rules; edit them from the list" : ""}>
                                    Edit as DSL
                                </button>
                            </div>
                          </>}
                </div>
            )}
            <div class="btn-strip">
                <button class="primary" onClick={save} disabled={!recipe || !!missing || (needsTimer && !timer)}>
                    {built.length > 1 ? `Save ${built.length} rules` : "Save rule"}
                </button>
            </div>
        </>
    );
}

export function RulesPage() {
    const [editing, setEditing] = useState(null); // null | {}: new | existing rule
    const [tab, setTab] = useState("dsl");         // "recipe" | "dsl" | "help"

    // Fresh status on open: clock_set flips once the hub syncs its time, and
    // not every firmware pushes status ticks. Devices: for names and the
    // missing-device badge in the list.
    useEffect(() => {
        bootstrapStatus().catch(() => {});
        if (devices.value.length === 0) bootstrapDevices().catch(() => {});
    }, []);

    async function useThisClock() {
        const ok = await lendBrowserClock();
        showToast(ok ? "Hub clock set from this device" : "The hub did not take the time",
                  ok ? "ok" : "err");
    }

    function openNew() {
        setTab("recipe");
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
        if (ok === SUCCESS) close();
    }

    const devs = devices.value;
    const isNew = editing && editing.id == null;

    return (
        <div class="page">
            <div class="toolbar">
                <button onClick={() => bootstrapRules().catch(e => showToast(e.message, "err"))}>Refresh</button>
                <button class="primary" onClick={openNew}>+ New Rule</button>
            </div>
            {status.value.clock_set === false && (
                <div class="card clock-unset" role="status">
                    <p><strong>The hub's clock is not set yet</strong>, so scheduled rules
                    (<code>Time#Cron</code>) and Lua cron handlers are waiting. Other rules work
                    as usual. The hub gets the time from the internet, or from a browser that
                    opens its web UI; after a power cut without internet it needs it again.</p>
                    <button onClick={useThisClock}>Use this device's time</button>
                </div>
            )}
            {rules.value.length === 0 ? (
                <p class="empty-text">No rules yet. <strong>+ New Rule</strong> offers recipes: pick a sensor and a light, no typing.</p>
            ) : (
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Name</th><th>Rule</th><th>Active</th><th></th></tr></thead>
                    <tbody>
                        {rules.value.map(r => {
                            const dsl = r.dsl || r.src || "";
                            const unknown = devs.length ? unknownRefs(dsl, devs) : [];
                            return (
                                <tr key={r.id}>
                                    <td>{r.id}</td>
                                    <td>{r.name || "—"}</td>
                                    <td>
                                        <span class="dsl">{humanize(dsl, devs)}</span>
                                        {unknown.length > 0 && (
                                            <span class="rule-warn" title={`No paired device is called ${unknown.join(", ")}`}>
                                                {" "}⚠ unknown device: {unknown.join(", ")}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <label class="toggle">
                                            <input type="checkbox" checked={!!r.enabled} aria-label={`Rule ${r.name || r.id} active`}
                                                   onChange={() => toggle(r)} />
                                            <span class="toggle-slider" />
                                        </label>
                                    </td>
                                    <td>
                                        <button class="small" onClick={() => openEdit(r)}>Edit</button>{" "}
                                        <button class="small danger" onClick={() => remove(r)}>Del</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            <Modal open={!!editing}
                   title={editing && editing.id != null ? `Edit Rule #${editing.id}` : "New Rule"}
                   onClose={close}
                   footer={tab === "recipe" ? <button onClick={close}>Cancel</button> : <>
                       <button onClick={close}>Cancel</button>
                       <button class="primary" onClick={save}>Save</button>
                   </>}>
                {editing && (
                    <>
                        <label class="field-label" for="rule-name">Name</label>
                        <input id="rule-name" value={editing.name || ""} class="field-input"
                               onInput={(e) => setEditing({ ...editing, name: e.currentTarget.value })} />

                        <div class="tabs">
                            {isNew && (
                                <button class={"tab" + (tab === "recipe" ? " active" : "")}
                                        onClick={() => setTab("recipe")}>Recipe</button>
                            )}
                            <button class={"tab" + (tab === "dsl" ? " active" : "")}
                                    onClick={() => setTab("dsl")}>DSL</button>
                            <button class={"tab" + (tab === "help" ? " active" : "")}
                                    onClick={() => setTab("help")}>Help</button>
                        </div>

                        {tab === "recipe" && isNew ? (
                            <RecipeBuilder name={editing.name || ""}
                                           setName={n => setEditing({ ...editing, name: n })}
                                           onSaved={close}
                                           onEditAsDsl={built => { setEditing({ ...editing, name: built[0].name, dsl: built[0].dsl }); setTab("dsl"); }} />
                        ) : tab === "dsl" ? (
                            <>
                                {isNew && (
                                    <>
                                        <label class="field-label" for="rule-template">Start from a template</label>
                                        <select id="rule-template" class="field-input" value=""
                                                onChange={(e) => {
                                                    const t = RULE_TEMPLATES[Number(e.currentTarget.value)];
                                                    if (t) setEditing({ ...editing, name: t.name, dsl: t.dsl });
                                                }}>
                                            <option value="">— blank rule —</option>
                                            {RULE_TEMPLATES.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
                                        </select>
                                        <p class="field-hint">Replace the CAPITALISED words with your devices' names, or use
                                            the <b>Recipe</b> tab to pick them from a list.</p>
                                    </>
                                )}
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
