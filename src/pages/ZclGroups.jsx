// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Global native-ZCL group membership: one card per group id, showing member
// devices, with add/remove + create. Data from the gateway mirror (groups.all);
// per-device live re-query stays in the device's own Groups tab. DISTINCT from
// the Collections page (gateway fan-out). Refresh-on-mutation (no push wiring).
import { useState, useEffect } from "preact/hooks";
import { devices, groupsAll, deviceGroupsAdd, deviceGroupsRemove } from "../stores/devices.js";
import { withToast, showToast } from "../stores/ui.js";

export function ZclGroupsPage() {
    const [groups, setGroups]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newGid, setNewGid]   = useState("");
    const [newIeee, setNewIeee] = useState("");
    const [sel, setSel]         = useState({});   // per-gid add-picker selection

    async function refresh() {
        setLoading(true);
        try {
            const r = await groupsAll();
            setGroups(r && r.groups ? r.groups : []);
        } catch (e) {
            showToast("Failed to load groups", "err");
        }
        setLoading(false);
    }
    useEffect(() => { refresh(); }, []);

    const devMap = Object.fromEntries(devices.value.map(d => [d.ieee, d]));
    const nameOf = ieee => { const d = devMap[ieee]; return d ? (d.name || ieee) : ieee; };

    async function addMember(gid, ieee) {
        if (!ieee) return;
        const ok = await withToast(() => deviceGroupsAdd(ieee, 1, gid), "Added to group", "Add failed");
        if (ok) { setSel(s => ({ ...s, [gid]: "" })); refresh(); }
    }
    async function removeMember(gid, ieee) {
        const ok = await withToast(() => deviceGroupsRemove(ieee, 1, gid), "Removed from group", "Remove failed");
        if (ok) refresh();
    }
    async function doCreate() {
        const gid = parseInt(newGid, 10);
        if (!(gid >= 1 && gid <= 65535)) { showToast("Group id must be 1–65535", "err"); return; }
        if (!newIeee) { showToast("Pick a device", "err"); return; }
        const ok = await withToast(() => deviceGroupsAdd(newIeee, 1, gid), "Group created", "Create failed");
        if (ok) { setCreating(false); setNewGid(""); setNewIeee(""); refresh(); }
    }

    return (
        <div>
            <div class="row" style="justify-content:space-between;align-items:center">
                <h2>Groups</h2>
                <div>
                    <button onClick={refresh}>Refresh</button>{" "}
                    <button class="primary" onClick={() => setCreating(c => !c)}>+ New group</button>
                </div>
            </div>
            <p class="field-hint">Native ZCL group membership on your devices (e.g. MiBoxer zones).
                This is ZHAC's mirror — it can lag if a device's groups changed outside ZHAC; use a
                device's own Groups tab to re-query it live. For gateway fan-out, see Collections.</p>

            {creating && (
                <div class="card">
                    <label>Group ID <input type="number" min="1" max="65535" class="field-input"
                           value={newGid} onInput={e => setNewGid(e.currentTarget.value)} /></label>{" "}
                    <select value={newIeee} onChange={e => setNewIeee(e.currentTarget.value)}>
                        <option value="">First device…</option>
                        {devices.value.map(d => <option key={d.ieee} value={d.ieee}>{d.name || d.ieee}</option>)}
                    </select>{" "}
                    <button class="primary" onClick={doCreate}>Create</button>{" "}
                    <button onClick={() => setCreating(false)}>Cancel</button>
                    <p class="field-hint">A ZCL group exists once a device joins it.</p>
                </div>
            )}

            {loading
                ? <p class="muted">Loading…</p>
                : groups.length === 0
                    ? <p class="muted">No ZCL groups yet.</p>
                    : groups.map(g => (
                        <div class="card" key={g.gid}>
                            <div><strong>Group {g.gid}</strong>{" "}
                                <span class="muted">({(g.members || []).length})</span></div>
                            <div class="group-chips">
                                {(g.members || []).length === 0
                                    ? <span class="muted">No members.</span>
                                    : (g.members || []).map(m => (
                                        <span key={m.ieee} class="chip">
                                            {nameOf(m.ieee)}
                                            <button title="Remove" onClick={() => removeMember(g.gid, m.ieee)}>×</button>
                                        </span>
                                    ))}
                            </div>
                            <div>
                                <select value={sel[g.gid] || ""}
                                        onChange={e => setSel(s => ({ ...s, [g.gid]: e.currentTarget.value }))}>
                                    <option value="">Add device…</option>
                                    {devices.value
                                        .filter(d => !(g.members || []).some(m => m.ieee === d.ieee))
                                        .map(d => <option key={d.ieee} value={d.ieee}>{d.name || d.ieee}</option>)}
                                </select>{" "}
                                <button onClick={() => addMember(g.gid, sel[g.gid])}>Add</button>
                            </div>
                        </div>
                    ))}
        </div>
    );
}
