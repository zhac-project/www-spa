// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Device list with permit-join control + rename / re-interview / delete.
// Permit-join is fire-and-forget here; the detail page handles per-device ops.
import { useState, useEffect } from "preact/hooks";
import { devices, bootstrapDevices, deleteDevice } from "../stores/devices.js";
import { call } from "../ws/client.js";
import { navigate, showToast } from "../stores/ui.js";
import { fmtSince, hex16 } from "../utils.js";

async function confirmRemove(ieee) {
    if (!confirm(`Remove ${ieee} from the network? (Soft — NVS + shadow kept. For a full wipe use "hard" on the device detail page.)`)) return;
    try {
        await deleteDevice(ieee, false);
        showToast("Device removed", "ok");
    } catch (e) {
        showToast("Remove failed: " + e.message, "err");
    }
}

async function permitJoin(duration) {
    try {
        await call("zigbee.permit_join", { duration });
        showToast(duration > 0 ? `Join open for ${duration}s` : "Join closed", "ok");
    } catch (e) {
        showToast("Permit-join failed: " + e.message, "err");
    }
}

// Polls `zigbee.permit_join.status` every second while mounted. The S3
// tracks the current window locally (the state is authoritative on P4
// but the S3 knows what it last requested, which is what matters for
// UI feedback).
function PermitJoinStatus() {
    const [state, setState] = useState({ open: false, remaining_sec: 0 });
    useEffect(() => {
        let alive = true;
        async function tick() {
            try {
                const d = await call("zigbee.permit_join.status");
                if (alive) setState(d || { open: false, remaining_sec: 0 });
            } catch { /* ignore transient errors */ }
        }
        tick();
        // Adaptive cadence: 1 s while window is open (countdown UX),
        // 10 s while closed (idle — no UI to update, just confirm state).
        const period = state.open ? 1000 : 10000;
        const id = setInterval(tick, period);
        return () => { alive = false; clearInterval(id); };
    }, [state.open]);
    if (state.open) {
        return <span class="pj-status pj-open">Open · {state.remaining_sec}s</span>;
    }
    return <span class="pj-status pj-closed">Closed</span>;
}


export function DevicesPage() {
    const [joinSecs, setJoinSecs] = useState(60);
    const list = devices.value;

    // Inlined table so the '#' column can reflect the current order index.
    return (
        <div class="page">
            <div class="toolbar">
                <button onClick={() => bootstrapDevices().catch(e => showToast(e.message, "err"))}>
                    Refresh
                </button>
                <span class="permit-join-wrap">
                    <label id="permit-join-label">Permit join:</label>
                    <input type="number" min="0" max="254" value={joinSecs}
                           style="width:72px" onInput={(e) => setJoinSecs(Number(e.currentTarget.value) || 0)} />
                    <button class="primary small" onClick={() => permitJoin(joinSecs)}>Open</button>
                    <button class="small" onClick={() => permitJoin(0)}>Close</button>
                    <PermitJoinStatus />
                </span>
                <span class="toolbar-spacer" />
                <span class="muted">{list.length} device{list.length === 1 ? "" : "s"}</span>
            </div>

            {list.length === 0 ? (
                <p class="empty-text">No devices paired yet — use "Permit join" to pair.</p>
            ) : (
                <table class="data-table devlist">
                    <thead>
                        <tr>
                            <th class="col-n">#</th>
                            <th>Name</th>
                            <th>IEEE</th>
                            <th>NWK</th>
                            <th class="col-manuf">Manufacturer</th>
                            <th class="col-model">Model</th>
                            <th class="col-lqi">LQI</th>
                            <th class="col-seen">Last seen</th>
                            <th class="col-act"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((d, i) => (
                            <tr key={d.ieee}>
                                <td class="col-n">{i + 1}</td>
                                <td>
                                    <a href="#" onClick={(e) => { e.preventDefault(); navigate("device", { ieee: d.ieee }); }}>
                                        {d.name || d.ieee}
                                    </a>
                                </td>
                                <td><code class="mono">{d.ieee}</code></td>
                                <td>{hex16(d.nwk)}</td>
                                <td class="col-manuf">{d.vendor || "—"}</td>
                                <td class="col-model">{d.model || "—"}</td>
                                <td class="col-lqi">{d.lqi != null ? d.lqi : "—"}</td>
                                <td class="col-seen">{fmtSince(d.last_seen)}</td>
                                <td class="col-act">
                                    <div class="act-group">
                                        <button class="act-btn edit" title="Details"
                                                onClick={() => navigate("device", { ieee: d.ieee })}>✎</button>
                                        <button class="act-btn del" title="Remove"
                                                onClick={() => confirmRemove(d.ieee)}>🗑</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
