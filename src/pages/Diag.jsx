// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Unhandled ZCL frames table. Simple read-only view; refresh pulls fresh data.
import { diag, bootstrapDiag } from "../stores/diag.js";
import { fmtAgo, hex16 } from "../utils.js";
import { showToast } from "../stores/ui.js";

export function DiagPage() {
    const entries = diag.value || [];
    return (
        <div class="page">
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
