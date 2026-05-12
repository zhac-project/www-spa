// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Central bootstrap: wire the WS open event to the store refresh calls,
// and register each store's event handlers. Imported once from app.jsx.
import { onOpen } from "./client.js";
import { bootstrapDevices }  from "../stores/devices.js";
import { bootstrapRules }    from "../stores/rules.js";
import { bootstrapScripts }  from "../stores/scripts.js";
import { bootstrapGroups }   from "../stores/groups.js";
import { bootstrapStatus }   from "../stores/status.js";
import { bootstrapAlerts }   from "../stores/alerts.js";
import { bootstrapLogs }     from "../stores/logs.js";
import { bootstrapDiag }     from "../stores/diag.js";

let bootstrapped = false;

// On every successful WS open we re-fetch everything — keeps stores
// accurate after transient disconnects.
//
// Serialized on purpose: firing all eight bootstrap calls in
// parallel flooded the ESP-IDF httpd task, and any backend command
// that blocks on a HAP round-trip (device.list, rule.list, …) stalls
// the httpd task enough that the next WS frame can't be received.
// One-at-a-time keeps the pipe moving; total bootstrap time is
// <1 s on a healthy link.
export function wireBootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    onOpen(async () => {
        const steps = [
            bootstrapStatus,  bootstrapDevices, bootstrapRules,
            bootstrapScripts, bootstrapGroups,  bootstrapAlerts,
            bootstrapLogs,    bootstrapDiag,
        ];
        for (const step of steps) {
            try { await step(); }
            catch (_) { /* individual step failures are non-fatal */ }
        }
    });
}
