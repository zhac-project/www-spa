// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Info page — mirrors the legacy two-card layout (S3 + P4) with the same
// set of rows the vanilla-JS UI presented. Repaints on status.tick push
// events from `stores/status.js`. One mount-time refresh seeds the view
// after a fresh navigation; we used to also poll every 5 s as a
// "safety net" but that doubled the load on httpd and made the Info-page
// 11/12 flip race observable. Trust the push stream — `wireBootstrap`
// already re-fetches `status` on every WS reconnect.
import { useEffect } from "preact/hooks";
import { status, bootstrapStatus } from "../stores/status.js";
import { Card } from "../components/Card.jsx";
import { Badge } from "../components/Badge.jsx";
import { fmtUptime, fmtBytes } from "../utils.js";

function badgeFor(ok, warn = false) {
    if (ok) return <Badge kind="ok">Yes</Badge>;
    return warn ? <Badge kind="warn">No</Badge> : <Badge kind="err">No</Badge>;
}

function KV({ rows }) {
    return (
        <table class="kv-table">
            <tbody>
                {rows.map(([k, v], i) => <tr key={i}><th>{k}</th><td>{v}</td></tr>)}
            </tbody>
        </table>
    );
}

export function InfoPage() {
    useEffect(() => { bootstrapStatus().catch(() => {}); }, []);

    const d = status.value || {};
    const p = d.p4 || {};
    const fmtPair = (a, b) => a != null ? fmtBytes(a) + " / " + fmtBytes(b || 0) : "—";

    const s3Rows = [
        ["Firmware",       d.fw_version || "—"],
        ["Uptime",         d.uptime != null ? fmtUptime(d.uptime) : "—"],
        ["WiFi",           d.wifi ? <Badge kind="ok">Connected</Badge> : <Badge kind="err">Disconnected</Badge>],
        ["IP Address",     d.ip  || "—"],
        ["MAC",            d.mac || "—"],
        ["MQTT",           d.mqtt_connected ? <Badge kind="ok">Connected</Badge> : <Badge kind="warn">Disconnected</Badge>],
        ["WS Clients",     d.ws_clients != null ? d.ws_clients : "—"],
        ["P4 Sync",        badgeFor(!!d.synced, true)],
        ["CPU Core 0",     d.cpu_c0 != null ? d.cpu_c0 + "%" : "—"],
        ["CPU Core 1",     d.cpu_c1 != null ? d.cpu_c1 + "%" : "—"],
        ["Heap Free",      fmtBytes(d.heap)],
        ["Heap Min Free",  fmtBytes(d.heap_min)],
        ["Internal Free",  fmtBytes(d.int_free)],
        ["Internal Min",   fmtBytes(d.int_min)],
        ["Internal Block", fmtBytes(d.int_blk)],
        ["PSRAM",          fmtPair(d.psram_free, d.psram_total)],
        ["PSRAM Min Free", fmtBytes(d.psram_min)],
        ["PSRAM Block",    fmtBytes(d.psram_blk)],
        ["Stack HWM",      fmtBytes(d.stack_hwm)],
    ];

    const p4Rows = [
        ["Firmware",        p.fw || "—"],
        ["Uptime",          p.uptime != null ? fmtUptime(p.uptime) : "—"],
        ["Devices",         p.devices != null ? p.devices : "—"],
        ["CPU Core 0",      p.cpu_c0 != null ? p.cpu_c0 + "%" : "—"],
        ["CPU Core 1",      p.cpu_c1 != null ? p.cpu_c1 + "%" : "—"],
        ["Heap Free",       fmtBytes(p.heap)],
        ["Heap Min Free",   fmtBytes(p.heap_min)],
        ["Internal Free",   fmtBytes(p.int_free)],
        ["Internal Min",    fmtBytes(p.int_min)],
        ["Internal Block",  fmtBytes(p.int_blk)],
        ["PSRAM",           fmtPair(p.psram_free, p.psram_total)],
        ["PSRAM Min Free",  fmtBytes(p.psram_min)],
        ["PSRAM Block",     fmtBytes(p.psram_blk)],
        ["Stack HWM",       fmtBytes(p.stack_hwm)],
    ];

    return (
        <div class="page">
            <div class="cards">
                <Card title="S3 Core"><KV rows={s3Rows} /></Card>
                <Card title="P4 Core"><KV rows={p4Rows} /></Card>
            </div>
        </div>
    );
}
