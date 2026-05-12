// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Live-tailing log viewer. Pause/resume stops appending without dropping
// already-rendered lines. Level filter hides lines in-place (cheap enough
// for the 1000-line cap).
import { useEffect, useRef, useState } from "preact/hooks";
import { logs, paused, togglePause, clearLogs, levelFilter,
         setLevelFilter, bootstrapLogs } from "../stores/logs.js";

const LEVELS = [
    { v: "",  label: "All" },
    { v: "D", label: "Debug" },
    { v: "I", label: "Info" },
    { v: "W", label: "Warn" },
    { v: "E", label: "Error" },
    { v: "V", label: "Verbose" },
];

export function LogsPage() {
    const viewerRef = useRef(null);
    const [autoscroll, setAutoscroll] = useState(true);

    // Filter client-side.
    const filter = levelFilter.value;
    const visible = filter
        ? logs.value.filter(l => l.level === filter)
        : logs.value;

    useEffect(() => {
        if (autoscroll && viewerRef.current) {
            viewerRef.current.scrollTop = viewerRef.current.scrollHeight;
        }
    }, [visible.length, autoscroll]);

    // Poll `logs.get` every 5 s while this page is mounted. We drop
    // the live WS event-stream on purpose — see the CHANGELOG note
    // on 2026-04-22 for the incident where per-log ws fan-out stalled
    // TaskHTTP under bootstrap load. Pause flag skips the refresh so
    // users can freeze the view while they scroll through entries.
    useEffect(() => {
        let alive = true;
        const tick = () => {
            if (!alive || paused.value) return;
            bootstrapLogs().catch(() => {});
        };
        tick();                          // immediate refresh on mount
        const h = setInterval(tick, 5000);
        return () => { alive = false; clearInterval(h); };
    }, []);

    return (
        <div class="page">
            <div class="toolbar">
                <button onClick={clearLogs}>Clear</button>
                <button onClick={togglePause}>{paused.value ? "Resume" : "Pause"}</button>
                <label class="check-label">
                    <input type="checkbox" checked={autoscroll}
                           onChange={(e) => setAutoscroll(e.currentTarget.checked)} />
                    {" "}Auto-scroll
                </label>
                <label class="check-label">
                    Level{" "}
                    <select value={filter} onChange={(e) => setLevelFilter(e.currentTarget.value)}>
                        {LEVELS.map(l => <option key={l.v} value={l.v}>{l.label}</option>)}
                    </select>
                </label>
                <span class="toolbar-spacer" />
                <span class="muted">{visible.length} / {logs.value.length}</span>
            </div>
            <div id="log-viewer" ref={viewerRef}>
                {visible.map((l, i) => (
                    <div key={i} class={"log-line log-" + (l.level || "I")}>
                        [{l.level || "I"}] {l.tag ? l.tag + ": " : ""}{l.msg}
                    </div>
                ))}
            </div>
        </div>
    );
}
