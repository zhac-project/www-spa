// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Device list with permit-join control + rename / re-interview / delete.
// Permit-join is fire-and-forget here; the detail page handles per-device ops.
import { useState, useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { devices, bootstrapDevices, deleteDevice } from "../stores/devices.js";
import { call } from "../ws/client.js";
import { navigate, showToast, hrefFor } from "../stores/ui.js";
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

// Module-level signal so `permitJoin` (called from button handlers) and
// `PermitJoinStatus` (the visual countdown) share state without prop drilling.
// Each Devices page mount re-uses the same signal — survives nav-away/return.
const pjState = signal({ open: false, remaining_sec: 0 });

async function permitJoin(duration) {
    try {
        await call("zigbee.permit_join", { duration });
        // Optimistic local state — the request returns when the SRSP lands on
        // P4, so by the time we get here the window IS open / closed. Skip the
        // server round-trip and drive the countdown locally.
        pjState.value = { open: duration > 0, remaining_sec: duration };
        showToast(duration > 0 ? `Join open for ${duration}s` : "Join closed", "ok");
    } catch (e) {
        showToast("Permit-join failed: " + e.message, "err");
    }
}

// Permit-join status display. Two timers:
//   1. While OPEN: local 1 s countdown decrementing pjState.remaining_sec.
//      No server polls — the SPA initiated the open + knows the duration,
//      so it counts down by itself. When it hits 0 → switch to closed.
//   2. While CLOSED: 10 s server poll on `zigbee.permit_join.status` to
//      detect external opens (e.g. someone using a separate tool / API
//      key to open the window). Only runs while this component is mounted,
//      i.e. only while the Devices page is in view.
//
// On mount: one-shot status fetch so a fresh page visit mid-window sees
// the current remaining time (in case the optimistic local state from a
// prior mount was lost).
//
// On tab visibility change (focus return): re-fetch status. Local
// countdown drifts if the tab was backgrounded (browsers throttle
// setTimeout when hidden); re-sync to truth.
function PermitJoinStatus() {
    const [, force] = useState(0);  // re-render on signal change
    useEffect(() => {
        let alive = true;
        let pollT = null;
        let tickT = null;
        const rerender = () => alive && force((n) => n + 1);
        const unsubscribe = pjState.subscribe(rerender);

        async function syncFromServer() {
            try {
                const d = await call("zigbee.permit_join.status");
                if (alive && d) pjState.value = {
                    open: !!d.open,
                    remaining_sec: d.remaining_sec | 0,
                };
            } catch { /* transient — keep current state */ }
        }

        function schedulePoll() {
            if (pollT) clearTimeout(pollT);
            pollT = setTimeout(async () => {
                if (!alive) return;
                if (!pjState.value.open) await syncFromServer();
                if (alive) schedulePoll();
            }, 10_000);
        }

        function tickCountdown() {
            if (tickT) clearTimeout(tickT);
            tickT = setTimeout(() => {
                if (!alive) return;
                const cur = pjState.value;
                if (cur.open) {
                    const next = Math.max(0, cur.remaining_sec - 1);
                    pjState.value = next > 0
                        ? { open: true, remaining_sec: next }
                        : { open: false, remaining_sec: 0 };
                }
                if (alive) tickCountdown();
            }, 1000);
        }

        function onVisibility() {
            if (document.visibilityState === "visible") syncFromServer();
        }
        document.addEventListener("visibilitychange", onVisibility);

        // Initial sync + start timers.
        syncFromServer();
        schedulePoll();
        tickCountdown();

        return () => {
            alive = false;
            if (pollT) clearTimeout(pollT);
            if (tickT) clearTimeout(tickT);
            document.removeEventListener("visibilitychange", onVisibility);
            unsubscribe();
        };
    }, []);

    const s = pjState.value;
    if (s.open) {
        return <span class="pj-status pj-open">Open · {s.remaining_sec}s</span>;
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
                                    <a href={hrefFor("device", { ieee: d.ieee })}
                                       onClick={(e) => {
                                           if (e.defaultPrevented || e.button !== 0 ||
                                               e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                           e.preventDefault();
                                           navigate("device", { ieee: d.ieee });
                                       }}>
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
