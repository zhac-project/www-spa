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
import { LINKS } from "../links.js";
import { status } from "../stores/status.js";

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


// How long "Add a device" keeps pairing open, and when a device that showed
// up but never finished its interview gets a nudge.
const ADD_WINDOW_S = 120;
const INTERVIEW_SLOW_S = 60;

// What the list knows about a device that has just joined. The hub fills a
// row in stages: first the address, then (after the interview) the model it
// reports, then the definition it matched. Read those stages, nothing more:
// the hub reports, the page only words it.
function joinStage(d) {
    if (d.known === true) return "ready";                      // definition matched
    if (d.known === false) return (d.model_id || d.manufacturer) ? "unsupported" : "interviewing";
    // Older firmware without `known`: `model` falls back to the raw id, so
    // only its presence can be read.
    if (d.model) return "ready";
    if (d.model_id || d.manufacturer) return "unsupported";
    return "interviewing";
}

// The "Add a device" panel: opens pairing, explains what to do, and shows
// every device that appears while it is open with one next action per state.
function AddDevicePanel({ onClose }) {
    const [before] = useState(() => new Set(devices.value.map(d => d.ieee)));
    const [openedAt, setOpenedAt] = useState(() => Date.now());
    const [, tick] = useState(0);
    const s = status.value || {};
    const pj = pjState.value;

    useEffect(() => {
        permitJoin(ADD_WINDOW_S);
        // Not every firmware pushes device.added, and the interview fills the
        // row in stages: poll the list while the panel is open.
        const t = setInterval(() => {
            bootstrapDevices().catch(() => {});
            tick(n => n + 1);
        }, 4000);
        return () => clearInterval(t);
    }, []);

    function retry() { setOpenedAt(Date.now()); permitJoin(ADD_WINDOW_S); }
    function done() { if (pj.open) permitJoin(0); onClose(); }

    const fresh = devices.value.filter(d => !before.has(d.ieee));
    const waitedS = Math.floor((Date.now() - openedAt) / 1000);
    const timedOut = !pj.open && fresh.length === 0 && waitedS >= ADD_WINDOW_S - 1;

    if (s.zigbee_ok === false) {
        return (
            <div class="card onboarding add-device" role="region" aria-label="Add a device">
                <h3>Add a device</h3>
                <p><strong>The Zigbee radio is not running</strong>, so nothing can pair right now.
                    {s.radio_error ? <> The hub reports: <code>{s.radio_error}</code>.</> : null}{" "}
                    Next step: restart the hub; if this comes back, the radio has no firmware yet
                    {s.target === "esp32p4" && <> — <a href={LINKS.radio} target="_blank" rel="noopener">flash the ESP32-C6 once</a></>}.</p>
                <div class="btn-strip"><button onClick={onClose}>Close</button></div>
            </div>
        );
    }

    return (
        <div class="card onboarding add-device" role="region" aria-label="Add a device">
            <h3>Add a device {pj.open ? <span class="pj-status pj-open">listening · {pj.remaining_sec}s</span>
                                     : <span class="pj-status pj-closed">not listening</span>}</h3>
            <ol>
                <li>Bring the device near the hub and put it into pairing mode. Usually: hold its
                    button for about five seconds until its light blinks. Bulbs: switch them off
                    and on five or six times. Plugs: hold the button until the LED flashes.</li>
                <li>Wait here. A new device appears below within a minute, then the hub reads
                    what it is, which takes another few seconds.</li>
                <li>When it says <strong>ready</strong>, open it to name it and try it.</li>
            </ol>
            {fresh.length > 0 && (
                <ul class="add-device-list">
                    {fresh.map(d => {
                        const stage = joinStage(d);
                        const slow = stage === "interviewing" && waitedS >= INTERVIEW_SLOW_S;
                        return (
                            <li key={d.ieee}>
                                <code class="mono">{d.ieee}</code>{" "}
                                {stage === "ready" && (
                                    <>— <strong>ready</strong>: {d.vendor ? `${d.vendor} ` : ""}{d.model}.{" "}
                                        <a href={hrefFor("device", { ieee: d.ieee })}
                                           onClick={(e) => { e.preventDefault(); navigate("device", { ieee: d.ieee }); }}>
                                            Open it</a> to name it and test it.</>
                                )}
                                {stage === "unsupported" && (
                                    <>— joined, but the hub has <strong>no definition</strong> for what it reports
                                        (<code>{d.model_id || "?"}</code> by <code>{d.manufacturer || "?"}</code>).
                                        It stays paired; nothing will show for it yet.{" "}
                                        <a href={LINKS.deviceRequest} target="_blank" rel="noopener">Ask for it</a>{" "}
                                        with those two values.</>
                                )}
                                {stage === "interviewing" && !slow && <>— joined, <em>reading what it is…</em></>}
                                {stage === "interviewing" && slow && (
                                    <>— joined, but it has not answered the hub's questions for a minute.
                                        Next step: press its button once (battery devices sleep), or move it
                                        closer and press <strong>Retry</strong>.</>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {timedOut && (
                <p class="error-text">
                    Nothing joined in two minutes. Next step: hold the device's reset button until its
                    light blinks fast (that clears its old network), then press <strong>Retry</strong>.
                    Still nothing? Check the <a href="#/log">Log</a>.
                </p>
            )}
            <div class="btn-strip">
                <button class="primary" onClick={retry} disabled={pj.open}>Retry</button>
                <button onClick={done}>Done</button>
            </div>
            <details>
                <summary class="muted">Advanced: permit join for a chosen time</summary>
                <PermitJoinAdvanced />
            </details>
        </div>
    );
}

function PermitJoinAdvanced() {
    const [joinSecs, setJoinSecs] = useState(60);
    return (
        <span class="permit-join-wrap">
            <label id="permit-join-label">Permit join:</label>
            <input type="number" min="0" max="254" value={joinSecs} aria-labelledby="permit-join-label"
                   style="width:72px" onInput={(e) => setJoinSecs(Number(e.currentTarget.value) || 0)} />
            <button class="primary small" onClick={() => permitJoin(joinSecs)}>Open</button>
            <button class="small" onClick={() => permitJoin(0)}>Close</button>
            <PermitJoinStatus />
        </span>
    );
}

export function DevicesPage() {
    const [adding, setAdding] = useState(false);
    const list = devices.value;

    // Inlined table so the '#' column can reflect the current order index.
    return (
        <div class="page">
            <div class="toolbar">
                <button onClick={() => bootstrapDevices().catch(e => showToast(e.message, "err"))}>
                    Refresh
                </button>
                <button class="primary" onClick={() => setAdding(true)} disabled={adding}>+ Add a device</button>
                {!adding && <PermitJoinStatus />}
                <span class="toolbar-spacer" />
                <span class="muted">{list.length} device{list.length === 1 ? "" : "s"}</span>
            </div>

            {adding && <AddDevicePanel onClose={() => setAdding(false)} />}
            {!adding && <RadioDownBanner />}

            {list.length === 0 ? (
                <div class="card onboarding">
                    <h3>Pair your first device</h3>
                    <ol>
                        <li>Press <strong>+ Add a device</strong> above. The hub then listens for
                            new devices for two minutes and walks you through it.</li>
                        <li>Put the device into pairing mode. Usually: hold its button for
                            about five seconds until the light blinks. Bulbs: switch them off
                            and on five or six times.</li>
                        <li>Wait on this page. The device shows up within a minute;
                            its values appear on its page once it reports.</li>
                    </ol>
                    <p class="muted">
                        Nothing after two minutes? Check the <a href="#/log">Log</a>, then{" "}
                        <a href={LINKS.deviceRequest} target="_blank" rel="noopener">ask for your device</a>{" "}
                        — include the manufacturer and model it reports.
                    </p>
                </div>
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
                                        <button class="act-btn edit" title="Details" aria-label={`Details of ${d.name || d.ieee}`}
                                                onClick={() => navigate("device", { ieee: d.ieee })}>✎</button>
                                        <button class="act-btn del" title="Remove" aria-label={`Remove ${d.name || d.ieee}`}
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

// Shown when the hub says its Zigbee radio is not running — nothing can pair
// until it is, so say so before anyone presses "Permit join" and waits.
function RadioDownBanner() {
    const s = status.value || {};
    if (s.zigbee_ok !== false) return null;
    const crashed = s.radio_error === "radio_crashed";
    return (
        <div class="card radio-down" role="alert">
            <strong>The Zigbee radio is not running</strong>, so no device can pair or report.{" "}
            {crashed ? (
                <>It crashed while starting, so this boot runs without it; reset the hub to
                    try again.{" "}
                    {s.target === "esp32p4" && <>On the ESP32-P4 board this almost always means the
                    ESP32-C6 has no radio firmware yet —{" "}
                    <a href={LINKS.radio} target="_blank" rel="noopener">flash it once</a>.</>}</>
            ) : (
                <>Check the <a href="#/log">Log</a> for the reason.</>
            )}
        </div>
    );
}
