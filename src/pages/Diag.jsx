// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Unhandled ZCL frames table. Simple read-only view; refresh pulls fresh data.
import { useEffect, useState } from "preact/hooks";
import { diag, bootstrapDiag } from "../stores/diag.js";
import { fmtAgo, hex16 } from "../utils.js";
import { showToast } from "../stores/ui.js";
import { call } from "../ws/client.js";

// Every task with its CPU share, core, priority and stack headroom. The share
// is measured between two calls, so the first read after boot shows zeros and
// the page polls every 5 s while open. Builds without the command (the
// dual-chip S3) leave the card out.
function TasksCard() {
    const [tasks, setTasks] = useState(null);
    const [cores, setCores] = useState(1);
    useEffect(() => {
        let alive = true;
        const tick = () => call("diag.tasks")
            .then((d) => { if (alive && d) { setTasks(d.tasks || []); setCores(d.cores || 1); } })
            .catch(() => { if (alive) setTasks(false); });
        tick();
        const t = setInterval(tick, 5000);
        return () => { alive = false; clearInterval(t); };
    }, []);
    if (tasks === false || tasks === null) return null;
    const busy = tasks.reduce((a, t) => a + (t.cpu || 0), 0);
    return (
        <details class="card" open>
            <summary>Tasks — {tasks.length}, {busy} % busy of {cores * 100} % across {cores} core{cores > 1 ? "s" : ""}</summary>
            <p class="muted">CPU share over the last 5 s. Core "any" means the task may run on either core.</p>
            <table class="data-table">
                <thead><tr><th>Task</th><th>Core</th><th>CPU %</th><th>Prio</th><th>Stack free</th></tr></thead>
                <tbody>
                    {tasks.map((t) => (
                        <tr key={t.name}>
                            <td><code class="mono">{t.name}</code></td>
                            <td>{t.core < 0 ? "any" : t.core}</td>
                            <td>{t.cpu}</td>
                            <td>{t.prio}</td>
                            <td>{t.stack_free != null ? t.stack_free + " B" : "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </details>
    );
}

export function DiagPage() {
    const entries = diag.value || [];
    return (
        <div class="page">
            <TasksCard />
            <div class="toolbar">
                <button onClick={() => bootstrapDiag().catch(e => showToast(e.message, "err"))}>Refresh</button>
                <span class="muted">
                    Unhandled ZCL frames — (cluster, attr_or_cmd) tuples that currently have no decoder.
                </span>
            </div>
            {entries.length === 0 ? (
                <p class="empty-text">No unhandled frames — all traffic decoded cleanly.</p>
            ) : (
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Cluster</th><th>Attr/Cmd</th><th>CS</th>
                            <th>Count</th><th>Last seen</th><th>IEEE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((e, i) => (
                            <tr key={i}>
                                <td>{hex16(e.cluster)}</td>
                                <td>{hex16(e.id)}</td>
                                <td>{e.cs ? "cmd" : "attr"}</td>
                                <td>{e.count}</td>
                                <td>{fmtAgo(e.age_s)}</td>
                                <td><code class="mono">{e.ieee || "—"}</code></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
