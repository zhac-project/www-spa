// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Map tab: the Zigbee mesh as a graph and a by-parent list (spec 2026-10-12 §5,
// canvas 9zLNwYtN1mGWrJ8xZ7BJ1k). Data: stores/netmap.js. Geometry and the
// tree: netmap.js (pure, tested).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { netmap, startScan } from "../stores/netmap.js";
import { navigate, hrefFor } from "../stores/ui.js";
import { fmtAgo, hex16 } from "../utils.js";
import { mergeLinks, buildTree, layout, scanAge, displayName, lqiBand } from "../netmap.js";

const W = 880, H = 580;
const TYPE_LABEL = { coordinator: "Coordinator", router: "Router", end_device: "End device", unknown: "Unknown type" };
const R = { coordinator: 24, router: 14, end_device: 8, unknown: 8 };

function openDevice(e, ieee) {
    e.preventDefault();
    navigate("device", { ieee });
}

export function MapPage() {
    const { scanning, progress, map, receivedAt } = netmap.value;
    return (
        <div class="page netmap">
            <ScanBar scanning={scanning} progress={progress} map={map} receivedAt={receivedAt} />
            {!map && !scanning && <EmptyCard />}
            {map && (
                <div class="netmap-cols">
                    <GraphCard map={map} faded={scanning} />
                    <div class="netmap-side">
                        <TreeCard map={map} />
                        <NotSeenCard map={map} />
                    </div>
                </div>
            )}
        </div>
    );
}

function ScanBar({ scanning, progress, map, receivedAt }) {
    const [, tick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => tick((x) => x + 1), 30000);   // keeps "N min ago" fresh
        return () => clearInterval(t);
    }, []);
    return (
        <section class="card netmap-bar" aria-label="Scan">
            <button class="primary" disabled={scanning} onClick={startScan}>
                {scanning ? "Scanning…" : "Scan network"}
            </button>
            {scanning ? <Progress p={progress} /> : map && <Summary map={map} receivedAt={receivedAt} />}
            <span class="toolbar-spacer" />
            <ul class="netmap-legend" aria-label="Link quality">
                <li><span class="lq good" />Good ≥ 150</li>
                <li><span class="lq fair" />Fair 80–149</li>
                <li><span class="lq poor" />Poor &lt; 80</li>
                <li><span class="lq other" />Not parent/child</li>
            </ul>
        </section>
    );
}

function Summary({ map, receivedAt }) {
    const age = scanAge(map.ts, receivedAt);
    const routers = map.nodes.filter((n) => n.type === "router");
    const failed = routers.filter((n) => n.failed).length;
    const unseen = (map.not_seen || []).length;
    return (
        <div class="netmap-summary">
            <strong>
                Last scan {fmtAgo(age.sec)}{age.clockSet ? "" : " (hub clock not set)"} · took {(map.duration_ms / 1000).toFixed(1)} s
            </strong>
            <span class="muted">
                {routers.length} routers asked{failed ? `, ${failed} gave no reply` : ""} · {map.nodes.length - 1} devices on the map
                {unseen ? `, ${unseen} not seen` : ""}{map.truncated ? " · map cut short: too many devices" : ""}
            </span>
        </div>
    );
}

function Progress({ p }) {
    const done = p?.done || 0, total = p?.total || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
        <div class="netmap-progress">
            <strong>{p?.current ? `Asking ${p.current}… ` : "Starting… "}{done} / {total} routers</strong>
            <div class="ota-progress" role="progressbar" aria-label="Scan progress"
                 aria-valuemin="0" aria-valuemax={total} aria-valuenow={done}>
                <div class="ota-progress-bar" style={{ width: pct + "%" }} />
            </div>
            <span class="muted">More routers can turn up as the scan goes. You can leave this page: the hub keeps scanning.</span>
        </div>
    );
}

function EmptyCard() {
    return (
        <section class="card netmap-empty">
            <h3>No scan yet</h3>
            <p class="muted">
                A scan asks every router for its neighbours and draws who hears whom.
                It adds a little radio traffic and takes about 1–2 s per router.
            </p>
            <button class="primary" onClick={startScan}>Scan network</button>
        </section>
    );
}

function GraphCard({ map, faded }) {
    const edges = useMemo(() => mergeLinks(map), [map]);
    const base = useMemo(() => layout(map.nodes, edges, { width: W, height: H }), [map, edges]);
    const byId = useMemo(() => new Map(map.nodes.map((n) => [n.ieee, n])), [map]);
    const [moved, setMoved] = useState({});
    const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
    const [sel, setSel] = useState(null);
    const svg = useRef(null);
    const drag = useRef(null);
    const pointers = useRef(new Map());
    useEffect(() => { setMoved({}); setSel(null); setView({ x: 0, y: 0, w: W, h: H }); }, [map]);

    const pos = (ieee) => moved[ieee] || base[ieee];
    const rect = () => svg.current.getBoundingClientRect();
    const toSvg = (cx, cy, v = view) => {
        const r = rect();
        return { x: v.x + ((cx - r.left) / r.width) * v.w, y: v.y + ((cy - r.top) / r.height) * v.h };
    };
    const zoomAt = (f, px, py, v = view) => {
        const w = Math.min(W * 4, Math.max(W / 8, v.w * f)), h = w * (H / W);
        return { x: px - (px - v.x) * (w / v.w), y: py - (py - v.y) * (h / v.h), w, h };
    };
    const zoom = (f) => setView(zoomAt(f, view.x + view.w / 2, view.y + view.h / 2));

    const onWheel = (e) => {
        e.preventDefault();
        const p = toSvg(e.clientX, e.clientY);
        setView(zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y));
    };
    const onDown = (e) => {
        svg.current.setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {   // pinch
            const [a, b] = [...pointers.current.values()];
            drag.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), view };
            return;
        }
        const ieee = e.target.closest?.("[data-ieee]")?.getAttribute("data-ieee") || null;
        drag.current = { ieee, cx: e.clientX, cy: e.clientY, view, moved: false };
    };
    const onMove = (e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const d = drag.current;
        if (!d) return;
        if (d.pinch && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2, d.view);
            setView(zoomAt(d.pinch / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid.x, mid.y, d.view));
            return;
        }
        if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) > 4) d.moved = true;
        if (!d.moved) return;
        if (d.ieee) {
            setMoved((m) => ({ ...m, [d.ieee]: toSvg(e.clientX, e.clientY) }));
        } else {
            const r = rect();
            const dx = ((e.clientX - d.cx) / r.width) * d.view.w, dy = ((e.clientY - d.cy) / r.height) * d.view.h;
            setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
        }
    };
    const onUp = (e) => {
        pointers.current.delete(e.pointerId);
        const d = drag.current;
        if (pointers.current.size === 0) drag.current = null;
        if (d && !d.pinch && !d.moved) setSel(d.ieee);   // a tap: select, or clear on the background
    };

    const lit = sel ? new Set(edges.filter((e) => e.a === sel || e.b === sel).flatMap((e) => [e.a, e.b])) : null;
    const pill = (e) => byId.get(e.a)?.type !== "end_device" && byId.get(e.b)?.type !== "end_device";

    return (
        <section class="card netmap-graph" aria-labelledby="nm-g">
            <div class="toolbar">
                <h3 id="nm-g">Graph</h3>
                <span class="toolbar-spacer" />
                <span class="muted netmap-hint">Drag to move · scroll or pinch to zoom · tap a device</span>
                <button aria-label="Zoom in" onClick={() => zoom(1 / 1.3)}>+</button>
                <button aria-label="Zoom out" onClick={() => zoom(1.3)}>−</button>
                <button onClick={() => { setView({ x: 0, y: 0, w: W, h: H }); setMoved({}); }}>Fit</button>
            </div>
            <div class={"netmap-svgbox" + (faded ? " faded" : "")}>
                <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img"
                     aria-label={`Network graph: ${map.nodes.length} devices`}
                     onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove}
                     onPointerUp={onUp} onPointerCancel={onUp}>
                    {edges.map((e) => {
                        const a = pos(e.a), b = pos(e.b);
                        const dim = lit && !(e.a === sel || e.b === sel);
                        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                        return (
                            <g key={e.a + "|" + e.b} class={`nm-edge ${e.band}${e.tree ? "" : " other"}${dim ? " dim" : ""}`}>
                                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                                {pill(e) && <rect class="pill" x={mx - (e.label.length * 7 + 12) / 2} y={my - 10}
                                                  width={e.label.length * 7 + 12} height="20" rx="10" />}
                                <text class={pill(e) ? "" : "small"} x={mx} y={my + 4}>{e.label}</text>
                            </g>
                        );
                    })}
                    {map.nodes.map((n) => {
                        const p = pos(n.ieee), r = R[n.type] || 8;
                        const cls = `nm-node ${n.type}${n.failed ? " failed" : ""}${n.known ? "" : " unknown"}` +
                                    `${n.ieee === sel ? " sel" : ""}${lit && !lit.has(n.ieee) ? " dim" : ""}`;
                        return (
                            <g key={n.ieee} class={cls} data-ieee={n.ieee} transform={`translate(${p.x} ${p.y})`}>
                                {n.failed && <circle class="ring" r={r + 6} />}
                                <circle r={r} />
                                <text y={r + 15}>{displayName(n)}{n.failed ? " · no reply" : ""}</text>
                            </g>
                        );
                    })}
                </svg>
                {sel && byId.get(sel) && (
                    <NodeInfo node={byId.get(sel)} edges={edges} byId={byId} onClose={() => setSel(null)} />
                )}
            </div>
            <ul class="netmap-legend nodes" aria-label="Node types">
                <li><span class="dot coordinator" />Coordinator</li>
                <li><span class="dot router" />Router</li>
                <li><span class="dot end_device" />End device</li>
                <li><span class="dot router failed" />No reply</li>
                <li><span class="dot unknown" />Not known to this hub</li>
            </ul>
        </section>
    );
}

function NodeInfo({ node, edges, byId, onClose }) {
    const mine = edges.filter((e) => e.a === node.ieee || e.b === node.ieee);
    return (
        <div class="netmap-info" role="dialog" aria-label={displayName(node)}>
            <div class="netmap-info-head">
                <strong>{displayName(node)}</strong>
                <button aria-label="Close" onClick={onClose}>×</button>
            </div>
            <span class="muted">
                {TYPE_LABEL[node.type] || node.type}{node.model ? " · " + node.model : ""}{node.failed ? " · no reply" : ""}
            </span>
            <span class="muted mono">nwk {hex16(node.nwk)} · {node.ieee}</span>
            <ul>
                {mine.map((e) => {
                    const other = byId.get(e.a === node.ieee ? e.b : e.a);
                    return (
                        <li key={other.ieee}>
                            <span>{displayName(other)}</span>
                            <span class={"lqv " + e.band}>{e.label}</span>
                        </li>
                    );
                })}
            </ul>
            {node.known && node.type !== "coordinator" && (
                <a class="netmap-open" href={hrefFor("device", { ieee: node.ieee })}
                   onClick={(e) => openDevice(e, node.ieee)}>Open device</a>
            )}
        </div>
    );
}

function TreeCard({ map }) {
    const root = useMemo(() => buildTree(map), [map]);
    if (!root) return null;
    return (
        <section class="card netmap-tree" aria-labelledby="nm-t">
            <h3 id="nm-t">By parent</h3>
            <ul class="nm-tree">
                <li class="nm-row root"><span class="dot coordinator" />{displayName(root)}<span class="muted"> · coordinator</span></li>
                {root.children.map((c) => <TreeRow key={c.ieee} n={c} depth={1} />)}
            </ul>
        </section>
    );
}

function TreeRow({ n, depth }) {
    return (
        <>
            <li class={"nm-row " + n.type} style={{ paddingLeft: depth * 18 + "px" }}>
                <span class={`dot ${n.type}${n.failed ? " failed" : ""}${n.known ? "" : " unknown"}`} />
                {n.known
                    ? <a href={hrefFor("device", { ieee: n.ieee })} onClick={(e) => openDevice(e, n.ieee)}>{displayName(n)}</a>
                    : <span class="nm-name muted">Not known to this hub · <span class="mono">{n.ieee}</span></span>}
                {n.failed && <span class="badge badge-err">No reply</span>}
                <LqiBar lqi={n.lqi} />
            </li>
            {n.children.map((c) => <TreeRow key={c.ieee} n={c} depth={depth + 1} />)}
        </>
    );
}

function LqiBar({ lqi }) {
    if (lqi == null) return <span class="nm-lqi muted">—</span>;
    const band = lqiBand(lqi);
    return (
        <>
            <span class="nm-bar" aria-hidden="true"><span class={band} style={{ width: Math.round((lqi / 255) * 100) + "%" }} /></span>
            <span class={"nm-lqi " + band}>{lqi}</span>
        </>
    );
}

function NotSeenCard({ map }) {
    const list = map.not_seen || [];
    if (!list.length) return null;
    const now = Date.now() / 1000;
    return (
        <section class="card netmap-notseen" aria-labelledby="nm-n">
            <h3 id="nm-n">Not seen in scan · {list.length}</h3>
            <p class="muted">No router listed these. Usually a sleeping device whose parent forgot it, or a device that is off.</p>
            <ul>
                {list.map((d) => (
                    <li key={d.ieee}>
                        <a href={hrefFor("device", { ieee: d.ieee })} onClick={(e) => openDevice(e, d.ieee)}>{d.name || d.ieee}</a>
                        <span class="muted">{d.last_seen ? "last seen " + fmtAgo(now - d.last_seen) : "not seen yet"}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
