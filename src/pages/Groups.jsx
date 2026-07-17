// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Group CRUD + "send command to group" one-shot.
// Legacy UI rendered each group as a card with a members chip list and
// a cluster/cmd picker. We keep the same layout.
import { useState } from "preact/hooks";
import { groups, bootstrapGroups, createGroup, updateGroup,
         deleteGroup as delGroupCall, groupCmd } from "../stores/groups.js";
import { devices } from "../stores/devices.js";
import { showToast, withToast, SUCCESS } from "../stores/ui.js";
import { Modal } from "../components/Modal.jsx";

// Minimal cluster/cmd picker parity with the legacy UI.
const GROUP_CMDS = [
    { label: "On",       cluster: 0x0006, cmd: 0x01 },
    { label: "Off",      cluster: 0x0006, cmd: 0x00 },
    { label: "Toggle",   cluster: 0x0006, cmd: 0x02 },
    { label: "Identify", cluster: 0x0003, cmd: 0x00 },
];

export function GroupsPage() {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");

    const devMap = Object.fromEntries((devices.value || []).map(d => [d.ieee, d]));

    // Groups have no push-event wiring (list refreshes only on WS bootstrap or
    // the Refresh button), so re-pull after every successful mutation.
    const refresh = () => bootstrapGroups().catch(() => {});

    async function doCreate() {
        const name = (newName || "").trim();
        if (!name) return;
        const ok = await withToast(() => createGroup({ name }), "Collection created", "Create failed");
        if (ok === SUCCESS) { setCreating(false); setNewName(""); refresh(); }
    }

    async function removeGroup(g) {
        if (!confirm(`Delete collection "${g.name}" (id ${g.id})?`)) return;
        const ok = await withToast(() => delGroupCall(g.id), "Deleted", "Delete failed");
        if (ok === SUCCESS) refresh();
    }

    async function send(g, spec) {
        await withToast(
            () => groupCmd({ id: g.id, ep: 1, cluster: spec.cluster, cmd: spec.cmd }),
            `Sent ${spec.label} to ${g.name}`, "Send failed");
    }

    async function removeMember(g, ieee) {
        const members = (g.members || []).filter(m => m.ieee !== ieee);
        const ok = await withToast(() => updateGroup({ id: g.id, members }), "Member removed", "Failed");
        if (ok === SUCCESS) refresh();
    }

    const MAX_MEMBERS = 16;   // GRP_MAX_MEMBERS on the firmware side

    async function addMember(g, ieee) {
        if (!ieee) return;
        const members = g.members || [];
        if (members.length >= MAX_MEMBERS) {
            showToast(`Collection is full (${MAX_MEMBERS} members max)`, "err");
            return;
        }
        const ok = await withToast(
            () => updateGroup({ id: g.id, members: [...members, { ieee, ep: 1 }] }),
            "Member added", "Failed");
        if (ok === SUCCESS) refresh();
    }

    return (
        <div class="page">
            <div class="toolbar">
                <button onClick={() => bootstrapGroups().catch(e => showToast(e.message, "err"))}>Refresh</button>
                <button class="primary" onClick={() => setCreating(true)}>+ New Collection</button>
            </div>

            {groups.value.length === 0 ? (
                <p class="empty-text">No collections yet.</p>
            ) : (
                <div id="groups-container">
                    {groups.value.map(g => (
                        <div key={g.id} class="card group-card">
                            <div class="group-header">
                                <strong>{g.name}</strong>{" "}
                                <span class="muted">#{g.id}</span>
                                <span class="toolbar-spacer" />
                                <button class="small danger" onClick={() => removeGroup(g)}>Delete</button>
                            </div>
                            <div class="group-chips">
                                {(g.members || []).length === 0
                                    ? <span class="muted">No members.</span>
                                    : (g.members || []).map(m => {
                                        const dev = devMap[m.ieee];
                                        return (
                                            <span key={m.ieee} class="chip">
                                                {dev ? dev.name || m.ieee : m.ieee}
                                                <button title="Remove"
                                                        onClick={() => removeMember(g, m.ieee)}>×</button>
                                            </span>
                                        );
                                    })}
                            </div>
                            <AddMemberRow g={g} devices={devices.value || []}
                                          onAdd={(ieee) => addMember(g, ieee)} />
                            <div class="group-cmd-row">
                                <span class="muted">Send:</span>
                                {GROUP_CMDS.map(c => (
                                    <button key={c.label} class="small"
                                            onClick={() => send(g, c)}>{c.label}</button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={creating}
                   title="New Collection"
                   onClose={() => setCreating(false)}
                   footer={<>
                       <button onClick={() => setCreating(false)}>Cancel</button>
                       <button class="primary" onClick={doCreate}>Create</button>
                   </>}>
                <label class="field-label">Name</label>
                <input class="field-input" value={newName}
                       onInput={(e) => setNewName(e.currentTarget.value)} />
                <p class="field-hint">A collection re-sends one command to every member (gateway
                    fan-out). For hardware zone-remotes, use a device's Groups tab instead.
                    Add devices from the collection card after creating.</p>
            </Modal>
        </div>
    );
}

// Device picker + Add button on each group card. Lists only devices that are
// not already members; ep defaults to 1 (same default the command fan-out and
// the firmware member parser use).
function AddMemberRow({ g, devices, onAdd }) {
    const [sel, setSel] = useState("");
    const memberSet = new Set((g.members || []).map(m => m.ieee));
    const candidates = devices.filter(d => !memberSet.has(d.ieee));
    if (candidates.length === 0) return null;
    return (
        <div class="group-add-row">
            <select class="field-input small" value={sel}
                    onChange={(e) => setSel(e.currentTarget.value)}>
                <option value="">Add device…</option>
                {candidates.map(d => (
                    <option key={d.ieee} value={d.ieee}>{d.name || d.ieee}</option>
                ))}
            </select>
            <button class="small primary" disabled={!sel}
                    onClick={() => { onAdd(sel); setSel(""); }}>Add</button>
        </div>
    );
}
