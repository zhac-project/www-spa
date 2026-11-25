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
//   DEMO_DOOR_OPEN=1 npm run demo      # Safety: the front door is open, so a profile with it arms only when forced
//   DEMO_ALARM_TRIP=1 npm run demo     # Safety: 5 s after an arm a sensor of that profile goes off (trigger delay, alarm)
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
import { RESERVED } from "../src/alarm.js";   // the ids the hub refuses (alarm_core.cpp kReserved)

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
    // A colour light: the States tab shows the light card (power, brightness, Colour/White, picker, kelvin).
    { ieee: "0xa4c13853daa18635", nwk: 0x4C3D, name: "living_room_strip", vendor: "Tuya", model: "TS0505B",
      manufacturer: "_TZ3210_r5afgmkl", model_id: "TS0505B", power_source: "Mains (single phase)", lqi: 148, battery: 0, seen: 20,
      exposes: [
          { name: "state", type: "binary", access: 3 },
          { name: "brightness", type: "numeric", access: 3, value_min: 0, value_max: 254 },
          { name: "color_temp", type: "numeric", access: 3, unit: "mired", value_min: 153, value_max: 500 },
          { name: "color_x", type: "numeric", access: 3 }, { name: "color_y", type: "numeric", access: 3 },
          { name: "color_mode", type: "enum", access: 1, values: ["hs", "xy", "color_temp"] },
          { name: "color_hex", type: "color", access: 3 },
          { name: "do_not_disturb", type: "binary", access: 2, category: "config" },
          { name: "color_power_on_behavior", type: "enum", access: 3, values: ["initial", "previous", "customized"], category: "config" },
      ],
      attrs: { state: 1, brightness: 183, color_temp: 333, color_x: 0.56, color_y: 0.39, color_mode: "xy",
               color_hex: "#ff8a3d", color_power_on_behavior: "previous", linkquality: 148 } },
    { ieee: "0xA4C138F3E2D10B77", nwk: 0x8E42, name: "kitchen_plug", vendor: "Tuya", model: "TS011F_plug_1",
      manufacturer: "_TZ3000_cehuw1lw", model_id: "TS011F", power_source: "Mains (single phase)", lqi: 176, battery: 0, seen: 8,
      exposes: [{ name: "state", type: "binary", access: 3 }, num("power", "W"), num("energy", "kWh"), num("voltage", "V"), num("current", "A"),
                { name: "power_outage_memory", type: "enum", access: 3, category: "config", values: ["on", "off", "restore"] }],
      attrs: { state: 1, power: 61.4, energy: 12.87, voltage: 231.2, current: 0.31, power_outage_memory: "restore" } },
    { ieee: "0xA4C1386F0D3E2A19", nwk: 0x5B90, name: "front_door", vendor: "Tuya", model: "TS0203",
      manufacturer: "HOBEIAN", model_id: "ZG-102ZM", power_source: "Battery", lqi: 96, battery: 100, seen: 1800,
      exposes: [{ name: "contact", type: "binary", access: 1 }, { name: "tamper", type: "binary", access: 1 }, { name: "battery_low", type: "binary", access: 1, category: "diagnostic" }],
      attrs: { contact: process.env.DEMO_DOOR_OPEN ? 0 : 1, tamper: 0, battery_low: 0 } },
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
    // A Tuya siren (Safety: signal `alarm`, melody and volume) and a button (Safety: arm with a button).
    { ieee: "0xA4C1381C5D7E9F20", nwk: 0x3B55, name: "hall_siren", vendor: "NEO", model: "NAS-AB02B0",
      manufacturer: "_TZE200_d0yu2xgi", model_id: "TS0601", power_source: "Mains (single phase)", lqi: 164, battery: 0, seen: 25,
      exposes: [{ name: "alarm", type: "binary", access: 3 },
                { name: "melody", type: "enum", access: 3, values: Array.from({ length: 18 }, (_, i) => String(i + 1)) },
                { name: "volume", type: "enum", access: 3, values: ["low", "medium", "high"] },
                { name: "duration", type: "numeric", access: 3, unit: "s", value_min: 0, value_max: 1800 }],
      attrs: { alarm: 0, melody: "5", volume: "high", duration: 60 } },
    { ieee: "0x00158D00083F2A61", nwk: 0x6F02, name: "hall_button", vendor: "Aqara", model: "WXKG11LM",
      manufacturer: "LUMI", model_id: "lumi.sensor_switch.aq2", power_source: "Battery", lqi: 118, battery: 91, seen: 3600,
      exposes: [{ name: "action", type: "enum", access: 1, values: ["single", "double", "triple", "quadruple", "hold", "release"] },
                diag("battery", "%")],
      attrs: { battery: 91 } },
    // Hazard sensors (Safety: the Flood and Fire profiles).
    { ieee: "0x00158D0006B7C8D9", nwk: 0x4E21, name: "kitchen_leak", vendor: "Aqara", model: "SJCGQ11LM",
      manufacturer: "LUMI", model_id: "lumi.sensor_wleak.aq1", power_source: "Battery", lqi: 132, battery: 95, seen: 900,
      exposes: [{ name: "water_leak", type: "binary", access: 1 }, { name: "battery_low", type: "binary", access: 1, category: "diagnostic" },
                diag("battery", "%")],
      attrs: { water_leak: 0, battery_low: 0, battery: 95 } },
    { ieee: "0x00158D0008D1E2F3", nwk: 0x5C34, name: "hall_smoke", vendor: "Aqara", model: "JTYJ-GD-01LM/BW",
      manufacturer: "LUMI", model_id: "lumi.sensor_smoke", power_source: "Battery", lqi: 110, battery: 100, seen: 1200,
      exposes: [{ name: "smoke", type: "binary", access: 1 }, { name: "battery_low", type: "binary", access: 1, category: "diagnostic" },
                diag("battery", "%")],
      attrs: { smoke: 0, battery_low: 0, battery: 100 } },
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
// The hub's own Alarm device (alarm.cpp): always there, PROTO_LOCAL, so the rows say `local`. Its exposes and
// attributes follow the profiles (syncAlarmDevice).
const ALARM_IEEE = "0x025A484143414C00";
DEVICES.push({ ieee: ALARM_IEEE, nwk: 0xFFFE, name: "Alarm", vendor: "ZHAC", model: "ZHAC-ALARM", manufacturer: "ZHAC",
    model_id: "ZHAC-ALARM", power_source: "Mains (single phase)", lqi: 0, battery: 0, seen: 30, local: true,
    exposes: [], attrs: {} });
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
        timezone: demoTz,   // the firmware formats local_time in it; the demo just uses this machine's clock
        ...(demoClockSet ? { local_time: new Date().toLocaleString("sv-SE").slice(0, 16) } : {}),
        metrics_mqtt_enabled: demoMetricsMqtt, metrics_mqtt_interval_s: demoMetricsSecs,
        ...(process.env.DEMO_NTP_DHCP && demoNtpServer === "pool.ntp.org" ? { ntp_dhcp_server: "192.168.1.1" } : {}),
        ota: true, fw: "v2026091801",
        ...(process.env.DEMO_STORAGE_ERROR ? { storage_error: true } : {}),
        ota_state: process.env.DEMO_OTA_PENDING ? "pending" : "verified",
        ...(process.env.DEMO_OTA_ROLLBACK ? { ota_rollback_reason: "Zigbee radio not ready (it was before the update)" } : {}),
        auth_enabled: false,
        metrics_enabled: demoMetrics, ap_disabled: true, log_mqtt_enabled: false, log_ws_enabled: true,
        mqtt_broker: "mqtt://192.168.1.10", mqtt_client_id: "", ha_discovery: true, ha_prefix: "homeassistant",
    };
}
const row = (d) => ({ ieee: d.ieee, nwk: d.nwk, friendly: d.name, name: d.name, model: d.model, model_id: d.model_id, known: !!d.model,
    manufacturer: d.manufacturer, vendor: d.vendor, last_seen: now() - d.seen, lqi: d.lqi,
    battery: d.battery, ep_count: 1, ...(d.local ? { local: true } : {}) });
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
let demoTz = "";
let demoMetrics = false, demoMetricsMqtt = false, demoMetricsSecs = 60;

// ── Safety (alarm.cpp / alarm_core.cpp): one state machine per profile ────
const CLIENTS = new Set();   // each open page's push(), for alarm.changed
const broadcast = (event, data) => { for (const push of CLIENTS) push(event, data); };
const ALARM_STATES = ["disarmed", "arming", "armed", "pending", "triggered"];
const SOUNDING = ["pending", "triggered"];
const named = (name, row) => DEVICES.filter((d) => d.name === name).map((d) => ({ ieee: d.ieee, ...row }));
const profile = (id, name, cls, extra, sensors) => ({ id, name, class: cls, ...(cls === "intrusion" ? { role: "" } : {}),
    arm_delay: 0, trigger_delay: 0, siren_time: 30, notify_arm: false, ...extra, sensors,
    outputs: named("hall_siren", { kind: "alarm", melody: "5", volume: "high" }) });
const door = named("front_door", { entry: true });
const ALARM_CFG = {   // alarm.get's config shape, with the codes the hub never sends
    profiles: [
        profile("away", "Away", "intrusion", { role: "away", arm_delay: 10, trigger_delay: 10 },
                [...door, ...named("hallway_motion", { entry: false })]),
        profile("home", "Home", "intrusion", { role: "home", trigger_delay: 10 }, door),
        profile("night", "Night", "intrusion", { role: "night", trigger_delay: 10 }, door),
        profile("flood", "Flood", "water", { notify_arm: true }, named("kitchen_leak", { entry: false })),
        profile("fire", "Fire", "fire", { notify_arm: true }, named("hall_smoke", { entry: false })),
    ],
    keypads: [], codes: ["1234"],
};
const ALARM = new Map();   // profile id -> its state, countdown, cause, bypassed sensors and timer
const pstate = (id) => {
    if (!ALARM.has(id)) ALARM.set(id, { state: "disarmed", since: now(), until: 0, cause: "", bypassed: [], timer: null });
    return ALARM.get(id);
};
const profileOf = (id) => {
    const p = ALARM_CFG.profiles.find((x) => x.id === id);
    if (!p) throw new Error("no such profile");
    return p;
};
function alarmStatus() {   // alarm_status_json: left only while counting, cause/sensor only for pending/triggered
    const profiles = ALARM_CFG.profiles.map((p) => {
        const a = pstate(p.id);
        const s = { id: p.id, name: p.name, class: p.class, state: a.state, since: demoClockSet ? a.since : 0 };
        if (a.state !== "disarmed" && a.state !== "armed") s.left = Math.max(0, a.until - now());
        if (a.cause) Object.assign(s, { cause: a.cause, sensor: find(a.cause)?.name || a.cause });
        return { ...s, bypassed: a.bypassed };
    });
    // The summary is the first intrusion profile that is not disarmed (alarm_summary_name).
    const top = profiles.find((s) => s.class === "intrusion" && s.state !== "disarmed");
    return { state: !top ? "disarmed" : top.state === "armed" ? `armed_${top.id}` : top.state,
             ...(top?.sensor ? { sensor: top.sensor } : {}), profiles };
}
function syncAlarmDevice(s) {   // alarm.cpp local_exposes, and the attributes it publishes
    const d = find(ALARM_IEEE);
    d.exposes = [...s.profiles.map((p) => ({ name: p.id, type: "enum", access: 7, values: ALARM_STATES })),
        { name: "alarm_state", type: "enum", access: 7, values: ["disarmed", "arming",
            ...s.profiles.filter((p) => p.class === "intrusion").map((p) => `armed_${p.id}`), "pending", "triggered"] },
        { name: "alarm_sensor", type: "text", access: 1 }];
    d.attrs = { ...Object.fromEntries(s.profiles.map((p) => [p.id, p.state])), alarm_state: s.state, alarm_sensor: s.sensor || "" };
}
function alarmChanged() {
    const s = alarmStatus();
    syncAlarmDevice(s);
    broadcast("alarm.changed", s);
}
// A profile's change: its new state, its countdown and what follows it.
function go(id, state, secs = 0, then = null, cause = "") {
    const a = pstate(id);
    clearTimeout(a.timer);
    Object.assign(a, { state, cause, since: now(), until: now() + secs, timer: then ? setTimeout(then, secs * 1000) : null });
    if (state === "disarmed") a.bypassed = [];
    alarmChanged();
}
function armed(id) {
    go(id, "armed");
    if (process.env.DEMO_ALARM_TRIP) pstate(id).timer = setTimeout(() => trip(id), 5000);
}
function trip(id) {   // a sensor of the profile goes off: a delayed one first, it shows the trigger delay
    const p = profileOf(id), a = pstate(id);
    const guards = (p.sensors || []).filter((x) => !a.bypassed.includes(x.ieee));
    const s = guards.find((x) => x.entry) || guards[0];
    if (!s) return;
    const alarm = () => go(id, "triggered", p.siren_time, () => go(id, "armed"), s.ieee);
    if (s.entry && p.trigger_delay) go(id, "pending", p.trigger_delay, alarm, s.ieee);
    else alarm();
}
function alarmArm(id, force) {
    const p = profileOf(id), a = pstate(id);
    if (a.state === "armed" || a.state === "arming") return { armed: true };
    const sounding = (x) => SOUNDING.includes(pstate(x.id).state);
    if (sounding(p) || (p.class === "intrusion" && ALARM_CFG.profiles.some((x) => x.class === "intrusion" && sounding(x))))
        throw new Error("an alarm is on: disarm first");
    // Only open contacts block, and only without force; forced, they are left unguarded until disarm.
    const open = (p.sensors || []).filter((s) => find(s.ieee)?.attrs.contact === 0).map((s) => s.ieee);
    if (open.length && !force) return { armed: false, open: open.map((ieee) => (find(ieee)?.name ? { ieee, name: find(ieee).name } : { ieee })) };
    if (p.class === "intrusion") {   // intrusion profiles replace each other
        for (const x of ALARM_CFG.profiles) if (x !== p && x.class === "intrusion" && pstate(x.id).state !== "disarmed") go(x.id, "disarmed");
    }
    a.bypassed = open;
    if (p.arm_delay) go(id, "arming", p.arm_delay, () => armed(id));
    else armed(id);
    return { armed: true };
}
pstate("flood").state = "armed";   // the hazard profile guards; Fire shows "Not guarding"
syncAlarmDevice(alarmStatus());

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
        if (typeof a.timezone === "string") demoTz = a.timezone;
        if (typeof a.metrics_enabled === "boolean") demoMetrics = a.metrics_enabled;
        if (typeof a.metrics_mqtt_enabled === "boolean") demoMetricsMqtt = a.metrics_mqtt_enabled;
        if (Number.isInteger(a.metrics_mqtt_interval_s)) demoMetricsSecs = Math.min(60, Math.max(1, a.metrics_mqtt_interval_s));
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
    "alarm.get": () => {
        const { codes, ...config } = ALARM_CFG;
        return { ...alarmStatus(), config: { ...config, codes_count: codes.length } };
    },
    "alarm.arm": (a) => alarmArm(a.id || a.mode, !!a.force),   // stage 1's `mode` is read as the id
    // No id: every intrusion profile is disarmed and every other one that sounds is silenced.
    "alarm.disarm": (a) => {
        for (const p of a.id ? [profileOf(a.id)] : ALARM_CFG.profiles) {
            const s = pstate(p.id).state;
            if (a.id || p.class === "intrusion") { if (s !== "disarmed") go(p.id, "disarmed"); }
            else if (SOUNDING.includes(s)) go(p.id, "armed");
        }
        return {};
    },
    "alarm.silence": (a) => {   // pending or triggered ends now: back to armed
        profileOf(a.id);
        if (SOUNDING.includes(pstate(a.id).state)) go(a.id, "armed");
        return {};
    },
    // The whole config, kept as it comes; left-out codes keep the stored ones. Refused while an alarm runs, as the
    // hub refuses it (alarm.cpp alarm_config_set), which also arms a new profile that is not intrusion. Of the
    // hub's checks on the config only the id's are here: its form, a reserved one and a taken one, in the hub's
    // words (alarm_core.cpp alarm_cfg_from_json).
    "alarm.config.set": (a) => {
        const c = a.config;
        if (!c || typeof c !== "object") throw new Error("missing config");
        if (ALARM_CFG.profiles.some((p) => ["arming", ...SOUNDING].includes(pstate(p.id).state)))
            throw new Error("an alarm is running: disarm or wait, then save");
        (c.profiles || []).forEach((p, i, all) => {
            if (typeof p.id !== "string" || !/^[a-z][a-z0-9_]{0,12}$/.test(p.id)) throw new Error(`profiles[${i}]: id must be 1-13 of a-z, 0-9 and _, starting with a letter`);
            if (RESERVED.includes(p.id)) throw new Error(`profiles[${i}]: id ${p.id} is reserved`);
            if (all.findIndex((x) => x.id === p.id) < i) throw new Error(`profiles[${i}]: id ${p.id} is taken`);
        });
        const was = ALARM_CFG.profiles.map((p) => p.id);
        const { codes, codes_count: _n, ...rest } = c;
        Object.assign(ALARM_CFG, { profiles: [], keypads: [] }, rest, codes ? { codes } : {});
        for (const id of was) {
            if (!ALARM_CFG.profiles.some((p) => p.id === id)) { clearTimeout(pstate(id).timer); ALARM.delete(id); }
        }
        for (const p of ALARM_CFG.profiles) if (!was.includes(p.id) && p.class !== "intrusion") alarmArm(p.id, false);
        alarmChanged();
        return {};
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
    CLIENTS.add(push);
    sock.on("close", () => { clearInterval(tick); CLIENTS.delete(push); });
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
