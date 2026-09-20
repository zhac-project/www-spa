// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The restore preview: what a backup file holds and what it never does, in
// the words the confirm dialog shows. No imports, so `npm test` can load it.
export const BACKUP_FORMAT = 1;
const lc = (s) => String(s || "").toLowerCase();

// What a backup holds and what it does not, in the words the confirm
// dialog shows before a restore. `paired` = IEEEs on this hub, to say which
// saved names would be skipped. Pure: unit-tested in test/backup.test.mjs.
export const NOT_IN_BACKUP =
    "Not in a backup: the Zigbee network itself (keys, PAN id, paired devices), the admin " +
    "password and API token, the MQTT password and, on a Wi-Fi hub, the Wi-Fi password.";

export function describeBackup(b, paired = []) {
    if (!b || b.zhac_backup !== BACKUP_FORMAT) throw new Error("This is not a ZHAC backup file.");
    const have = new Set((paired || []).map(lc));
    const names = (b.devices || []).filter((d) => d.name);
    const missing = names.filter((d) => !have.has(lc(d.ieee))).map((d) => d.name);
    const rules = b.rules || [];
    const lines = [
        `Made ${(b.created || "").slice(0, 10) || "on an unknown date"} on "${b.hub || "?"}"` +
            (b.firmware ? ` (firmware ${b.firmware})` : "") + ".",
        `Contains ${names.length} device name${names.length === 1 ? "" : "s"}, ` +
            `${rules.length} rule${rules.length === 1 ? "" : "s"} (${rules.filter((r) => r.enabled !== false).length} enabled), ` +
            `${(b.scripts || []).length} script${(b.scripts || []).length === 1 ? "" : "s"}, ` +
            `${(b.collections || []).length} collection${(b.collections || []).length === 1 ? "" : "s"}.`,
    ];
    if (missing.length) {
        lines.push(`${missing.length} named device${missing.length === 1 ? " is" : "s are"} not paired on this hub and will be skipped: ` +
                   `${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}. Pair them, then restore again.`);
    }
    lines.push("Names, rules, scripts and collections are added or updated by name. Nothing is deleted.");
    lines.push(NOT_IN_BACKUP);
    return lines;
}

