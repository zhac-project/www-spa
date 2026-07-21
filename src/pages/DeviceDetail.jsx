// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Per-device page, four tabs mirroring the legacy UI: Info · States · Bind · Options.
// TODO: Bind tab currently lists bindings from d.bindings and wires to
// `device.bind` + `device.bind (unbind:true)`. Options tab is a
// placeholder for device-specific UI driven by `exposes`.
import { useEffect, useState } from "preact/hooks";
import { ui, navigate, showToast, withToast, SUCCESS } from "../stores/ui.js";
import { getDevice, renameDevice, reinterviewDevice, configureDevice,
         deleteDevice, setDeviceAttr, bindDevice, setDeviceGroup } from "../stores/devices.js";
import { devices as devicesStore } from "../stores/devices.js";
import { uplinkGet, deviceRainmakerList, deviceRainmakerAdd, deviceRainmakerRemove } from "../stores/rainmaker.js";
import { fmtSince, hex16 } from "../utils.js";
import { Spinner } from "../components/Spinner.jsx";
import { call } from "../ws/client.js";

const TABS = [
    { id: "info",     label: "Info"     },
    { id: "states",   label: "States"   },
    { id: "commands", label: "Commands" },
    { id: "bind",     label: "Bind"     },
    { id: "groups",   label: "Groups"   },
    { id: "options",  label: "Options"  },
];

// Overlay `live` (from the devices-store row for this IEEE) onto the
// detail snapshot: spread its attrs in, prefer its fresher last_seen/lqi.
// Returns `detail` unchanged when no live row exists.
function mergeLiveAttrs(detail, live) {
    if (!live) return detail;
    return {
        ...detail,
        attrs:     { ...(detail.attrs || {}), ...(live.attrs || {}) },
        last_seen: live.last_seen ?? detail.last_seen,
        lqi:       live.lqi       ?? detail.lqi,
    };
}

export function DeviceDetailPage() {
    const ieee = ui.value.currentDeviceIeee;
    const [tab, setTab] = useState("info");
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy]   = useState(false);
    const [renameVal, setRenameVal] = useState("");

    // Initial + when store updates (attr.changed etc.) refresh in place.
    // We read from devicesStore as a fast-path fallback while the detail
    // request resolves.
    //
    // `cancelled` flag pattern: when the user clicks fast between devices
    // (ieee1 → ieee2) an inflight getDevice(ieee1) can resolve AFTER
    // ieee2's response and stomp the newer data. The cleanup sets
    // cancelled=true so the stale .then never calls setDetail. Also
    // clears `detail` synchronously on change so the old IEEE's UI
    // doesn't flash during the new request.
    useEffect(() => {
        if (!ieee) return;
        let cancelled = false;
        setDetail(null);
        setError(null);
        setRenameVal("");
        getDevice(ieee)
            .then(d => {
                if (cancelled) return;
                setDetail(d);
                setRenameVal(d?.name || "");
            })
            .catch(e => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, [ieee]);

    // Merge live attr updates from the store into the detail view so
    // State tab repaints when attr.changed events arrive.
    const live = devicesStore.value.find(x =>
        x.ieee && ieee && String(x.ieee).toLowerCase() === String(ieee).toLowerCase());
    const d = detail ? mergeLiveAttrs(detail, live) : null;

    if (!ieee) return <p class="page">No device selected.</p>;

    async function doRename(override) {
        const name = ((override != null ? override : renameVal) || "").trim();
        if (!name) return;
        setBusy(true);
        try {
            await renameDevice(ieee, name);
            showToast("Renamed", "ok");
            setDetail({ ...detail, name });
            setRenameVal(name);
        }
        catch (e) {
            showToast("Rename failed: " + e.message, "err");
            throw e;
        }
        finally { setBusy(false); }
    }
    async function doReinterview() {
        setBusy(true);
        await withToast(() => reinterviewDevice(ieee), "Re-interview started", "Re-interview failed");
        setBusy(false);
    }
    // "Configure" re-runs only the bindings + reports + config_steps
    // pipeline; skips the full ZNP interview. Use after a firmware
    // update that added new wiring to an existing paired device's def
    // (e.g. ZG-204Z gained read-on-join for sensitivity / keep_time —
    // those values populate after one click, no re-pair needed).
    async function doConfigure() {
        setBusy(true);
        await withToast(() => configureDevice(ieee), "Configure re-fired", "Configure failed");
        setBusy(false);
    }
    const [hardRemove, setHardRemove] = useState(false);
    async function doRemove() {
        const msg = hardRemove
            ? `HARD-remove ${ieee}?\n\nAlso wipes the device's NVS entry, shadow attrs, and adapter cache — on rejoin the coordinator runs a fresh interview against the current definition library.`
            : `Remove ${ieee} from the network?\n\n(Soft — NVS + shadow kept so a rejoin fast-paths back with the last-known state.)`;
        if (!confirm(msg)) return;
        setBusy(true);
        const ok = await withToast(
            () => deleteDevice(ieee, hardRemove),
            hardRemove ? "Device hard-removed" : "Device removed",
            "Remove failed",
        );
        setBusy(false);
        if (ok === SUCCESS) navigate("devices");
    }

    if (error) return (
        <div class="page">
            <button onClick={() => navigate("devices")}>← Back</button>
            <p class="error-text">Failed to load: {error}</p>
        </div>
    );
    if (!d) return <div class="page"><Spinner /></div>;

    return (
        <div class="page">
            <div class="dev-wrapper">
                <div class="dev-tabs" role="tablist">
                    {TABS.map(t => (
                        <a key={t.id}
                           href="javascript:void(0)"
                           role="tab"
                           aria-selected={tab === t.id}
                           class={"tab " + (tab === t.id ? "active" : "")}
                           onClick={(e) => { e.preventDefault(); setTab(t.id); }}>
                            {t.label}
                        </a>
                    ))}
                </div>
                <div class="dev-card">
                    {tab === "info"     && <InfoTab     d={d} renameVal={renameVal} setRenameVal={setRenameVal} doRename={doRename} />}
                    {tab === "states"   && <StatesTab   d={d} ieee={ieee} />}
                    {tab === "commands" && <CommandsTab d={d} ieee={ieee} />}
                    {tab === "bind"     && <BindTab     d={d} ieee={ieee} />}
                    {tab === "groups"   && <GroupsTab   d={d} ieee={ieee} />}
                    {tab === "options"  && <OptionsTab  d={d} ieee={ieee} />}

                    <div class="dev-bottom-bar">
                        <div class="btn-strip">
                            <button onClick={() => navigate("devices")}>← Back</button>
                            <button onClick={doReinterview} disabled={busy}>Re-interview</button>
                            <button onClick={doConfigure}
                                    disabled={busy}
                                    title="Re-run only bindings + reports + config_steps (skip interview). Use after a firmware update adds new wiring to a paired device.">
                                Configure
                            </button>
                            <label class="hard-toggle"
                                   title="Hard remove — also wipe NVS, shadow, and adapter caches so rejoin runs a full interview">
                                <input type="checkbox"
                                       checked={hardRemove}
                                       onChange={(e) => setHardRemove(e.currentTarget.checked)} />
                                <span>hard</span>
                            </label>
                            <button class="danger small" onClick={doRemove} disabled={busy}>Remove</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoTab({ d, renameVal, setRenameVal, doRename }) {
    const eps = d.eps || [];
    const epClusters = d.clusters || [];
    return (
        <div class="tab-panel">
            <table class="kv-table">
                <tbody>
                    <tr><th>Friendly Name</th><td>
                        <EditableLabel value={d.name || ""} onSave={(v) => {
                            setRenameVal(v);
                            return doRename(v);
                        }} placeholder="—" />
                    </td></tr>
                    <tr><th>IEEE</th><td><code class="mono">{d.ieee}</code></td></tr>
                    <tr><th>NWK</th><td>{hex16(d.nwk)}</td></tr>
                    <tr><th>Manufacturer</th><td>{d.manufacturer || "—"}</td></tr>
                    <tr><th>Model</th><td>{d.model || "—"}</td></tr>
                    <tr><th>Power Source</th><td>{d.power_source || "—"}</td></tr>
                    <tr><th>LQI</th><td>{d.lqi != null ? d.lqi : "—"}</td></tr>
                    <tr><th>Last seen</th><td>{fmtSince(d.last_seen)}</td></tr>
                    <tr><th>Converter</th><td>{d.vendor && d.model ? `${d.vendor}/${d.model}` : "none"}</td></tr>
                    {eps.map((epId, i) => (
                        <tr key={epId}>
                            <th>Endpoint #{epId}</th>
                            <td><code class="mono">{(epClusters[i] || []).map(hex16).join(" ")}</code></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Label-by-default, click the ✏ to switch to an input with ✓ / ✗.
// Escape cancels, Enter commits. `onSave` returns a Promise — UI
// stays in edit mode until it resolves so the user sees failures
// from the server before the label locks back.
function EditableLabel({ value, onSave, placeholder = "—" }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft]     = useState(value || "");
    const [busy, setBusy]       = useState(false);
    useEffect(() => { if (!editing) setDraft(value || ""); }, [value]);

    async function commit() {
        const v = (draft || "").trim();
        if (!v || v === value) { setEditing(false); return; }
        setBusy(true);
        try { await onSave(v); setEditing(false); }
        catch (_) { /* toast shown by caller — stay in edit mode */ }
        finally { setBusy(false); }
    }
    function cancel() { setDraft(value || ""); setEditing(false); }

    if (!editing) {
        return (
            <span class="editable-label">
                <span class="editable-label-text">{value || placeholder}</span>
                <button class="icon-btn" title="Edit" aria-label="Edit"
                        onClick={() => setEditing(true)}>✏</button>
            </span>
        );
    }
    return (
        <span class="editable-label">
            <input autoFocus value={draft}
                   onInput={(e) => setDraft(e.currentTarget.value)}
                   onKeyDown={(e) => {
                       if (e.key === "Enter")  commit();
                       if (e.key === "Escape") cancel();
                   }}
                   style="padding:4px 8px;border:1px solid var(--border);border-radius:3px" />
            <button class="icon-btn ok" title="Save" disabled={busy} onClick={commit}>✓</button>
            <button class="icon-btn" title="Cancel" disabled={busy} onClick={cancel}>✗</button>
        </span>
    );
}

function StatesTab({ d, ieee }) {
    const attrs = d.attrs || {};
    const keys = Object.keys(attrs).sort();
    // Index exposes by attribute name so each row can look up its
    // type / access bits / enum values. Server-provided, canonical.
    const exposeMap = {};
    for (const e of (d.exposes || [])) {
        if (e && e.name) exposeMap[e.name] = e;
    }
    if (!keys.length) {
        return <div class="tab-panel"><p class="empty-text">No attributes reported yet.</p></div>;
    }
    return (
        <div class="tab-panel">
            <table class="data-table dev-states">
                <thead><tr><th>Attribute</th><th>Value</th><th></th></tr></thead>
                <tbody>
                    {keys.map(k => (
                        <AttrRow key={k} ieee={ieee} k={k} v={attrs[k]}
                                 expose={exposeMap[k]} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Access bitmask from `exposes[n].access` — z2m convention.
// Server emits these in `hap_json_encode_device_info` via
// `zhac_adapter_build_exposes_json` (see components/zhc_adapter).
const ACCESS_STATE = 0x01;   // publishes / is observable
const ACCESS_SET   = 0x02;   // writable
// ACCESS_GET = 0x04 — not consumed in the UI right now.

function isWritable(expose) {
    // Unknown expose → read-only. Many attrs are published-only by the
    // converter (e.g. Xiaomi cube's angle / action_angle) and aren't in
    // the device's exposes list at all; defaulting to editable shows a
    // meaningless "Set" button that would no-op. Only attrs the server
    // explicitly marks with the SET bit should show the write control.
    if (!expose) return false;
    return (expose.access & ACCESS_SET) !== 0;
}

function AttrRow({ ieee, k, v, expose }) {
    const writable = isWritable(expose);
    const type     = expose?.type || inferType(v);
    if (!writable) {
        return (
            <tr>
                <td><code class="mono">{k}</code></td>
                <td>
                    <span class="ro-val">{formatReadonly(v)}</span>
                    {expose?.unit && <span class="ro-unit"> {expose.unit}</span>}
                </td>
                <td><span class="ro-tag">read-only</span></td>
            </tr>
        );
    }
    // Writable: dispatch by type.
    if (type === "binary") {
        return <AttrBoolRow ieee={ieee} k={k} v={!!v} />;
    }
    if (type === "enum" && expose?.values?.length) {
        return <AttrEnumRow ieee={ieee} k={k} v={v} values={expose.values} />;
    }
    return <AttrTextRow ieee={ieee} k={k} v={v}
                         isNumeric={type === "numeric"} unit={expose?.unit} />;
}

function inferType(v) {
    if (typeof v === "boolean") return "binary";
    if (typeof v === "number")  return "numeric";
    return "text";
}

function formatReadonly(v) {
    if (v == null) return "—";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number")  return String(v);
    return String(v);
}

function AttrBoolRow({ ieee, k, v }) {
    const [busy, setBusy] = useState(false);
    // Optimistic local override. null = follow parent (shadow) value;
    // non-null = we just toggled and are waiting for the server's
    // attr.bulk broadcast to confirm. When parent v actually changes
    // we clear the override so reality wins.
    const [localV, setLocalV] = useState(null);
    useEffect(() => { setLocalV(null); }, [v]);
    const shown = localV !== null ? localV : !!v;
    async function toggle(e) {
        const next = e.currentTarget.checked;
        setLocalV(next);            // flip UI immediately
        setBusy(true);
        try { await setDeviceAttr(ieee, k, next); showToast("Set " + k + " = " + next, "ok"); }
        catch (err) {
            setLocalV(null);         // revert on failure
            showToast("Set failed: " + err.message, "err");
        }
        finally { setBusy(false); }
    }
    return (
        <tr>
            <td><code class="mono">{k}</code></td>
            <td>
                <label class="toggle">
                    <input type="checkbox" checked={shown} onChange={toggle} disabled={busy} />
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td><span class="ro-tag">{shown ? "on" : "off"}</span></td>
        </tr>
    );
}

function AttrTextRow({ ieee, k, v, isNumeric, unit }) {
    const [val, setVal] = useState(v ?? "");
    const [busy, setBusy] = useState(false);
    useEffect(() => setVal(v ?? ""), [v]);
    async function save() {
        setBusy(true);
        const parsed = isNumeric ? Number(val) : val;
        try { await setDeviceAttr(ieee, k, parsed); showToast("Set " + k, "ok"); }
        catch (e) { showToast("Set failed: " + e.message, "err"); }
        finally { setBusy(false); }
    }
    return (
        <tr>
            <td><code class="mono">{k}</code></td>
            <td>
                <input type={isNumeric ? "number" : "text"}
                       value={val}
                       onInput={(e) => setVal(e.currentTarget.value)}
                       onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                       style="padding:4px 8px;border:1px solid var(--border);border-radius:3px;width:160px" />
                {unit && <span class="ro-unit"> {unit}</span>}
            </td>
            <td><button class="small" onClick={save} disabled={busy}>Set</button></td>
        </tr>
    );
}

function AttrEnumRow({ ieee, k, v, values }) {
    const [busy, setBusy] = useState(false);
    const [localV, setLocalV] = useState(null);
    useEffect(() => { setLocalV(null); }, [v]);
    const shown = localV !== null ? localV : (v == null ? "" : String(v));
    async function pick(e) {
        const next = e.currentTarget.value;
        if (next === shown) return;
        setLocalV(next);
        setBusy(true);
        try { await setDeviceAttr(ieee, k, next); showToast("Set " + k + " = " + next, "ok"); }
        catch (err) {
            setLocalV(null);
            showToast("Set failed: " + err.message, "err");
        }
        finally { setBusy(false); }
    }
    return (
        <tr>
            <td><code class="mono">{k}</code></td>
            <td>
                <select value={shown} onChange={pick} disabled={busy}
                        style="padding:4px 8px;border:1px solid var(--border);border-radius:3px">
                    {(shown !== "" && !values.includes(shown)) && (
                        <option value={shown}>{String(shown)}</option>
                    )}
                    {values.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </td>
            <td><span class="ro-tag">enum</span></td>
        </tr>
    );
}

// Commands tab — write-only ("fire-and-forget") exposes that the
// device accepts as Set but never publishes back as State. Typical
// examples: Tuya IR remotes' `learn_ir_code` / `ir_code_to_send`,
// scene-controller "press button N" triggers, identify cluster
// effects. State-bearing writables (state, brightness, …) live on
// the States tab.
function CommandsTab({ d, ieee }) {
    const cmds = (d.exposes || []).filter(e =>
        e && (e.access & ACCESS_SET) && !(e.access & ACCESS_STATE));
    if (!cmds.length) {
        return (
            <div class="tab-panel">
                <p class="tab-hint">Write-only commands the device accepts. Sent via <code>device.attr.set</code>.</p>
                <p class="empty-text">This device exposes no write-only commands.</p>
            </div>
        );
    }
    return (
        <div class="tab-panel">
            <p class="tab-hint">Write-only commands the device accepts. Sent via <code>device.attr.set</code>.</p>
            <table class="data-table dev-states">
                <thead><tr><th>Command</th><th>Value</th><th></th></tr></thead>
                <tbody>
                    {cmds.map(e => (
                        <CommandRow key={e.name} ieee={ieee} expose={e} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function CommandRow({ ieee, expose }) {
    const { name, type, unit, values } = expose;
    const [busy, setBusy] = useState(false);
    const [val, setVal]   = useState(
        type === "binary" ? true :
        type === "enum" && values?.length ? values[0] :
        type === "numeric" ? 0 : "");
    async function send(override) {
        const raw = override !== undefined ? override : val;
        const parsed = type === "numeric" ? Number(raw)
                     : type === "binary"  ? !!raw
                     : raw;
        setBusy(true);
        try { await setDeviceAttr(ieee, name, parsed); showToast("Sent " + name, "ok"); }
        catch (e) { showToast("Send failed: " + e.message, "err"); }
        finally { setBusy(false); }
    }
    if (type === "binary") {
        return (
            <tr>
                <td><code class="mono">{name}</code></td>
                <td><span class="ro-tag">trigger</span></td>
                <td>
                    <button class="small" disabled={busy}
                            onClick={() => send(true)}>Trigger</button>
                </td>
            </tr>
        );
    }
    if (type === "enum" && values?.length) {
        return (
            <tr>
                <td><code class="mono">{name}</code></td>
                <td>
                    <select value={val} onChange={(e) => setVal(e.currentTarget.value)} disabled={busy}
                            style="padding:4px 8px;border:1px solid var(--border);border-radius:3px">
                        {values.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </td>
                <td><button class="small" onClick={() => send()} disabled={busy}>Send</button></td>
            </tr>
        );
    }
    const isNumeric = type === "numeric";
    return (
        <tr>
            <td><code class="mono">{name}</code></td>
            <td>
                {isNumeric ? (
                    <input type="number" value={val}
                           onInput={(e) => setVal(e.currentTarget.value)}
                           onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                           style="padding:4px 8px;border:1px solid var(--border);border-radius:3px;width:160px" />
                ) : (
                    <textarea value={val}
                              rows={2}
                              onInput={(e) => setVal(e.currentTarget.value)}
                              style="padding:4px 8px;border:1px solid var(--border);border-radius:3px;width:320px;font-family:inherit;font-size:12px" />
                )}
                {unit && <span class="ro-unit"> {unit}</span>}
            </td>
            <td><button class="small" onClick={() => send()} disabled={busy}>Send</button></td>
        </tr>
    );
}

function BindTab({ d, ieee }) {
    const bindings = d.bindings || [];
    async function unbind(b) {
        try { await bindDevice({ ieee, unbind: true, src_ep: b.ep, cluster: b.cluster }); showToast("Unbind requested", "ok"); }
        catch (e) { showToast("Unbind failed: " + e.message, "err"); }
    }
    return (
        <div class="tab-panel">
            {bindings.length === 0 ? (
                <p class="empty-text">No bindings installed.</p>
            ) : (
                <table class="data-table">
                    <thead><tr><th>Cluster</th><th>EP</th><th>Dst</th><th></th></tr></thead>
                    <tbody>
                        {bindings.map((b, i) => (
                            <tr key={i}>
                                <td>{hex16(b.cluster)}</td>
                                <td>{b.ep}</td>
                                <td><code class="mono">{b.dst || "—"}</code></td>
                                <td><button class="danger small" onClick={() => unbind(b)}>Unbind</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <BindForm ieee={ieee} />
        </div>
    );
}

// Device Groups tab — native ZCL Groups membership. Add/remove this device to a
// Zigbee group id so it obeys commands sent to that group, including a hardware
// zone-remote's groupcasts (MiBoxer FUT089Z: zones 1-8 = groups 101-108). This
// is device-side ZCL membership, DISTINCT from the synthetic Groups page (which
// is gateway fan-out). Fire-and-forget with ACK; the tracked membership list +
// "refresh from device" is a later increment.
function GroupsTab({ ieee }) {
    const [ep, setEp] = useState(1);
    const [gid, setGid] = useState("");
    async function submit(remove) {
        const g = parseInt(gid, 10);
        if (!Number.isInteger(g) || g < 1 || g > 65535) {
            showToast("Enter a group id 1–65535", "err");
            return;
        }
        try {
            await setDeviceGroup(ieee, Number(ep) || 1, g, remove);
            showToast(remove ? `Removed from group ${g}` : `Added to group ${g}`, "ok");
        } catch (e) { showToast("Group " + (remove ? "remove" : "add") + " failed: " + e.message, "err"); }
    }
    return (
        <div class="tab-panel">
            <h4 style="margin-bottom:8px;font-size:13px">ZCL group membership</h4>
            <p class="field-hint" style="margin-bottom:12px">
                Join this device to a Zigbee group so a hardware zone-remote drives it
                directly (e.g. MiBoxer FUT089Z zones = groups 101–108). This is native ZCL
                membership on the device — separate from the <strong>Collections</strong> page
                in the sidebar, which is gateway fan-out (one command re-sent to each member).
            </p>
            <label style="margin-right:10px">EP <input type="number" value={ep} min="1" max="240"
                   style="width:60px" onInput={(e) => setEp(e.currentTarget.value)} /></label>
            <label style="margin-right:10px">Group ID <input type="number" value={gid} min="1" max="65535"
                   placeholder="101" style="width:90px"
                   onInput={(e) => setGid(e.currentTarget.value)} /></label>
            <button class="primary small" onClick={() => submit(false)}>Add</button>
            <button class="small danger" style="margin-left:6px" onClick={() => submit(true)}>Remove</button>
        </div>
    );
}

function BindForm({ ieee }) {
    const [ep, setEp] = useState(1);
    const [cluster, setCluster] = useState("0x0006");
    // Target: "" = coordinator (reporting default — firmware substitutes its
    // own IEEE + ep 1); anything else = direct device→device binding (e.g. a
    // remote driving a bulb without a rule), sent as dst_ieee + dst_ep.
    const [target, setTarget] = useState("");
    const [dstEp, setDstEp] = useState(1);
    const others = (devicesStore.value || []).filter(dv => dv.ieee !== ieee);
    async function submit() {
        try {
            const args = { ieee, unbind: false, src_ep: Number(ep), cluster: parseInt(cluster, 16) };
            if (target) { args.dst_ieee = target; args.dst_ep = Number(dstEp) || 1; }
            await bindDevice(args);
            showToast("Bind requested", "ok");
        } catch (e) { showToast("Bind failed: " + e.message, "err"); }
    }
    return (
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <h4 style="margin-bottom:8px;font-size:13px">Add binding</h4>
            <label style="margin-right:10px">EP <input type="number" value={ep} min="1" max="240"
                   style="width:60px" onInput={(e) => setEp(e.currentTarget.value)} /></label>
            <label style="margin-right:10px">Cluster <input value={cluster}
                   style="width:80px" onInput={(e) => setCluster(e.currentTarget.value)} /></label>
            <label style="margin-right:10px">Target{" "}
                <select value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
                    <option value="">Coordinator (reporting)</option>
                    {others.map(dv => (
                        <option key={dv.ieee} value={dv.ieee}>{dv.name || dv.ieee}</option>
                    ))}
                </select></label>
            {target && (
                <label style="margin-right:10px">Target EP <input type="number" value={dstEp}
                       min="1" max="240" style="width:60px"
                       onInput={(e) => setDstEp(e.currentTarget.value)} /></label>
            )}
            <button class="primary small" onClick={submit}>Bind</button>
        </div>
    );
}

// Per-device report rate-limit. PRESENTATION ONLY — collects a number and
// POSTs `device.options.set`; all throttle logic lives in firmware
// (device_shadow). 0 = disabled. Useful for chatty Tuya-DP sensors
// (air-quality monitors) that report every few seconds with no device-side
// reporting-interval control.
function ThrottleControl({ d, ieee }) {
    const cur = (d.throttle_ms != null) ? d.throttle_ms
              : (d.options && d.options.throttle_ms != null) ? d.options.throttle_ms
              : "";
    const [val, setVal] = useState(cur);
    const [busy, setBusy] = useState(false);
    const save = async () => {
        const n = parseInt(val, 10);
        if (Number.isNaN(n) || n < 0) { showToast("Enter milliseconds ≥ 0"); return; }
        setBusy(true);
        try {
            await call("device.options.set", { ieee, throttle_ms: n });
            showToast(n === 0 ? "Report throttle disabled"
                              : `Report throttle set to ${n} ms`, SUCCESS);
        } catch (_) {
            showToast("Failed to set throttle");
        } finally {
            setBusy(false);
        }
    };
    return (
        <div class="opt-throttle">
            <label class="form-row">
                <span>Report throttle (ms)</span>
                <input type="number" min="0" step="1000" value={val}
                       placeholder="0 = off" disabled={busy}
                       onInput={e => setVal(e.currentTarget.value)} />
            </label>
            <button class="btn" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
            </button>
            <p class="tab-hint">
                Caps state updates to one per N&nbsp;ms (firmware-side). Use for
                chatty sensors that report every few seconds. 0 disables.
            </p>
        </div>
    );
}

// Normalise an IEEE-64 address string for case/format-insensitive
// comparison. Firmware formats device.rainmaker.list entries as
// `0x%016llX` (upper-case hex, zero-padded to 16 digits); the ieee this
// page carries (from device.get / the devices store) isn't guaranteed to
// match that exactly. Strip an optional "0x" prefix, upper-case, and
// zero-pad both sides before comparing — skip this and every device
// silently reads as "off".
function normIeee(s) {
    if (!s) return "";
    let h = String(s).trim();
    if (h.toLowerCase().startsWith("0x")) h = h.slice(2);
    return h.toUpperCase().padStart(16, "0");
}

// Per-device "Expose to RainMaker" toggle (Task 20). Only meaningful
// when the cloud uplink is set to RainMaker (Settings → Uplink); the
// bridge doesn't run otherwise, so the control renders a hint pointing
// there instead of a dead toggle. Membership is queried fresh each time
// the Options tab is opened for this device — there are no push events
// for this feature (see stores/rainmaker.js), so like Settings'
// UplinkCard this fetches on mount with an `alive` guard and a visible
// Retry on failure, but WITHOUT UplinkCard's 5s poll loop: this control
// only exists while the user is looking at exactly this tab for exactly
// this device, so there's nothing external worth polling for — closing
// and reopening the tab already re-fetches.
function RainMakerExposeControl({ ieee }) {
    const [uplink, setUplink]   = useState(null);   // null = loading; else "none"|"custom_mqtt"|"rainmaker"
    const [devices, setDevices] = useState(null);   // null = not loaded; else device.rainmaker.list().devices
    const [loadErr, setLoadErr] = useState(false);
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        let alive = true;
        setUplink(null);
        setDevices(null);
        setLoadErr(false);
        (async () => {
            try {
                const up = await uplinkGet();
                if (!alive) return;
                const mode = up?.uplink ?? "none";
                setUplink(mode);
                if (mode !== "rainmaker") return;
                const res = await deviceRainmakerList();
                if (!alive) return;
                setDevices(res?.devices || []);
            } catch (_) {
                if (alive) setLoadErr(true);
            }
        })();
        return () => { alive = false; };
    }, [ieee]);

    // Manual retry — mirrors UplinkCard's retryLoad(): no `alive` guard
    // (same trade-off UplinkCard accepts; this is a user-initiated
    // one-shot, not the mount effect).
    function retryLoad() {
        setLoadErr(false);
        uplinkGet().then(async (up) => {
            const mode = up?.uplink ?? "none";
            setUplink(mode);
            if (mode !== "rainmaker") { setDevices(null); return; }
            try {
                const res = await deviceRainmakerList();
                setDevices(res?.devices || []);
            } catch (_) { setLoadErr(true); }
        }, () => setLoadErr(true));
    }

    if (uplink === null) {
        return loadErr ? (
            <div class="tab-hint" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--danger)">
                <span>Couldn't load RainMaker status.</span>
                <button type="button" class="small" onClick={retryLoad}>Retry</button>
            </div>
        ) : <p class="tab-hint">Loading RainMaker status…</p>;
    }

    // Uplink isn't RainMaker — nothing to toggle. A one-line hint (rather
    // than rendering nothing) so a user who doesn't know this feature
    // exists has somewhere to go; it costs one muted line on a tab that
    // already shows similar hints for its other read-only sections.
    if (uplink !== "rainmaker") {
        return (
            <p class="tab-hint">
                RainMaker bridging is off. Enable it under{" "}
                <a href="javascript:void(0)"
                   onClick={(e) => { e.preventDefault(); navigate("settings"); }}>
                    Settings → Uplink
                </a>{" "}to expose this device.
            </p>
        );
    }

    if (devices === null) {
        return loadErr ? (
            <div class="tab-hint" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--danger)">
                <span>Couldn't load RainMaker device list.</span>
                <button type="button" class="small" onClick={retryLoad}>Retry</button>
            </div>
        ) : <p class="tab-hint">Loading RainMaker device list…</p>;
    }

    const entry = devices.find(x => normIeee(x.ieee) === normIeee(ieee));
    const exposed = !!entry;

    async function onToggle(e) {
        const next = e.currentTarget.checked;
        setBusy(true);
        let res;
        const ok = await withToast(
            async () => { res = next ? await deviceRainmakerAdd(ieee) : await deviceRainmakerRemove(ieee); },
            next ? "Exposed to RainMaker" : "Removed from RainMaker",
            next ? "Expose to RainMaker failed" : "Remove from RainMaker failed");
        // Use the add/remove response's own list rather than re-fetching —
        // fewer round-trips and no race with a stale re-fetch.
        if (ok === SUCCESS) setDevices(res?.devices || []);
        setBusy(false);
    }

    return (
        <div class="opt-rainmaker" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
            <h4 style="margin-bottom:8px;font-size:13px">RainMaker</h4>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
                <label class="toggle">
                    <input type="checkbox" checked={exposed} disabled={busy} onChange={onToggle} />
                    <span class="toggle-slider"></span>
                </label>
                <span>{exposed ? "Exposed to RainMaker" : "Not exposed to RainMaker"}</span>
                {exposed && entry.type && <span class="ro-tag">{entry.type}</span>}
            </div>
            <p class="tab-hint">
                Bridges this device into your RainMaker account as a virtual node
                (up to 10 devices per hub). Sent via{" "}
                <code class="mono">device.rainmaker.add</code> /{" "}
                <code class="mono">device.rainmaker.remove</code>.
            </p>
        </div>
    );
}

function OptionsTab({ d, ieee }) {
    // Reference table of exposes explicitly marked `category: "config"` by
    // the device definition (z2m convention). State-level attributes
    // (state, brightness, color_*, battery, …) belong on the States tab;
    // config-level attributes are device-specific settings like
    // power_on_behavior, motion_debounce, no_motion_timeout, etc.
    //
    // This view is intentionally read-only: writable config attrs are
    // ACCESS_SET-flagged and show up on the States tab with the proper
    // AttrRow / AttrTextRow controls. Keeping a single write path stops
    // two tabs from disagreeing about pending writes.
    const exposes = (d.exposes || []).filter(e => e && e.category === "config");
    return (
        <div class="tab-panel">
            <ThrottleControl d={d} ieee={ieee} />
            <RainMakerExposeControl ieee={ieee} />
            <p class="tab-hint">
                Reference view of this device's configuration exposes
                (read-only). To change a value, use the matching row on the
                <strong> States </strong>tab — writable config attributes
                are exposed there alongside live state.
            </p>
            {exposes.length === 0 ? (
                <p class="empty-text">No configurable options for this device.</p>
            ) : (
                <table class="data-table">
                    <thead><tr><th>Property</th><th>Type</th><th>Access</th><th>Values</th></tr></thead>
                    <tbody>
                        {exposes.map((e, i) => (
                            <tr key={i}>
                                <td><code class="mono">{e.property || e.name}</code></td>
                                <td>{e.type || "—"}</td>
                                <td>{e.access != null ? String(e.access) : "—"}</td>
                                <td>{e.values ? e.values.join(", ") : (e.value_min != null ? `${e.value_min}…${e.value_max ?? "?"}` : "—")}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
