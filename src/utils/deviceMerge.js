// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure merge behind the attr.bulk push (stores/devices.js). attr.bulk carries
// an ARRAY of per-device entries `{ieee, lqi, last_seen, offline, attrs}`
// (offline: the device was silent too long, see the hub's availability); several
// entries for one IEEE may come in one batch and fold in order. Returns the
// list unchanged when there is nothing to apply, else a new list in which only
// the touched rows are new objects (refs to the others stay stable).
export function mergeAttrBulk(list, entries) {
    if (!Array.isArray(entries) || entries.length === 0) return list;

    // First pass: one merged delta per device, keyed by lowercased IEEE.
    const updates = new Map();
    for (const a of entries) {
        if (!a || !a.ieee || !a.attrs) continue;
        const key = String(a.ieee).toLowerCase();
        const prev = updates.get(key);
        updates.set(key, {
            attrs:     { ...(prev?.attrs || {}), ...a.attrs },
            lqi:       a.lqi       != null ? a.lqi       : prev?.lqi,
            last_seen: a.last_seen != null ? a.last_seen : prev?.last_seen,
            offline:   a.offline   != null ? a.offline   : prev?.offline,
        });
    }
    if (updates.size === 0) return list;

    // Second pass: apply each merged delta to the matching row.
    return list.map(x => {
        const u = updates.get(String(x.ieee).toLowerCase());
        if (!u) return x;
        const row = {
            ...x,
            attrs:     { ...(x.attrs || {}), ...u.attrs },
            lqi:       u.lqi       != null ? u.lqi       : x.lqi,
            last_seen: u.last_seen != null ? u.last_seen : x.last_seen,
        };
        if (u.offline != null) row.offline = u.offline;
        return row;
    });
}
