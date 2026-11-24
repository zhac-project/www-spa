// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// The Security page as data (spec 2026-11-24 security mode, stage 1). The hub owns the alarm panel: its
// states, delays, sirens and the checks on its config. This is presentation only: the words for a state,
// the countdown of the hub's `left`, which devices a picker offers and what a new row starts as, and the
// text of the rules the shortcuts create (the hub's rule parser stays the judge of that text).

export const ALARM_IEEE = "0x025A484143414C00";   // the hub's own Alarm device (model ZHAC-ALARM)
export const MODES = ["away", "home", "night"];
export const STATES = ["disarmed", "arming", "armed_away", "armed_home", "armed_night", "pending", "triggered"];
export const SETTABLE = ["armed_away", "armed_home", "armed_night", "disarmed"];   // what alarm_state takes
export const WD_MODES = ["burglar", "fire", "emergency", "police_panic", "fire_panic", "emergency_panic"];
export const WD_LEVELS = ["low", "medium", "high", "very_high"];

const ACCESS_SET = 2;
const LABEL = { disarmed: "Disarmed", arming: "Arming", armed_away: "Armed away", armed_home: "Armed home",
                armed_night: "Armed night", pending: "Entry delay", triggered: "Triggered" };
const KIND = { arming: "warn", armed_away: "ok", armed_home: "ok", armed_night: "ok", pending: "warn", triggered: "err" };
const COUNTDOWN = { arming: "Armed in", pending: "Alarm in", triggered: "Sirens stop in" };

export function stateLabel(st) {
    const s = st && st.state;
    if (!s) return "—";
    const l = LABEL[s] || s;
    return (s === "arming" || s === "pending") && st.mode ? `${l} (${st.mode})` : l;
}
export const stateKind = (state) => KIND[state] || "off";   // a Badge kind; "off" = neutral
export const countdownLabel = (state) => COUNTDOWN[state] || "";
// `left` was the hub's count at `at` (ms); whole seconds since then come off it.
export const leftNow = (left, at, now) => Math.max(0, left - Math.floor(Math.max(0, now - at) / 1000));
export const fmtLeft = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const named = (exposes, name) => (exposes || []).find((e) => e && e.name === name);
const canSet = (e) => !!e && (e.access & ACCESS_SET) !== 0;
export const settable = (exposes) => (exposes || []).filter((e) => e && e.name && canSet(e));

export const isSensor = (exposes) => ["contact", "occupancy", "presence", "vibration"].some((k) => named(exposes, k));
// Away always; home and night too for doors, windows and vibration, not for motion and presence.
export const newSensor = (ieee, exposes) => ({
    ieee, modes: named(exposes, "contact") || named(exposes, "vibration") ? [...MODES] : ["away"], entry: false });

// IAS WD `warning` first (such a siren also reports a read-only `alarm`), then a Tuya siren's binary
// `alarm`, then any switch. "" when the device has nothing to switch on.
export function sirenKind(exposes) {
    if (canSet(named(exposes, "warning"))) return "warning";
    const a = named(exposes, "alarm");
    if (canSet(a) && a.type === "binary") return "alarm";
    return canSet(named(exposes, "state")) ? "state" : "";
}
export const newSiren = (ieee, kind) =>
    kind === "warning" ? { ieee, kind, mode: "burglar", level: "high", strobe: true } : { ieee, kind };

// alarm.config.set: the hub keeps its stored codes when `codes` is left out and clears them on `[]`.
// `codes` null = keep them; a list (empty fields dropped) replaces them.
export function configToSend(cfg, codes) {
    const { codes_count: _count, codes: _codes, ...rest } = cfg;
    return codes ? { ...rest, codes: codes.map((c) => String(c).trim()).filter(Boolean) } : rest;
}

// A device as a rule names it: by name when the parser reads that name back as the device (one word,
// as an action needs; not an address; not a system trigger such as Event#), else by its address.
const SYSTEM = new Set(["System", "Time", "Event", "Rules", "Mqtt", "Offline"]);
export function ruleRef(dev) {
    const name = (dev && (dev.name || dev.friendly)) || "";
    const plain = /^[^\s#;]+$/.test(name) && !/^0x/i.test(name) && !name.includes("ENDON") && !SYSTEM.has(name);
    return plain ? name : dev ? dev.ieee : "";
}

// Values to offer for a key (the field takes any other). Binary keys take 1 / 0 in rules; an IAS WD
// siren's `warning` takes text, mode[,level[,strobe[,duration]]].
export function valueChoices(e) {
    if (!e) return [];
    if (e.name === "warning") return ["burglar,high,1,180", "0"];
    if (e.type === "binary") return ["1", "0"];
    return e.type === "enum" ? (e.values || []).map(String) : [];
}

// One word each: the parser takes a value up to the next space, and `;` starts the next action.
const word = (v) => typeof v === "string" && /^[^\s;"]+$/.test(v);

export function reactionRule({ alarm, state, device, key, value }) {
    if (![alarm, state, device, key, value].every(word)) return null;
    return { name: `Alarm ${state}`, dsl: `ON ${alarm}#alarm_state="${state}" DO zigbee.set ${device} ${key} ${value} ENDON` };
}

const BUTTON_NAME = { armed_away: "Button arms away", armed_home: "Button arms home",
                      armed_night: "Button arms night", disarmed: "Button disarms" };
export function buttonRule({ button, action, alarm, target }) {
    if (![button, action, alarm].every(word) || !BUTTON_NAME[target]) return null;
    return { name: BUTTON_NAME[target], dsl: `ON ${button}#action="${action}" DO zigbee.set ${alarm} alarm_state ${target} ENDON` };
}
