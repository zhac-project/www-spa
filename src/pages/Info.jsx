// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Info page — three cards (the chip, Resources, Help). Repaints on status.tick push
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

// Same state names the WS `remote.status` command reports (see
// remote_state_name / RemoteState in zhac-wired-core's api_remote.cpp) --
// presentation only, no decisions beyond mapping a name to a badge.
const CLOUD_BADGE = {
    READY:          { kind: "ok",   label: "Connected" },
    CONNECTING:     { kind: "warn", label: "Connecting" },
    AUTHENTICATING: { kind: "warn", label: "Authenticating" },
    BACKOFF:        { kind: "warn", label: "Reconnecting" },
    IDLE_NO_WIFI:   { kind: "warn", label: "Disconnected" },
    DISABLED:       { kind: null,   label: "Off" },
};

function cloudRow(d) {
    if (d.remote_state == null) return null;
    const entry = CLOUD_BADGE[d.remote_state] || { kind: "err", label: d.remote_state };
    return ["Cloud", entry.kind ? <Badge kind={entry.kind}>{entry.label}</Badge> : entry.label];
}

// reset_reason names from the hub (logcloud::reset_name in zhac-wired-core) -- labels only.
const RESET_LABEL = {
    power_on: "Power on",
    sw:       "Restart",
    panic:    "Crash",
    int_wdt:  "Crash (interrupt watchdog)",
    task_wdt: "Crash (task watchdog)",
    wdt:      "Watchdog reset",
    brownout: "Power dip (brownout)",
    ext:      "Reset button",
    other:    "Other",
};

// Why the hub last started and, right after a crash, where it crashed (/api/status reset_reason, last_crash).
function startRows(d) {
    if (!d.reset_reason) return [];
    const label = RESET_LABEL[d.reset_reason] || d.reset_reason;
    const c = d.last_crash;
    return [
        ["Started after", c ? <Badge kind="err">{label}</Badge> : label],
        ...(c ? [["Crash", `${c.task || "?"}: ${c.cause || "?"} (pc ${c.pc || "?"})`]] : []),
    ];
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
    const netRow = ["Ethernet", d.link_up
        ? <Badge kind="ok">{d.link_speed ? `${d.link_speed} Mbit/s ${d.link_duplex || ""}` : "Link up"}</Badge>
        : <Badge kind="err">No link</Badge>];
    const radioRow = ["Zigbee radio",
        d.zigbee_present === false ? <Badge kind="err">Not present</Badge>
        : d.zigbee_ok === true     ? <Badge kind="ok">Running</Badge>
        : d.zigbee_ok === false    ? <Badge kind="err">{d.radio_error === "radio_crashed" ? "Crashed at start" : "Not running"}</Badge>
        : "—"];

    const cRow = cloudRow(d);
    const oneRows = [
        ["Firmware",       d.fw_version || d.fw || "—"],
        ["Web UI",         __UI_VERSION__],
        ["Uptime",         d.uptime != null ? fmtUptime(d.uptime) : "—"],
        ...startRows(d),
        netRow,
        ["IP Address",     d.ip  || "—"],
        ...(d.ip6 ? [["IPv6", d.ip6]] : []),
        ...(d.hostname ? [["Hostname", d.hostname + ".local"]] : []),
        ["MAC",            d.mac || "—"],
        mqttRow,
        ...(cRow ? [cRow] : []),
        radioRow,
        ["Devices",        d.device_count != null ? d.device_count : "—"],
        ["WS Clients",     d.ws_clients != null ? d.ws_clients : "—"],
    ];

    return (
        <div class="page">
            <div class="cards">
                {kind ? (
                    <>
                        <Card title={chipName(d)}><KV rows={oneRows} /></Card>
                        <Card title="Resources"><KV rows={memRows(d)} /></Card>
                    </>
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
                        <li><a href={LINKS.releases} target="_blank" rel="noopener">Latest release</a></li>
                    </ul>
                </Card>
            </div>
        </div>
    );
}
