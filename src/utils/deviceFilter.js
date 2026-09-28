// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure predicate behind the Devices page filter box: case-insensitive
// substring match against name, IEEE, model or vendor. No DOM, no store --
// pages/Devices.jsx wires this to the text input.
export function deviceMatchesFilter(d, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    if (!d) return false;
    return [d.name, d.ieee, d.model, d.vendor]
        .some((v) => v != null && String(v).toLowerCase().includes(q));
}
