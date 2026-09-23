// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A fake ZHAC hub for working on the web UI without hardware, and for the
// README screenshots. Plain node, no dependencies.
//
//   npm run build && npm run demo      # built UI on http://localhost:8080
//   npm run demo & npm run dev         # hot-reload UI on :5173, proxied here
//   DEMO_KIND=dual npm run demo        # pretend to be the dual-chip S3 + P4
//   DEMO_EMPTY=1 npm run demo          # a fresh hub with nothing paired
//   DEMO_RADIO_DOWN=1 npm run demo     # the radio crashed at start (C6 not flashed)
//   DEMO_CLOCK_UNSET=1 npm run demo    # no time from the internet yet: schedules wait
//   DEMO_CLOCK_STUCK=1 npm run demo    # ... and the hub refuses the browser's clock
//   DEMO_NTP_DHCP=1 npm run demo       # the router offers a time server (DHCP option 42)
//   DEMO_OTA_PENDING=1 npm run demo    # a freshly updated firmware is still on trial
//   DEMO_OTA_ROLLBACK=1 npm run demo   # the last update was undone; status says why
//   DEMO_AUTH=setup npm run demo       # fresh hub: sign-in on, no password, set-up window open
//   DEMO_AUTH=closed npm run demo      # ... powered on > 10 min ago: set-up refused until a power cycle
//   DEMO_AUTH=storage npm run demo     # sign-in storage unreadable: locked, serial token only
//   DEMO_STORAGE_ERROR=1 npm run demo  # NVS unusable at boot: Settings offers "Erase storage and restart"
//   DEMO_JOIN=unsupported npm run demo # "Add a device": the joining device has no definition
//   DEMO_JOIN=none npm run demo        # "Add a device": nothing joins (the two-minute timeout path)
//
// Payload shapes mirror zhac-wired-core's real replies (ws_bridge.cpp,
// api_status.cpp): same keys, same units, floats already divided by 100.
// Keep them in sync when the firmware changes a DTO, or the UI will be
// developed against data no hub sends.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8080);
const DUAL = process.env.DEMO_KIND === "dual";
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const now = () => Math.floor(Date.now() / 1000);
const BOOT = now() - 3 * 86400 - 5 * 3600;
const STARTED = now();   // the set-up window counts from a real power-on, not the faked uptime

// ── fixtures ───────────────────────────────────────────────────────────────
const num = (name, unit, extra = {}) => ({ name, type: "numeric", access: 1, ...(unit ? { unit } : {}), ...extra });
const diag = (name, unit) => num(name, unit, { category: "diagnostic" });
const DEVICES = [
    { ieee: "0x00158D0007A1B2C3", nwk: 0x3F1A, name: "hallway_motion", vendor: "Aqara", model: "RTCGQ11LM",
      manufacturer: "LUMI", model_id: "lumi.sensor_motion.aq2", power_source: "Battery", lqi: 142, battery: 87, seen: 40,
      exposes: [{ name: "occupancy", type: "binary", access: 1 }, num("illuminance", "lx"), diag("battery", "%"), diag("voltage", "mV")],
      attrs: { occupancy: 0, illuminance: 112, battery: 87, voltage: 3005 } },
    { ieee: "0x000B57FFFE8C4D21", nwk: 0x1C07, name: "living_room_lamp", vendor: "IKEA", model: "LED1836G9",
      manufacturer: "IKEA of Sweden", model_id: "TRADFRI bulb E27 WW 806lm", power_source: "Mains (single phase)", lqi: 208, battery: 0, seen: 12,
      exposes: [{ name: "state", type: "binary", access: 3 }, { name: "brightness", type: "numeric", access: 3, value_min: 0, value_max: 254 }],
      attrs: { state: 1, brightness: 180 } },
    { ieee: "0xA4C138F3E2D10B77", nwk: 0x8E42, name: "kitchen_plug", vendor: "Tuya", model: "TS011F_plug_1",
      manufacturer: "_TZ3000_cehuw1lw", model_id: "TS011F", power_source: "Mains (single phase)", lqi: 176, battery: 0, seen: 8,
      exposes: [{ name: "state", type: "binary", access: 3 }, num("power", "W"), num("energy", "kWh"), num("voltage", "V"), num("current", "A"),
                { name: "power_outage_memory", type: "enum", access: 3, category: "config", values: ["on", "off", "restore"] }],
      attrs: { state: 1, power: 61.4, energy: 12.87, voltage: 231.2, current: 0.31, power_outage_memory: "restore" } },
    { ieee: "0xA4C1386F0D3E2A19", nwk: 0x5B90, name: "front_door", vendor: "Tuya", model: "TS0203",
      manufacturer: "HOBEIAN", model_id: "ZG-102ZM", power_source: "Battery", lqi: 96, battery: 100, seen: 1800,
      exposes: [{ name: "contact", type: "binary", access: 1 }, { name: "tamper", type: "binary", access: 1 }, { name: "battery_low", type: "binary", access: 1, category: "diagnostic" }],
      attrs: { contact: 1, tamper: 0, battery_low: 0 } },
    { ieee: "0x00158D00045F6E7D", nwk: 0x2A6D, name: "bedroom_climate", vendor: "Aqara", model: "WSDCGQ11LM",
      manufacturer: "LUMI", model_id: "lumi.weather", power_source: "Battery", lqi: 121, battery: 64, seen: 300,
      exposes: [num("temperature", "°C"), num("humidity", "%"), num("pressure", "hPa"), diag("battery", "%")],
      attrs: { temperature: 21.37, humidity: 48.2, pressure: 1012.4, battery: 64 } },
    { ieee: "0xA4C138B9C4F7E801", nwk: 0x6D13, name: "radiator_valve", vendor: "Tuya", model: "TS0601_thermostat",
      manufacturer: "_TZE200_ckud7u2l", model_id: "TS0601", power_source: "Battery", lqi: 88, battery: 72, seen: 600,
      exposes: [{ name: "current_heating_setpoint", type: "numeric", access: 3, unit: "°C", value_min: 5, value_max: 35, value_step: 1 },
                num("local_temperature", "°C"), { name: "system_mode", type: "enum", access: 3, values: ["auto", "heat", "off"] },
                { name: "child_lock", type: "binary", access: 3, category: "config" }, diag("battery", "%")],
      attrs: { current_heating_setpoint: 21, local_temperature: 19.5, system_mode: "heat", child_lock: 0, battery: 72 } },
    // Weekly program: the device page shows the schedule editor for writable schedule_<day> strings.
    { ieee: "0xEC1BBDFFFE2DAD79", nwk: 0x12EC, name: "study_radiator", vendor: "Saswell", model: "SEA801-Zigbee/SEA802-Zigbee",
      manufacturer: "_TYST11_KGbxAXL2", model_id: "GbxAXL2", power_source: "Battery", lqi: 120, battery: 0, seen: 90,
      exposes: [{ name: "current_heating_setpoint", type: "numeric", access: 3, unit: "°C" }, num("local_temperature", "°C"),
                { name: "schedule_enable", type: "binary", access: 3 },
                ...["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                    .map((day) => ({ name: `schedule_${day}`, type: "text", access: 3 }))],
      attrs: { current_heating_setpoint: 21, local_temperature: 20.4, schedule_enable: 1,
               ...Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday"]
                   .map((day) => [`schedule_${day}`, "06:00/21.0 08:00/17.0 17:00/21.0 22:00/17.0"])),
               schedule_saturday: "08:00/21.0 12:00/20.0 17:00/21.0 23:00/17.0",
               schedule_sunday: "08:00/21.0 12:00/20.0 17:00/21.0 22:00/17.0" } },
];
const RULES = [
    { id: 1, enabled: true, trigger_type: 0, rule_type: 0, name: "Hallway light on motion",
      dsl: "ON hallway_motion#occupancy=1 DO zigbee.set living_room_lamp state 1 ENDON" },
    { id: 2, enabled: true, trigger_type: 0, rule_type: 0, name: "Door open alert",
      dsl: "ON front_door#contact=0 DO publish home/alert front_door_open ENDON" },
    { id: 3, enabled: false, trigger_type: 2, rule_type: 0, name: "Lamp off at 23:30",
      dsl: "ON Time#Cron=0 30 23 * * * DO zigbee.set living_room_lamp state 0 ENDON" },
];
const SCRIPTS = {
    heating_schedule: `-- Lower the radiator valve at night, raise it in the morning.
local VALVE = "0xA4C138B9C4F7E801"   -- radiator_valve

zhac.on_cron("0 0 6 * * *", function()
    zhac.set_attr(VALVE, "current_heating_setpoint", 21)
end)

zhac.on_cron("0 30 22 * * *", function()
    zhac.set_attr(VALVE, "current_heating_setpoint", 17)
end)
`,
    plug_watchdog: `-- Warn when the kitchen plug draws more than 2 kW.
-- Float attributes reach Lua x100: 200000 means 2000.00 W.
zhac.on_attr_change("0xA4C138F3E2D10B77", "power", function(ieee, key, value)
    if value > 200000 then
        zhac.publish("home/alert", "kitchen_plug overload")
    end
end)
`,
};
if (process.env.DEMO_EMPTY) DEVICES.length = 0;   // first-boot look: nothing paired yet
const GROUPS = { groups: [{ id: 1, name: "living_room", members: DEVICES.slice(1, 3).map((d) => d.ieee) }] };
let permitUntil = 0;

function status() {
    if (DUAL) return {   // net-core api_system.cpp shape: S3 fields + a p4 object, no sku
        fw_version: "v2026091801", uptime: now() - BOOT, synced: true, cpu_c0: 9, cpu_c1: 4,
        heap: 5_900_000, heap_min: 5_700_000, int_free: 61_000, int_min: 45_000, int_blk: 31_000,
        psram_free: 5_800_000, psram_min: 5_600_000, psram_blk: 5_100_000, psram_total: 8_388_608,
        stack_hwm: 980, ip: "192.168.1.48", mac: "D8:3B:DA:A3:81:F8", wifi: true,
        mqtt_connected: true, mqtt_active: true, mqtt_enabled: true, mqtt_broker: "mqtt://192.168.1.10",
        mqtt_root_topic: "zhac", ws_clients: 1, auth_enabled: false, auth_setup_required: false,
        metrics_enabled: false, ap_disabled: true, log_mqtt_enabled: false, log_ws_enabled: true,
        remote_available: false, p4_unresponsive: false,
        p4: { devices: DEVICES.length, uptime: now() - BOOT, fw: "v2026091801", heap: 30_100_000,
              heap_min: 29_800_000, int_free: 188_000, int_min: 170_000, int_blk: 90_000,
              psram_free: 29_900_000, psram_min: 29_700_000, psram_blk: 29_000_000,
              psram_total: 33_554_432, stack_hwm: 1200, cpu_c0: 2, cpu_c1: 1, proto_mask: 1, synced: true },
    };
    return {
        sku: "wired", net_transport: "ethernet", target: "esp32p4", cores: 2, revision: 130,
        fw_version: "v2026091801", uptime: now() - BOOT, synced: true,
        cpu_c0: 3, cpu_c1: 1, heap: 18_400_000, heap_min: 18_100_000,
        int_free: 214_000, int_min: 188_000, int_blk: 96_000,
        psram_free: 18_200_000, psram_min: 17_900_000, psram_blk: 16_700_000, psram_total: 33_554_432,
        stack_hwm: 1440, stack_hwm_task: "TaskZigbee",
        ip: "192.168.1.47", mac: "30:ED:A0:F4:3D:D9", hostname: "zhac",
        wifi: true, link_up: true, link_speed: 100, link_duplex: "full",
        mqtt_connected: true, mqtt_active: true, mqtt_enabled: true, mqtt_root_topic: "zhac",
        ws_clients: 1, device_count: DEVICES.length,
        zigbee_present: true, zigbee_ok: !process.env.DEMO_RADIO_DOWN,
        ...(process.env.DEMO_RADIO_DOWN ? { radio_error: "radio_crashed" } : {}),
        clock_set: demoClockSet,
        ntp_server: demoNtpServer,
        ...(process.env.DEMO_NTP_DHCP && demoNtpServer === "pool.ntp.org" ? { ntp_dhcp_server: "192.168.1.1" } : {}),
        ota: true, fw: "v2026091801",
        ...(process.env.DEMO_STORAGE_ERROR ? { storage_error: true } : {}),
        ota_state: process.env.DEMO_OTA_PENDING ? "pending" : "verified",
        ...(process.env.DEMO_OTA_ROLLBACK ? { ota_rollback_reason: "Zigbee radio not ready (it was before the update)" } : {}),
        auth_enabled: false,
        metrics_enabled: false, ap_disabled: true, log_mqtt_enabled: false, log_ws_enabled: true,
        mqtt_broker: "mqtt://192.168.1.10", mqtt_client_id: "", ha_discovery: true, ha_prefix: "homeassistant",
    };
}
const row = (d) => ({ ieee: d.ieee, nwk: d.nwk, friendly: d.name, name: d.name, model: d.model, model_id: d.model_id, known: !!d.model,
    manufacturer: d.manufacturer, vendor: d.vendor, last_seen: now() - d.seen, lqi: d.lqi,
    battery: d.battery, ep_count: 1 });
const detail = (d) => ({ ...row(d), model_id: d.model_id, mfr: 0, power_source: d.power_source,
    type: d.power_source === "Battery" ? "EndDevice" : "Router", bat_pct: d.battery,
    eps: [1], clusters: [[0, 1, 6]], attrs: d.attrs, exposes: d.exposes });
function logs() {
    const t0 = (now() - BOOT) * 1000;
    const lines = [
        "I (1204) eth: link up 100 Mbit full duplex", "I (1510) eth: got ip 192.168.1.47",
        "I (1522) mdns: zhac.local -> 192.168.1.47", "I (2310) esp_zb: network up, pan 0x27bf channel 12",
        "I (2388) esp_zb: restored 6 device(s) from NVS", "I (2410) mqtt_gw: connected to mqtt://192.168.1.10",
        "I (9120) rules: hallway_motion#occupancy=1 -> Hallway light on motion",
        "W (91233) esp_zb: front_door did not answer read (sleepy device)",
    ];
    return { logs: lines.map((l, i) => `${t0 - (lines.length - i) * 700} ${l}`) };
}

// ── WS commands ────────────────────────────────────────────────────────────
const find = (ieee) => DEVICES.find((d) => d.ieee.toLowerCase() === String(ieee || "").toLowerCase());
let demoClockSet = !process.env.DEMO_CLOCK_UNSET;
let demoNtpServer = "pool.ntp.org";
const COMMANDS = {
    "status.get": status,
    // Same rule as the firmware (zap_clock.h): fills an unset clock only.
    "time.set": (a) => {
        const ok = !demoClockSet && !process.env.DEMO_CLOCK_STUCK &&
                   Number(a.epoch) >= 1577836800 && Number(a.epoch) < 4102444800;
        if (ok) demoClockSet = true;
        return { set: ok };
    },
    "settings.set": (a) => {
        if (a.ntp_server !== undefined) demoNtpServer = String(a.ntp_server) || "pool.ntp.org";
        return {};
    },
    "device.list": () => DEVICES.map(row),
    "device.get": (a) => { const d = find(a.ieee); if (!d) throw new Error("device not found"); return detail(d); },
    "device.rename": (a) => { const d = find(a.ieee); if (d) d.name = a.name; return {}; },
    "device.attr.set": (a, push) => {
        const d = find(a.ieee); if (!d) throw new Error("device not found");
        d.attrs[a.key] = a.value; push("attr.changed", { ieee: d.ieee, key: a.key, value: a.value });
        return {};
    },
    "device.groups.list": () => ({ groups: [] }),
    "groups.all": () => ({ groups: [] }),
    "rule.list": () => RULES,
    "rule.create": (a, push) => {
        const r = { id: Math.max(0, ...RULES.map((x) => x.id)) + 1, enabled: true, trigger_type: 0,
                    rule_type: 0, name: a.name || "", dsl: a.dsl || "" };
        RULES.push(r); push("rule.added", r); return {};
    },
    "rule.update": (a, push) => {
        const r = RULES.find((x) => x.id === a.id); if (!r) throw new Error("no such rule");
        Object.assign(r, { name: a.name ?? r.name, dsl: a.dsl ?? r.dsl }); push("rule.updated", r); return {};
    },
    "rule.enable": (a, push) => {
        const r = RULES.find((x) => x.id === a.id); if (!r) throw new Error("no such rule");
        r.enabled = !!a.enabled; push("rule.updated", { id: r.id, enabled: r.enabled }); return {};
    },
    "group.create": (a) => {
        const g = { id: Math.max(0, ...GROUPS.groups.map((x) => x.id)) + 1, name: a.name, members: [] };
        GROUPS.groups.push(g); return g;
    },
    "group.update": (a) => {
        const g = GROUPS.groups.find((x) => x.id === a.id); if (!g) throw new Error("no such group");
        if (a.name) g.name = a.name; if (a.members) g.members = a.members; return g;
    },
    "script.list": () => Object.entries(SCRIPTS).map(([name, src]) => ({ name, size: src.length })),
    "script.read": (a) => ({ name: a.name, src: SCRIPTS[a.name] ?? "" }),
    "group.list": () => GROUPS,
    "alerts.get": () => [],
    "logs.get": logs,
    "diagnostics.unhandled.get": () => ({ entries: [] }),
    "system.storage_reset": () => ({}),
    "zigbee.permit_join": (a, push) => {
        permitUntil = Date.now() + (a.duration | 0) * 1000;
        // A device joins 6 s after pairing opens and finishes its interview 5 s
        // later, the way a real join fills the row in stages (DEMO_JOIN=none
        // keeps the demo silent, DEMO_JOIN=unsupported reports a model the hub
        // has no definition for).
        if ((a.duration | 0) > 0 && process.env.DEMO_JOIN !== "none" && !DEVICES.some(d => d.name === "new_device")) {
            const d = { ieee: "0x00158D00099DEMO1", nwk: 0x7A21, name: "", vendor: "", model: "", manufacturer: "",
                        model_id: "", power_source: "Battery", lqi: 88, battery: 100, seen: 0, exposes: [], attrs: {} };
            setTimeout(() => { if (Date.now() > permitUntil) return; DEVICES.push(d); push("device.added", row(d)); }, 6000);
            setTimeout(() => {
                if (!DEVICES.includes(d)) return;
                d.manufacturer = "_TZ3000_demo0001"; d.model_id = "TS0201";
                if (process.env.DEMO_JOIN !== "unsupported") {
                    d.name = "new_device"; d.vendor = "Tuya"; d.model = "TS0201";
                    d.exposes = [num("temperature", "°C"), num("humidity", "%"), diag("battery", "%")];
                    d.attrs = { temperature: 2210, humidity: 4800, battery: 100 };
                }
                push("device.updated", row(d));
            }, 11000);
        }
        return {};
    },
    "zigbee.permit_join.status": () => {
        const left = Math.max(0, Math.ceil((permitUntil - Date.now()) / 1000));
        return { open: left > 0, remaining_sec: left };
    },
    "net.status": () => ({ transport: "ethernet", link_up: true, has_ip: true, ip: "192.168.1.47",
        netmask: "255.255.255.0", gateway: "192.168.1.1", mac: "30:ED:A0:F4:3D:D9",
        speed_mbps: 100, duplex: "full", hostname: "zhac" }),
    "wifi.status": () => DUAL
        ? { mode: "sta", ssid: "home-2g", ip: "192.168.1.48", rssi: -58 }
        : { mode: "eth", ssid: "", ip: "192.168.1.47", rssi: 0,
            sta_configured: true, sta_connected: true, sta_ssid: "", ap_ssid: "" },
    "uplink.get": () => ({ uplink: "none" }),
};

// ── minimal WebSocket (RFC 6455): text frames, ping, close ─────────────────
function wsSend(sock, obj) {
    const body = Buffer.from(JSON.stringify(obj));
    const n = body.length;
    const head = n < 126 ? Buffer.from([0x81, n])
        : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255])
        : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
    sock.write(Buffer.concat([head, body]));
}
function wsFrames(buf) {           // -> { frames: [{op, data}], rest }
    const frames = [];
    while (buf.length >= 2) {
        const op = buf[0] & 0x0f, masked = buf[1] & 0x80;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const need = off + (masked ? 4 : 0) + len;
        if (buf.length < need) break;
        let data = buf.subarray(off + (masked ? 4 : 0), need);
        if (masked) { const m = buf.subarray(off, off + 4); data = Buffer.from(data.map((b, i) => b ^ m[i & 3])); }
        frames.push({ op, data });
        buf = buf.subarray(need);
    }
    return { frames, rest: buf };
}
function onUpgrade(req, sock) {
    if (req.url !== "/ws") return sock.destroy();
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const push = (event, data) => wsSend(sock, { event, data });
    let pending = Buffer.alloc(0);
    sock.on("data", (chunk) => {
        const { frames, rest } = wsFrames(Buffer.concat([pending, chunk]));
        pending = rest;
        for (const { op, data } of frames) {
            if (op === 0x8) return sock.end(Buffer.from([0x88, 0]));
            if (op === 0x9) { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
            if (op !== 0x1) continue;
            let msg; try { msg = JSON.parse(data.toString()); } catch { continue; }
            if (msg.id == null) continue;
            const fn = COMMANDS[msg.cmd];
            if (msg.cmd === "auth") { wsSend(sock, { id: msg.id, ok: true }); continue; }
            if (!fn) { wsSend(sock, { id: msg.id, ok: false, err: `demo hub: ${msg.cmd} not simulated` }); continue; }
            try { wsSend(sock, { id: msg.id, ok: true, data: fn(msg.args || {}, push) }); }
            catch (e) { wsSend(sock, { id: msg.id, ok: false, err: e.message }); }
        }
    });
    sock.on("error", () => {});
    const tick = setInterval(() => push("status.tick", { uptime: now() - BOOT, cpu_c0: 2 + (now() % 4) }), 5000);
    sock.on("close", () => clearInterval(tick));
}

// ── HTTP: the REST calls the UI makes, then static dist/ ───────────────────
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    const authMode = process.env.DEMO_AUTH;   // undefined | "setup" | "closed"
    const setupLeft = authMode === "setup" ? Math.max(0, 600 - (now() - STARTED)) : 0;
    if (url.pathname === "/api/status") return json(200, { ...status(), wifi_mode: "eth",
        auth_enabled: !!authMode, auth_setup_required: authMode === "setup" || authMode === "closed", auth_setup_secs_left: setupLeft,
        ...(authMode === "storage" ? { auth_storage_error: true } : {}) });
    if (url.pathname === "/api/auth/setup" && req.method === "POST") {
        if (!authMode) return json(403, { error: "already_set" });
        if (setupLeft === 0) return json(403, { error: "setup_closed" });
        return json(200, { ok: true, token: "0123456789abcdef0123456789abcdef" });
    }
    if (url.pathname === "/api/devices") return json(200, DEVICES.map(row));
    if (url.pathname.startsWith("/api/scripts/") && req.method === "POST") {
        let body = ""; for await (const c of req) body += c;
        SCRIPTS[decodeURIComponent(url.pathname.slice(13))] = body;
        return json(200, { ok: true });
    }
    if (url.pathname.startsWith("/api/")) return json(501, { error: "not simulated by the demo hub" });
    const rel = normalize(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
    if (rel.startsWith("..")) { res.writeHead(400); return res.end(); }
    for (const file of [join(DIST, rel), join(DIST, "index.html")]) {
        try {
            const data = await readFile(file);
            res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
            return res.end(data);
        } catch { /* try the SPA fallback */ }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("dist/ not found - run `npm run build` first, or use `npm run dev` for the UI\n");
});
server.on("upgrade", onUpgrade);
server.listen(PORT, () => console.log(`demo hub (${DUAL ? "dual-chip" : "wired"}) on http://localhost:${PORT}  (${DEVICES.length} devices, auth off)`));
