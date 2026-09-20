// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Beginner recipes: a rule the owner assembles from pickers (which sensor,
// which light, how long) instead of editing DSL. Everything here is pure:
// it turns picked values into the same `ON … DO … ENDON` text the DSL tab
// takes, and the hub's parser stays the only authority on what is valid.
//
// Devices are referenced by IEEE address, not by name: the DSL takes either
// (RULES_DSL.md), an address survives a rename, and action refs cannot hold
// spaces while names can. The Rules page shows names in place of addresses.

// Access bits as exposes report them (z2m convention).
const ACCESS_SET = 2;

// Does this device suit a picker? `expose` must be present; `writable` adds
// "and the hub can set it".
export function deviceFits(field, device) {
    const ex = (device && device.exposes) || [];
    const e = ex.find(x => x && x.name === field.expose);
    if (!e) return false;
    return field.writable ? (e.access & ACCESS_SET) !== 0 : true;
}

const dev = (key, label, expose, writable = false) => ({ key, label, kind: "device", expose, writable });

export const RECIPES = [
    {
        id: "motion_light",
        title: "Light on with motion, off a few minutes later",
        fields: [dev("sensor", "Motion sensor", "occupancy"), dev("light", "Light or plug", "state", true),
                 { key: "minutes", label: "Off after (minutes)", kind: "minutes", def: 5, min: 1, max: 120 }],
        rules: (v, ctx) => [
            { name: ctx.name,
              dsl: `ON ${v.sensor}#occupancy=1 DO zigbee.set ${v.light} state 1 ; timer ${ctx.timer} ${v.minutes * 60000} ENDON` },
            { name: `${ctx.name} (off timer)`,
              dsl: `ON Rules#Timer=${ctx.timer} DO zigbee.set ${v.light} state 0 ENDON` },
        ],
        describe: (v, n) => `When ${n(v.sensor)} sees motion, turn ${n(v.light)} on, and turn it off ${v.minutes} minute${v.minutes == 1 ? "" : "s"} after that.`,
        test: v => ({ ieee: v.light, key: "state", value: true }),
    },
    {
        id: "motion_follow",
        title: "Light follows motion (on while there is motion)",
        fields: [dev("sensor", "Motion sensor", "occupancy"), dev("light", "Light or plug", "state", true)],
        rules: (v, ctx) => [{ name: ctx.name, dsl: `ON ${v.sensor}#occupancy DO zigbee.set ${v.light} state %value% ENDON` }],
        describe: (v, n) => `${n(v.light)} is on while ${n(v.sensor)} sees motion and goes off when the sensor stops seeing it (that delay is the sensor's own, usually a minute or two).`,
        test: v => ({ ieee: v.light, key: "state", value: true }),
    },
    {
        id: "button_toggle",
        title: "Button toggles a light",
        fields: [dev("button", "Button or switch", "action"), dev("light", "Light or plug", "state", true)],
        rules: (v, ctx) => [{ name: ctx.name, dsl: `ON ${v.button}#action="single" DO zigbee.toggle ${v.light} state ENDON` }],
        describe: (v, n) => `Each single press of ${n(v.button)} turns ${n(v.light)} on if it is off, and off if it is on.`,
        test: v => ({ ieee: v.light, key: "state", value: true }),
    },
    {
        id: "door_light",
        title: "Light on when a door opens",
        fields: [dev("door", "Door or window sensor", "contact"), dev("light", "Light or plug", "state", true)],
        rules: (v, ctx) => [{ name: ctx.name, dsl: `ON ${v.door}#contact=0 DO zigbee.set ${v.light} state 1 ENDON` }],
        describe: (v, n) => `When ${n(v.door)} opens, turn ${n(v.light)} on.`,
        test: v => ({ ieee: v.light, key: "state", value: true }),
    },
    {
        id: "scheduled_off",
        title: "Switch something off at the same time every day",
        fields: [dev("light", "Light or plug", "state", true), { key: "time", label: "At", kind: "time", def: "22:30" }],
        rules: (v, ctx) => {
            const [h, m] = v.time.split(":").map(Number);
            return [{ name: ctx.name, dsl: `ON Time#Cron=0 ${m} ${h} * * * DO zigbee.set ${v.light} state 0 ENDON` }];
        },
        describe: (v, n) => `Every day at ${v.time}, turn ${n(v.light)} off. Needs the hub's clock (Settings → Time).`,
        test: v => ({ ieee: v.light, key: "state", value: false }),
    },
    {
        id: "leak_valve",
        title: "Water leak: close the valve and raise an alert",
        fields: [dev("sensor", "Leak sensor", "water_leak"), dev("valve", "Valve or pump plug", "state", true)],
        rules: (v, ctx) => [{ name: ctx.name, dsl: `ON ${v.sensor}#water_leak=1 DO zigbee.set ${v.valve} state 0 ; publish home/alert water_leak ENDON` }],
        describe: (v, n) => `When ${n(v.sensor)} reports water, switch ${n(v.valve)} off and publish "water_leak" on MQTT topic home/alert.`,
        test: v => ({ ieee: v.valve, key: "state", value: false }),
    },
];

// Every field filled? Returns the first missing field's label, or "".
export function missingField(recipe, values) {
    for (const f of recipe.fields) {
        const v = values[f.key];
        if (f.kind === "device" && !v) return f.label;
        if (f.kind === "minutes" && !(Number(v) >= (f.min || 1))) return f.label;
        if (f.kind === "time" && !/^\d{1,2}:\d{2}$/.test(String(v || ""))) return f.label;
    }
    return "";
}

// The rules a recipe produces. `ctx.name` is the rule name the owner typed;
// `ctx.timer` the timer index for recipes that need one.
export function buildRules(recipe, values, ctx) {
    const v = { ...values, minutes: Number(values.minutes) };
    return recipe.rules(v, ctx);
}

export function describe(recipe, values, nameOf = r => r) {
    return recipe.describe({ ...values, minutes: Number(values.minutes) }, nameOf);
}

// Timer indexes 1–8 are shared by every rule on the hub; pick one no
// existing rule sets or listens for. 0 when all eight are taken.
export function freeTimerIndex(existingDsls) {
    const used = new Set();
    for (const dsl of existingDsls || []) {
        for (const m of String(dsl).matchAll(/\btimer\s+(\d+)\b/gi)) used.add(Number(m[1]));
        for (const m of String(dsl).matchAll(/Rules#Timer=(\d+)/gi)) used.add(Number(m[1]));
    }
    for (let i = 1; i <= 8; i++) if (!used.has(i)) return i;
    return 0;
}

const SYSTEM_TRIGGERS = new Set(["time", "system", "event", "rules", "mqtt"]);

// Device references a rule text mentions: the trigger's `<ref>#attr` (unless
// it is a system trigger) and every `zigbee.set|toggle <ref>`. Refs are names
// or IEEE addresses, as written.
export function referencedRefs(dsl) {
    const refs = [];
    const s = String(dsl || "");
    const trig = /\bON\s+(.+?)#/.exec(s);
    if (trig) {
        const ref = trig[1].trim();
        if (!SYSTEM_TRIGGERS.has(ref.toLowerCase())) refs.push(ref);
    }
    for (const m of s.matchAll(/\bzigbee\.(?:set|toggle)\s+(\S+)/g)) refs.push(m[1]);
    return [...new Set(refs)];
}

// Which of a rule's device refs match no device the hub knows. `devices` are
// rows with `ieee` and `name`; matching ignores case.
export function unknownRefs(dsl, devices) {
    const known = new Set();
    for (const d of devices || []) {
        if (d.ieee) known.add(String(d.ieee).toLowerCase());
        if (d.name) known.add(String(d.name).toLowerCase());
    }
    return referencedRefs(dsl).filter(r => !known.has(r.toLowerCase()));
}

// The rule text with IEEE addresses replaced by device names, for display.
export function humanize(dsl, devices) {
    let s = String(dsl || "");
    for (const d of devices || []) {
        if (d.ieee && d.name) s = s.split(d.ieee).join(d.name);
    }
    return s;
}
