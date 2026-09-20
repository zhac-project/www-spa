// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Info page — two cards (S3 + P4) on the dual-chip build, one card for the
// chip that runs everything on single-chip and wired builds. Repaints on status.tick push
// events from `stores/status.js`. One mount-time refresh seeds the view
// after a fresh navigation; we used to also poll every 5 s as a
// "safety net" but that doubled the load on httpd and made the Info-page
// 11/12 flip race observable. Trust the push stream — `wireBootstrap`
// already re-fetches `status` on every WS reconnect.
import { useEffect } from "preact/hooks";
import { status, bootstrapStatus, hubKind, chipName } from "../stores/status.js";
import { Card } from "../components/Card.jsx";
import { Badge } from "../components/Badge.jsx";
import { fmtUptime, fmtBytes } from "../utils.js";
import { LINKS } from "../links.js";

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

    const kind = hubKind(d);
    const memRows = (x) => [
        ["CPU Core 0",     x.cpu_c0 != null ? x.cpu_c0 + "%" : "—"],
        ["CPU Core 1",     x.cpu_c1 != null ? x.cpu_c1 + "%" : "—"],
        ["Heap Free",      fmtBytes(x.heap)],
        ["Heap Min Free",  fmtBytes(x.heap_min)],
        ["Internal Free",  fmtBytes(x.int_free)],
        ["Internal Min",   fmtBytes(x.int_min)],
        ["Internal Block", fmtBytes(x.int_blk)],
        ["PSRAM",          fmtPair(x.psram_free, x.psram_total)],
        ["PSRAM Min Free", fmtBytes(x.psram_min)],
        ["PSRAM Block",    fmtBytes(x.psram_blk)],
        ["Stack HWM",      fmtBytes(x.stack_hwm) + (x.stack_hwm_task ? ` (${x.stack_hwm_task})` : "")],
    ];
    const mqttRow = ["MQTT", d.mqtt_connected ? <Badge kind="ok">Connected</Badge> : <Badge kind="warn">Disconnected</Badge>];
    const netRow = kind === "wired"
        ? ["Ethernet", d.link_up
            ? <Badge kind="ok">{d.link_speed ? `${d.link_speed} Mbit/s ${d.link_duplex || ""}` : "Link up"}</Badge>
            : <Badge kind="err">No link</Badge>]
        : ["WiFi", d.wifi ? <Badge kind="ok">Connected</Badge> : <Badge kind="err">Disconnected</Badge>];
    const radioRow = ["Zigbee radio",
        d.zigbee_present === false ? <Badge kind="err">Not present</Badge>
        : d.zigbee_ok === true     ? <Badge kind="ok">Running</Badge>
        : d.zigbee_ok === false    ? <Badge kind="err">{d.radio_error === "radio_crashed" ? "Crashed at start" : "Not running"}</Badge>
        : "—"];

    const s3Rows = [
        ["Firmware",       d.fw_version || "—"],
        ["Web UI",         __UI_VERSION__],
        ["Uptime",         d.uptime != null ? fmtUptime(d.uptime) : "—"],
        netRow,
        ["IP Address",     d.ip  || "—"],
        ["MAC",            d.mac || "—"],
        mqttRow,
        ["WS Clients",     d.ws_clients != null ? d.ws_clients : "—"],
        ["P4 Sync",        badgeFor(!!d.synced, true)],
        ...memRows(d),
    ];

    const p4Rows = [
        ["Firmware",        p.fw || "—"],
        ["Uptime",          p.uptime != null ? fmtUptime(p.uptime) : "—"],
        ["Devices",         p.devices != null ? p.devices : "—"],
        ...memRows(p),
    ];

    const oneRows = [
        ["Firmware",       d.fw_version || d.fw || "—"],
        ["Web UI",         __UI_VERSION__],
        ["Uptime",         d.uptime != null ? fmtUptime(d.uptime) : "—"],
        netRow,
        ["IP Address",     d.ip  || "—"],
        ...(d.ip6 ? [["IPv6", d.ip6]] : []),
        ...(d.hostname ? [["Hostname", d.hostname + ".local"]] : []),
        ["MAC",            d.mac || "—"],
        mqttRow,
        radioRow,
        ["Devices",        d.device_count != null ? d.device_count : "—"],
        ["WS Clients",     d.ws_clients != null ? d.ws_clients : "—"],
        ...memRows(d),
    ];

    return (
        <div class="page">
            <div class="cards">
                {kind === "dual" ? (
                    <>
                        <Card title="S3 Core"><KV rows={s3Rows} /></Card>
                        <Card title="P4 Core"><KV rows={p4Rows} /></Card>
                    </>
                ) : kind ? (
                    <Card title={chipName(d)}><KV rows={oneRows} /></Card>
                ) : null}
                <Card title="Help">
                    <ul class="help-links">
                        <li><a href={LINKS.firstSteps} target="_blank" rel="noopener">First 20 minutes</a> — pair a device, write a rule</li>
                        <li><a href={LINKS.troubleshooting} target="_blank" rel="noopener">Troubleshooting</a> — cannot find the hub, pairing, clock, lost password, updates</li>
                        <li><a href={LINKS.docs} target="_blank" rel="noopener">Documentation</a> — rules, Lua, REST and MQTT APIs</li>
                        <li><a href={LINKS.devices} target="_blank" rel="noopener">Supported devices</a></li>
                        <li><a href={LINKS.deviceRequest} target="_blank" rel="noopener">Ask for a device</a> ·{" "}
                            <a href={LINKS.bug} target="_blank" rel="noopener">Report a bug</a> ·{" "}
                            <a href={LINKS.discussions} target="_blank" rel="noopener">Discussions</a></li>
                        <li><a href={LINKS.releases[kind] || LINKS.releases.dual} target="_blank" rel="noopener">Latest release</a></li>
                    </ul>
                </Card>
            </div>
        </div>
    );
}
