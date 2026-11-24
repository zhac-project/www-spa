// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// The Safety page as data (spec 2026-11-24 safety profiles). The hub owns the profiles: their states, delays,
// outputs and the checks on the config. This is presentation only: the words for a state, the countdown of
// the hub's `left`, which devices a picker offers and what a new row or profile starts as, and the text of
// the rules the shortcuts create (the hub's rule parser stays the judge of that text).

export const ALARM_IEEE = "0x025A484143414C00";   // the hub's own Alarm device (model ZHAC-ALARM)
export const STATES = ["disarmed", "arming", "armed", "pending", "triggered"];
export const CLASSES = ["intrusion", "fire", "water", "gas", "other"];
export const ROLES = ["", "away", "home", "night"];
export const WD_MODES = ["burglar", "fire", "emergency", "police_panic", "fire_panic", "emergency_panic"];
export const WD_LEVELS = ["low", "medium", "high", "very_high"];

const ACCESS_SET = 2;
const LABEL = { disarmed: "Disarmed", arming: "Arming", armed: "Armed", pending: "Entry delay", triggered: "Triggered" };
const KIND = { arming: "warn", armed: "ok", pending: "warn", triggered: "err" };
const COUNTDOWN = { arming: "Armed in", pending: "Alarm in", triggered: "Alarm stops in" };
const CLASS_LABEL = { intrusion: "Intrusion", fire: "Fire", water: "Water", gas: "Gas", other: "Other" };

export const stateLabel = (state) => LABEL[state] || state;   // a state this page does not know shows as the hub names it
export const stateKind = (state) => KIND[state] || "off";   // a Badge kind; "off" = neutral
export const countdownLabel = (state) => COUNTDOWN[state] || "";
export const classLabel = (cls) => CLASS_LABEL[cls] || cls;
// `left` was the hub's count at `at` (ms); whole seconds since then come off it.
export const leftNow = (left, at, now) => Math.max(0, left - Math.floor(Math.max(0, now - at) / 1000));
export const fmtLeft = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const named = (exposes, name) => (exposes || []).find((e) => e && e.name === name);
const canSet = (e) => !!e && (e.access & ACCESS_SET) !== 0;
export const settable = (exposes) => (exposes || []).filter((e) => e && e.name && canSet(e));

const SENSOR_KEYS = {   // what each class guards with; "other" takes any sensor
    intrusion: ["contact", "occupancy", "presence", "vibration"], fire: ["smoke"], water: ["water_leak"],
    gas: ["gas", "carbon_monoxide"] };
const ALL_SENSOR_KEYS = Object.values(SENSOR_KEYS).flat();
export const isSensor = (exposes) => ALL_SENSOR_KEYS.some((k) => named(exposes, k));
// Orders the picker only: any sensor can go into any profile.
export const suits = (cls, exposes) => (SENSOR_KEYS[cls] || ALL_SENSOR_KEYS).some((k) => named(exposes, k));

// IAS WD `warning` first (such a siren also reports a read-only `alarm`), then a Tuya siren's binary
// `alarm`, then any switch. "" when the device has nothing to switch on.
export function outputKind(exposes) {
    if (canSet(named(exposes, "warning"))) return "warning";
    const a = named(exposes, "alarm");
    if (canSet(a) && a.type === "binary") return "alarm";
    return canSet(named(exposes, "state")) ? "state" : "";
}
const WD_MODE_OF = { fire: "fire", intrusion: "burglar" };
export const newOutput = (ieee, kind, cls) =>
    kind === "warning" ? { ieee, kind, mode: WD_MODE_OF[cls] || "emergency", level: "high", strobe: true }
    : kind === "state" ? { ieee, kind, value: "on", keep: false } : { ieee, kind };
// A switch that goes off ticks `keep` (it stays off after the alarm ends); on clears it.
export const withValue = (output, value) => ({ ...output, value, keep: value === "off" });

// An id for a new profile, as the hub takes one: 1-13 of a-z, 0-9, _, starting with a letter, not reserved.
const RESERVED = ["alarm_state", "alarm_sensor", "armed", "disarmed", "arming", "pending", "triggered"];
const ID_MAX = 13;
export function proposeId(name, profiles = []) {
    let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (base && !/^[a-z]/.test(base)) base = `p_${base}`;
    base = base.slice(0, ID_MAX) || "profile";
    const free = (id) => !RESERVED.includes(id) && !profiles.some((p) => p.id === id);
    let id = base;
    for (let n = 2; !free(id); n++) id = `${base.slice(0, ID_MAX - String(n).length)}${n}`;   // the digits take the last characters
    return id;
}

// What "Add a profile" offers. `role` is for intrusion only; the three modes are offered while their role is free.
const template = (key, label, cls, extra) => ({ key, label, profile: {
    name: label, class: cls, arm_delay: 0, trigger_delay: 0, siren_time: 180, notify_arm: false, ...extra } });
export const TEMPLATES = [
    template("away", "Away", "intrusion", { role: "away", arm_delay: 30, trigger_delay: 30 }),
    template("home", "Home", "intrusion", { role: "home", trigger_delay: 30 }),
    template("night", "Night", "intrusion", { role: "night", trigger_delay: 30 }),
    template("vacation", "Vacation", "intrusion", { role: "", arm_delay: 30, trigger_delay: 30 }),
    template("flood", "Flood", "water", { notify_arm: true }),
    template("fire", "Fire and smoke", "fire", { notify_arm: true }),
    template("gas", "Gas and CO", "gas", { notify_arm: true }),
    template("custom", "Empty profile", "other", { name: "Custom" }),
];
export function templatesFor(cfg) {
    const taken = (cfg.profiles || []).map((p) => p.role).filter(Boolean);
    return TEMPLATES.filter((t) => !taken.includes(t.profile.role));
}
export const newProfile = (t, cfg) => ({ ...t.profile, id: proposeId(t.key, cfg.profiles), sensors: [], outputs: [] });

// Save is off while a profile is arming, pending or triggered; a disarmed hazard profile guards nothing.
const ACTIVE = ["arming", "pending", "triggered"];
export const running = (st) => (st?.profiles || []).some((p) => ACTIVE.includes(p.state));
export const notGuarding = (profile, st) =>
    profile.class !== "intrusion" && (st?.profiles || []).some((p) => p.id === profile.id && p.state === "disarmed");

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

export function reactionRule({ alarm, profile, state, device, key, value }) {
    if (![alarm, profile, state, device, key, value].every(word)) return null;
    return { name: `Alarm ${profile} ${state}`, dsl: `ON ${alarm}#${profile}="${state}" DO zigbee.set ${device} ${key} ${value} ENDON` };
}

// A button arms or disarms one profile; with no profile it disarms them all (alarm_state).
export function buttonRule({ button, action, alarm, profile, target }) {
    const all = profile === "";
    if (![button, action, alarm].every(word) || !(all ? target === "disarmed" : word(profile) && (target === "armed" || target === "disarmed")))
        return null;
    return { name: `Button ${target === "armed" ? "arms" : "disarms"}${all ? "" : ` ${profile}`}`,
             dsl: `ON ${button}#action="${action}" DO zigbee.set ${alarm} ${all ? "alarm_state" : profile} ${target} ENDON` };
}
