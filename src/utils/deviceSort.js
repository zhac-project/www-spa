// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure ordering behind the Devices page column headers. No DOM, no store --
// pages/Devices.jsx keeps the chosen column + direction and calls sortDevices.
// Each column sorts what the table shows. Ascending means: names A to Z,
// lowest LQI first, and for "Last seen" the most recently seen first.
// A row with nothing to show in the column goes last in BOTH directions;
// ties fall back to the name, then the IEEE (never flipped by the direction).

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const byNumber = (a, b) => a - b;
const finite = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

// Same rule as fmtSince(): a missing or pre-2020 timestamp shows "—".
// Negated, so ascending = the smallest "time since" = the newest first.
const seenKey = (d) => {
    const n = finite(d.last_seen);
    return n != null && n >= 1577836800 ? -n : null;
};

export const SORT_COLUMNS = {
    name:      { cmp: collator.compare, key: (d) => d.name || d.ieee },
    vendor:    { cmp: collator.compare, key: (d) => d.vendor },
    model:     { cmp: collator.compare, key: (d) => d.model },
    lqi:       { cmp: byNumber,         key: (d) => finite(d.lqi) },
    last_seen: { cmp: byNumber,         key: seenKey },
};

const isCol = (col) => Object.hasOwn(SORT_COLUMNS, col);
const isMissing = (v) => v == null || (typeof v === "string" && v.trim() === "");
const tieBreak = (a, b) =>
    collator.compare(String(a.name || a.ieee || ""), String(b.name || b.ieee || "")) ||
    collator.compare(String(a.ieee || ""), String(b.ieee || ""));

// Returns a new array; an unknown column gives the list back as it is.
export function sortDevices(list, col, dir = "asc") {
    if (!isCol(col)) return list;
    const { cmp, key } = SORT_COLUMNS[col];
    const sign = dir === "desc" ? -1 : 1;
    return list
        .map((d) => ({ d, k: key(d) }))
        .sort((x, y) => {
            const mx = isMissing(x.k), my = isMissing(y.k);
            if (mx !== my) return mx ? 1 : -1;
            return (mx ? 0 : sign * cmp(x.k, y.k)) || tieBreak(x.d, y.d);
        })
        .map((r) => r.d);
}

// A click on a header: same column reverses, another column starts ascending.
export function nextSort(cur, col) {
    if (cur && cur.col === col) return { col, dir: cur.dir === "asc" ? "desc" : "asc" };
    return { col, dir: "asc" };
}

// The remembered choice (JSON text from localStorage); null when unusable.
export function parseSort(text) {
    try {
        const v = JSON.parse(text);
        if (v && isCol(v.col) && (v.dir === "asc" || v.dir === "desc")) return { col: v.col, dir: v.dir };
    } catch { /* not JSON / null */ }
    return null;
}
