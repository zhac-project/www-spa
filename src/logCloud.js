// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Settings → Remote → "Log to cloud" (spec 2026-10-06 cloud logs §3.1): the level names and the copy. No
// imports, so `npm test` can load it.

export const LOG_LEVELS = [
    { id: "errors", name: "Errors", meaning: "Errors only." },
    { id: "warnings", name: "Warnings", meaning: "Warnings and errors." },
    { id: "everything", name: "Everything", meaning: "All lines, about 1–20 MB a day." },
];

function levelName(id) {
    return LOG_LEVELS.find((l) => l.id === id)?.name ?? "Off";
}

/** The toast after a change: `toggled` = the switch itself moved (on or off), else a level was picked. */
export function levelToast(id, toggled) {
    if (id === "off") return "Log to cloud off";
    return toggled ? `Log to cloud on · ${levelName(id)}` : `Log to cloud: ${levelName(id)}`;
}

/** "Sent 12,345 lines · 0 dropped (since the hub started)", from remote.status log_sent / log_dropped. */
export function countersText(sent, dropped) {
    const s = Number(sent) || 0;
    const d = Number(dropped) || 0;
    const f = (n) => n.toLocaleString("en-US");
    return `Sent ${f(s)} line${s === 1 ? "" : "s"} · ${f(d)} dropped (since the hub started)`;
}
