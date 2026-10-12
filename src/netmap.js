// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure helpers for the Map tab (spec 2026-10-12 §5): link merging, the
// by-parent tree, the force layout. No DOM, no WS: tested with node --test.

export const LQI_GOOD = 150;
export const LQI_FAIR = 80;

export function lqiBand(lqi) {
    if (lqi == null) return "none";
    if (lqi >= LQI_GOOD) return "good";
    if (lqi >= LQI_FAIR) return "fair";
    return "poor";
}

export function displayName(n) {
    return n.name || n.model || "…" + String(n.ieee).slice(-8);
}

const RANK = { coordinator: 0, router: 1, unknown: 2, end_device: 3 };

// One edge per device pair. `a` is the end nearer the coordinator: the parent
// when a record says so, else coordinator, router, unknown, end device in that
// order. `ab` is what a's table says about b, `ba` the other way round. The
// colour band follows the worse of the two.
export function mergeLinks(map) {
    const nodes = new Map((map?.nodes || []).map((n) => [n.ieee, n]));
    const pairs = new Map();
    for (const l of map?.links || []) {
        if (!nodes.has(l.src) || !nodes.has(l.dst) || l.src === l.dst) continue;
        const [x, y] = l.src < l.dst ? [l.src, l.dst] : [l.dst, l.src];
        const key = x + "|" + y;
        let p = pairs.get(key);
        if (!p) { p = { x, y, xy: null, yx: null, parent: null }; pairs.set(key, p); }
        if (l.src === x) p.xy = l.lqi; else p.yx = l.lqi;
        if (l.rel === "child") p.parent = l.src;
        else if (l.rel === "parent") p.parent = l.dst;
    }
    return [...pairs.values()].map((p) => {
        let a = p.parent;
        if (!a) a = (RANK[nodes.get(p.x).type] ?? 2) <= (RANK[nodes.get(p.y).type] ?? 2) ? p.x : p.y;
        const b = a === p.x ? p.y : p.x;
        const ab = a === p.x ? p.xy : p.yx;
        const ba = a === p.x ? p.yx : p.xy;
        const both = ab != null && ba != null;
        const worst = both ? Math.min(ab, ba) : (ab ?? ba);
        return { a, b, ab, ba, tree: p.parent != null, band: lqiBand(worst), label: both ? `${ab} / ${ba}` : String(worst) };
    });
}

// The by-parent list (spec §5.4): parent/child records first; a device none
// places hangs off its best link to a router or coordinator already placed;
// whatever is still loose goes under the coordinator.
export function buildTree(map) {
    const nodes = map?.nodes || [];
    const coord = nodes.find((n) => n.type === "coordinator");
    if (!coord) return null;
    const edges = mergeLinks(map);
    const item = new Map(nodes.map((n) => [n.ieee, {
        ieee: n.ieee, name: n.name, model: n.model, type: n.type, failed: n.failed, known: n.known,
        lqi: null, children: [],
    }]));
    const parentOf = new Map();
    for (const e of edges) if (e.tree && !parentOf.has(e.b)) parentOf.set(e.b, { p: e.a, lqi: e.ab ?? e.ba });

    const placed = new Set([coord.ieee]);
    const attach = (child, parent, lqi) => {
        const c = item.get(child);
        c.lqi = lqi;
        item.get(parent).children.push(c);
        placed.add(child);
    };
    for (let changed = true; changed;) {
        changed = false;
        for (const n of nodes) {
            if (placed.has(n.ieee)) continue;
            const pp = parentOf.get(n.ieee);
            if (pp && placed.has(pp.p)) { attach(n.ieee, pp.p, pp.lqi); changed = true; continue; }
            if (pp) continue;   // its parent is not placed yet
            let best = null;
            for (const e of edges) {
                const other = e.a === n.ieee ? e.b : e.b === n.ieee ? e.a : null;
                if (!other || !placed.has(other)) continue;
                const t = item.get(other).type;
                if (t !== "coordinator" && t !== "router") continue;
                const q = Math.max(e.ab ?? -1, e.ba ?? -1);
                if (!best || q > best.q) best = { other, q };
            }
            if (best) { attach(n.ieee, best.other, best.q < 0 ? null : best.q); changed = true; }
        }
    }
    for (const n of nodes) if (!placed.has(n.ieee)) attach(n.ieee, coord.ieee, null);

    // Routers before end devices, devices the hub knows before unknown ones, then by name.
    const order = (x, y) => (RANK[x.type] ?? 2) - (RANK[y.type] ?? 2) ||
        Number(!x.known) - Number(!y.known) || displayName(x).localeCompare(displayName(y));
    const sort = (it) => { it.children.sort(order); it.children.forEach(sort); };
    const root = item.get(coord.ieee);
    sort(root);
    return root;
}

// Fruchterman-Reingold from a fixed start (a circle by index), so the same map
// always draws the same way. The coordinator stays in the middle.
// ponytail: O(n^2) per step; fine to 256 nodes x 300 steps (~100 ms), a grid
// would be the upgrade if maps grow.
export function layout(nodes, edges, { width = 880, height = 580, steps = 300 } = {}) {
    const n = nodes.length;
    const cx = width / 2, cy = height / 2, pad = 24;
    const r0 = Math.min(width, height) * 0.38;
    const pos = {};
    nodes.forEach((nd, i) => {
        const t = (2 * Math.PI * i) / Math.max(1, n);
        pos[nd.ieee] = nd.type === "coordinator" ? { x: cx, y: cy } : { x: cx + r0 * Math.cos(t), y: cy + r0 * Math.sin(t) };
    });
    const k = Math.sqrt((width * height) / Math.max(1, n)) * 0.6;
    for (let s = 0; s < steps; s++) {
        const cap = Math.max(0.5, (1 - s / steps) * k * 0.5);
        const d = {};
        for (const nd of nodes) d[nd.ieee] = { x: 0, y: 0 };
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const p = pos[nodes[i].ieee], q = pos[nodes[j].ieee];
                let dx = p.x - q.x, dy = p.y - q.y;
                let dist = Math.hypot(dx, dy);
                if (dist < 0.01) { dx = 0.01 * (i - j || 1); dy = 0.01; dist = Math.hypot(dx, dy); }
                const f = (k * k) / dist;
                d[nodes[i].ieee].x += (dx / dist) * f; d[nodes[i].ieee].y += (dy / dist) * f;
                d[nodes[j].ieee].x -= (dx / dist) * f; d[nodes[j].ieee].y -= (dy / dist) * f;
            }
        }
        for (const e of edges) {
            const p = pos[e.a], q = pos[e.b];
            if (!p || !q) continue;
            const dx = p.x - q.x, dy = p.y - q.y;
            const dist = Math.max(0.01, Math.hypot(dx, dy));
            const f = (dist * dist) / k;
            d[e.a].x -= (dx / dist) * f; d[e.a].y -= (dy / dist) * f;
            d[e.b].x += (dx / dist) * f; d[e.b].y += (dy / dist) * f;
        }
        for (const nd of nodes) {
            if (nd.type === "coordinator") continue;
            const v = d[nd.ieee], len = Math.hypot(v.x, v.y);
            if (len > 0) {
                const m = Math.min(len, cap);
                pos[nd.ieee].x += (v.x / len) * m;
                pos[nd.ieee].y += (v.y / len) * m;
            }
            pos[nd.ieee].x = Math.min(width - pad, Math.max(pad, pos[nd.ieee].x));
            pos[nd.ieee].y = Math.min(height - pad, Math.max(pad, pos[nd.ieee].y));
        }
    }
    return pos;
}

// How old the last scan is. A hub without a set clock sends ts 0: count from
// when this page received the map instead (spec §5.2).
export function scanAge(ts, receivedAtMs, nowMs = Date.now()) {
    if (ts > 0) return { sec: Math.max(0, Math.round(nowMs / 1000 - ts)), clockSet: true };
    return { sec: Math.max(0, Math.round((nowMs - receivedAtMs) / 1000)), clockSet: false };
}

const SCAN_ERRORS = {
    busy: "A scan is already running",
    not_ready: "The Zigbee network is not up yet",
    oom: "The hub ran out of memory for the map",
};

export function scanErrorText(code) {
    return SCAN_ERRORS[code] || `Scan failed: ${code}`;
}
