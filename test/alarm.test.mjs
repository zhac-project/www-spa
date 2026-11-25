// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- the Safety page's pure helpers (src/alarm.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_IEEE, stateLabel, stateKind, countdownLabel, classLabel, leftNow, fmtLeft, isSensor, suits, outputKind,
         newOutput, withValue, proposeId, TEMPLATES, templatesFor, newProfile, running, notGuarding, configToSend,
         settable, ruleRef, valueChoices, reactionRule, buttonRule, profilesDiffer, afterGet, STATES } from "../src/alarm.js";

const bin = (name, access = 3) => ({ name, type: "binary", access });

test("state words", () => {
    assert.equal(stateLabel("pending"), "Entry delay");
    assert.equal(stateLabel("armed"), "Armed");
    assert.equal(stateLabel("new_state"), "new_state", "a state this page does not know shows as the hub names it");
    assert.deepEqual(["arming", "armed", "pending", "triggered", "disarmed"].map(stateKind), ["warn", "ok", "warn", "err", "off"]);
    assert.equal(countdownLabel("triggered"), "Alarm stops in");
    assert.equal(classLabel("water"), "Water");
});

test("the countdown runs down from the hub's `left`, whole seconds, and stops at zero", () => {
    assert.equal(leftNow(30, 1000, 1000), 30);
    assert.equal(leftNow(30, 1000, 1999), 30);
    assert.equal(leftNow(30, 1000, 2000), 29);
    assert.equal(leftNow(30, 1000, 1000 + 45_000), 0);
    assert.equal(leftNow(30, 1000, 900), 30, "a clock read before the push came never adds a second");
    assert.equal(fmtLeft(0), "0:00");
    assert.equal(fmtLeft(9), "0:09");
    assert.equal(fmtLeft(65), "1:05");
    assert.equal(fmtLeft(1800), "30:00");
    assert.equal(countdownLabel("arming"), "Armed in");
    assert.equal(countdownLabel("pending"), "Alarm in");
    assert.equal(countdownLabel("triggered"), "Alarm stops in");
    assert.equal(countdownLabel("armed"), "");
});

test("a sensor is a device with one of the eight keys; a class suggests its own", () => {
    assert.ok(isSensor([bin("smoke", 1)]) && isSensor([bin("water_leak", 1)]) && isSensor([bin("carbon_monoxide", 1)]));
    assert.ok(!isSensor([bin("tamper", 1)]) && !isSensor([bin("state")]));
    assert.ok(!isSensor(undefined));
    assert.ok(suits("water", [bin("water_leak", 1)]) && !suits("water", [bin("contact", 1)]));
    assert.ok(suits("gas", [bin("carbon_monoxide", 1)]) && suits("intrusion", [bin("vibration", 1)]) && suits("other", [bin("smoke", 1)]));
    assert.ok(suits("fire", [bin("smoke", 1)]) && !suits("fire", [bin("water_leak", 1)]) && !suits("other", [bin("tamper", 1)]));
});

test("an output's kind is suggested from what the device can be set to", () => {
    // An IAS WD siren also reports a read-only `alarm`: warning comes first.
    assert.equal(outputKind([bin("alarm", 1), bin("warning", 2)]), "warning");
    assert.equal(outputKind([bin("alarm"), { name: "melody", type: "enum", access: 3, values: ["1", "2"] }]), "alarm");
    assert.equal(outputKind([bin("state")]), "state");
    assert.equal(outputKind([bin("alarm", 1), bin("state")]), "state", "a read-only alarm cannot sound");
    assert.equal(outputKind([bin("contact", 1)]), "", "nothing to switch on: not an output");
    assert.equal(outputKind(undefined), "");
});

test("a new output starts as its class needs", () => {
    assert.deepEqual(newOutput("0x1", "warning", "fire"), { ieee: "0x1", kind: "warning", mode: "fire", level: "high", strobe: true });
    assert.equal(newOutput("0x1", "warning", "intrusion").mode, "burglar");
    assert.equal(newOutput("0x1", "warning", "water").mode, "emergency");
    // A switch in a water or gas profile is a valve: closed by the alarm, and it stays closed (review F10).
    assert.deepEqual(newOutput("0x1", "state", "water"), { ieee: "0x1", kind: "state", value: "off", keep: true });
    assert.deepEqual(newOutput("0x1", "state", "gas"), { ieee: "0x1", kind: "state", value: "off", keep: true });
    for (const cls of ["intrusion", "fire", "other"])
        assert.deepEqual(newOutput("0x1", "state", cls), { ieee: "0x1", kind: "state", value: "on", keep: false }, cls);
    assert.deepEqual(withValue({ ieee: "0x1", kind: "state", value: "on", keep: false }, "off"), { ieee: "0x1", kind: "state", value: "off", keep: true });
    assert.equal(withValue({ ieee: "0x1", kind: "state", value: "off", keep: true }, "on").keep, false);
    assert.deepEqual(newOutput("0x1", "alarm", "fire"), { ieee: "0x1", kind: "alarm" });
});

test("a push that lists other profiles than the loaded config asks for the config again", () => {
    const cfg = { profiles: [{ id: "away" }, { id: "flood" }] };
    const st = (...ids) => ({ profiles: ids.map((id) => ({ id, state: "armed" })) });
    assert.equal(profilesDiffer(cfg, st("away", "flood")), false, "the same profiles: only the states change");
    assert.equal(profilesDiffer(cfg, st("away", "flood", "fire")), true, "a profile added elsewhere");
    assert.equal(profilesDiffer(cfg, st("away")), true, "a profile deleted elsewhere");
    assert.equal(profilesDiffer(cfg, st("away", "fire")), true, "one deleted and another added");
    assert.equal(profilesDiffer(cfg, st("flood", "away")), true, "the order changed");
    assert.equal(profilesDiffer({ profiles: [] }, st()), false, "no profiles on either side");
    assert.equal(profilesDiffer(cfg, {}), false, "a push without profiles says nothing about them");
});

test("an id is proposed from the name", () => {
    assert.equal(proposeId("Flood", []), "flood");
    assert.equal(proposeId("Fire and smoke", []), "fire_and_smok");
    assert.equal(proposeId("2nd floor", []), "p_2nd_floor");
    assert.equal(proposeId("Вода", []), "profile");
    assert.equal(proposeId("Flood", [{ id: "flood" }]), "flood2");
    assert.equal(proposeId("Armed", []), "armed2");
    assert.equal(proposeId("Fire and smoke", [{ id: "fire_and_smok" }]), "fire_and_smo2");
    assert.equal(proposeId("  --Hall  light!  ", []), "hall_light");
    assert.equal(proposeId("Flood", [{ id: "flood" }, { id: "flood2" }]), "flood3");
    assert.equal(proposeId("Armed", [{ id: "armed2" }]), "armed3", "a reserved word, then a taken one");
});

test("an id never ends in _ after the 13-character cut", () => {
    assert.equal(proposeId("abcdefghijkl mno", []), "abcdefghijkl", "cut at 13 inside a separator: the _ goes");
    assert.equal(proposeId("abcdefghijkl mno", [{ id: "abcdefghijkl" }]), "abcdefghijkl2");
    for (const name of ["Alarm  state", "x", "ab cdefghijk lm", "a_b_c_d_e_f_g_h"]) assert.doesNotMatch(proposeId(name, []), /_$/, name);
});

test("an id is never one the hub keeps for itself", () => {
    // What the hub refuses as an id (alarm_core.cpp kReserved), each asked for by its own name.
    const reserved = ["alarm_state", "alarm_sensor", "armed", "disarmed", "arming", "pending", "triggered", "pin_code", "action_code", "color_hex"];
    for (const id of reserved) {
        const got = proposeId(id.replace(/_/g, " "), []);
        assert.ok(!reserved.includes(got), `${id} -> ${got}`);
        assert.equal(got, `${id}2`);
    }
});

test("an id is proposed without a name or a profile list", () => {
    assert.equal(proposeId(null, []), "profile");
    assert.equal(proposeId(undefined, []), "profile");
    assert.equal(proposeId("Flood", null), "flood", "a config without a profile list");
    assert.equal(newProfile(TEMPLATES.find((t) => t.key === "flood"), { profiles: null }).id, "flood");
    assert.equal(newProfile(TEMPLATES.find((t) => t.key === "flood"), {}).id, "flood");
});

test("a copy of a template gets a name no profile has", () => {
    const t = (key) => TEMPLATES.find((x) => x.key === key);
    const had = (...names) => ({ profiles: names.map((name, i) => ({ id: `p${i}`, name })) });
    assert.equal(newProfile(t("flood"), had()).name, "Flood");
    assert.equal(newProfile(t("flood"), had("Flood")).name, "Flood 2");
    assert.equal(newProfile(t("flood"), had("Flood", "Flood 2")).name, "Flood 3");
    assert.equal(newProfile(t("flood"), had("Flood 2")).name, "Flood", "the first free one");
    assert.equal(newProfile(t("night"), had("Night")).name, "Night 2");
    assert.equal(newProfile(t("custom"), had("Custom")).name, "Custom 2");
    assert.equal(newProfile(t("flood"), { profiles: null }).name, "Flood");
    assert.equal(newProfile(t("fire"), had("Fire and smoke")).name, "Fire and smoke 2");
    assert.equal(TEMPLATES.find((x) => x.key === "flood").profile.name, "Flood", "the template itself stays as it was");
});

test("templates: the three modes are offered only while their role is free", () => {
    const keys = (cfg) => templatesFor(cfg).map((t) => t.key);
    assert.deepEqual(keys({ profiles: [] }), ["away", "home", "night", "vacation", "flood", "fire", "gas", "custom"]);
    assert.deepEqual(keys({ profiles: [{ id: "x", class: "intrusion", role: "home" }] }), ["away", "night", "vacation", "flood", "fire", "gas", "custom"]);
    assert.equal(newProfile(TEMPLATES.find((t) => t.key === "fire"), { profiles: [] }).id, "fire");
    const flood = newProfile(TEMPLATES.find((t) => t.key === "flood"), { profiles: [{ id: "flood" }] });
    assert.deepEqual(flood, { id: "flood2", name: "Flood", class: "water", arm_delay: 0, trigger_delay: 0, siren_time: 180,
                              notify_arm: true, sensors: [], outputs: [] });
    assert.equal(newProfile(TEMPLATES.find((t) => t.key === "away"), { profiles: [] }).role, "away");
    assert.equal(newProfile(TEMPLATES.find((t) => t.key === "vacation"), { profiles: [] }).role, "");
    assert.deepEqual(TEMPLATES.map((t) => [t.profile.arm_delay, t.profile.trigger_delay, t.profile.notify_arm]),
        [[30, 30, false], [0, 30, false], [0, 30, false], [30, 30, false], [0, 0, true], [0, 0, true], [0, 0, true], [0, 0, false]]);
    assert.equal(TEMPLATES.find((t) => t.key === "custom").profile.name, "Custom");
    const before = structuredClone(TEMPLATES);
    for (const t of TEMPLATES) {
        const p = newProfile(t, { profiles: [] });
        p.name = "x"; p.arm_delay = 99; p.sensors.push("x"); p.outputs.push("x");
    }
    assert.deepEqual(TEMPLATES, before, "a new profile is a copy: changing it leaves the templates as they were");
    for (const t of TEMPLATES)   // what the hub takes as an id
        assert.match(newProfile(t, { profiles: [] }).id, /^[a-z][a-z0-9_]{0,12}$/, t.key);
});

test("Save is off while an alarm runs; a disarmed hazard profile is flagged", () => {
    assert.ok(!running({ profiles: [{ id: "a", state: "armed" }, { id: "b", state: "disarmed" }] }));
    assert.ok(running({ profiles: [{ id: "a", state: "armed" }, { id: "b", state: "arming" }] }));
    assert.ok(running({ profiles: [{ id: "a", state: "pending" }] }) && running({ profiles: [{ id: "a", state: "triggered" }] }));
    assert.ok(notGuarding({ id: "fire", class: "fire" }, { profiles: [{ id: "fire", state: "disarmed" }] }));
    assert.ok(!notGuarding({ id: "away", class: "intrusion" }, { profiles: [{ id: "away", state: "disarmed" }] }));
    assert.ok(!notGuarding({ id: "fire", class: "fire" }, { profiles: [{ id: "fire", state: "armed" }] }));
});

test("codes are write-only: sent only to replace them, and an empty list clears them", () => {
    const cfg = { profiles: [{ id: "away", name: "Away", class: "intrusion", role: "away", arm_delay: 30, trigger_delay: 30, siren_time: 180,
                               notify_arm: false, sensors: [{ ieee: "0x1", entry: true }], outputs: [{ ieee: "0x2", kind: "alarm" }] }],
                  keypads: [{ ieee: "0x3", trusted: false }], codes_count: 2 };
    const kept = configToSend(cfg, null);
    assert.equal("codes" in kept, false, "no `codes`: the hub keeps the stored ones");
    assert.equal("codes_count" in kept, false);
    assert.deepEqual(kept.profiles, cfg.profiles, "the profiles go back as they are");
    assert.deepEqual(kept.keypads, cfg.keypads);
    assert.deepEqual(configToSend(cfg, [" 1234 ", "", "87654321"]).codes, ["1234", "87654321"]);
    assert.deepEqual(configToSend(cfg, []).codes, []);
    assert.deepEqual(configToSend(cfg, [""]).codes, [], "only empty fields: clear");
    assert.equal(cfg.codes_count, 2, "the draft is left as it was");
});

test("a rule names a device by its name when the DSL reads it back as that device, else by its address", () => {
    const ieee = "0x00158D0007A1B2C3";
    assert.equal(ruleRef({ ieee: ALARM_IEEE, name: "Alarm" }), "Alarm");
    assert.equal(ruleRef({ ieee, name: "front_door" }), "front_door");
    assert.equal(ruleRef({ ieee, name: "Вхідні_двері" }), "Вхідні_двері");
    assert.equal(ruleRef({ ieee, name: "front door" }), ieee, "an action's device is one word");
    assert.equal(ruleRef({ ieee, name: "Hub I/O" }), ieee);
    assert.equal(ruleRef({ ieee, name: "0xdoor" }), ieee, "0x… reads as an address");
    assert.equal(ruleRef({ ieee, name: "a;b" }), ieee);
    assert.equal(ruleRef({ ieee, name: "door#1" }), ieee);
    assert.equal(ruleRef({ ieee, name: "Event" }), ieee, "ON Event#… is the named-event trigger");
    assert.equal(ruleRef({ ieee, name: "" }), ieee);
    assert.equal(ruleRef({ ieee, friendly: "hall" }), "hall");
    assert.equal(ruleRef({ ieee: ALARM_IEEE }), ALARM_IEEE, "the Alarm device not listed yet: its address");
});

test("value suggestions come from the key's expose", () => {
    assert.deepEqual(valueChoices({ name: "effect", type: "enum", access: 2, values: ["blink", "colorloop"] }), ["blink", "colorloop"]);
    assert.deepEqual(valueChoices(bin("state")), ["1", "0"]);
    assert.deepEqual(valueChoices(bin("warning", 2)), ["burglar,high,1,180", "0"], "IAS WD: the warning text, and stop");
    assert.deepEqual(valueChoices({ name: "brightness", type: "numeric", access: 3 }), []);
    assert.deepEqual(valueChoices(undefined), []);
    assert.deepEqual(settable([bin("state"), bin("contact", 1), { name: "warning", type: "binary", access: 2 }, null])
                         .map((e) => e.name), ["state", "warning"]);
});

test("shortcuts write rules on a profile", () => {
    assert.deepEqual(reactionRule({ alarm: "Alarm", profile: "flood", state: "triggered", device: "hall_light", key: "state", value: "1" }),
        { name: "Alarm flood triggered", dsl: 'ON Alarm#flood="triggered" DO zigbee.set hall_light state 1 ENDON' });
    assert.deepEqual(buttonRule({ button: "hall_button", action: "single", alarm: "Alarm", profile: "night", target: "armed" }),
        { name: "Button arms night", dsl: 'ON hall_button#action="single" DO zigbee.set Alarm night armed ENDON' });
    assert.deepEqual(buttonRule({ button: "hall_button", action: "double", alarm: "Alarm", profile: "", target: "disarmed" }),
        { name: "Button disarms", dsl: 'ON hall_button#action="double" DO zigbee.set Alarm alarm_state disarmed ENDON' });
    assert.equal(buttonRule({ button: "hall_button", action: "hold", alarm: "Alarm", profile: "fire", target: "disarmed" }).name, "Button disarms fire");
    assert.equal(reactionRule({ alarm: "Alarm", profile: "flood", state: "trig gered", device: "x", key: "state", value: "1" }), null);
    assert.equal(reactionRule({ alarm: ALARM_IEEE, profile: "flood", state: "armed", device: "rgb", key: "effect", value: "police" }).dsl,
                 `ON ${ALARM_IEEE}#flood="armed" DO zigbee.set rgb effect police ENDON`);
    for (const missing of ["profile", "state", "device", "key", "value"]) {
        const f = { alarm: "Alarm", profile: "flood", state: "triggered", device: "lamp", key: "state", value: "1", [missing]: "" };
        assert.equal(reactionRule(f), null, missing);
    }
    assert.equal(reactionRule({ alarm: "Alarm", profile: "flood", state: "triggered", device: "lamp", key: "state", value: "1;log x" }), null,
                 "the hub reads one word: `;` starts the next action");
    const b = { button: "b", action: "x", alarm: "Alarm", profile: "night", target: "armed" };
    assert.equal(buttonRule({ ...b, profile: "", target: "armed" }), null, "arming needs a profile");
    assert.equal(buttonRule({ ...b, target: "triggered" }), null, "the profile refuses it");
    assert.equal(buttonRule({ ...b, action: "" }), null);
    assert.equal(buttonRule({ ...b, action: 'a"b' }), null);
    assert.equal(buttonRule({ ...b, profile: "ni ght" }), null);
});

test("a rule names a device by its name only when no other device has that name", () => {
    const a = { ieee: "0x00158D0007A1B2C3", name: "lamp" }, b = { ieee: "0x00158D0007A1B2C4", name: "lamp" };
    const c = { ieee: "0x00158D0007A1B2C5", name: "door" }, d = { ieee: "0x00158D0007A1B2C6", friendly: "door" };
    const all = [a, b, c, { ieee: ALARM_IEEE, name: "Alarm" }];
    assert.equal(ruleRef(a, all), a.ieee, "two devices called lamp: the address, the name would name the first one");
    assert.equal(ruleRef(b, all), b.ieee);
    assert.equal(ruleRef(c, all), "door", "one device of that name: the name");
    assert.equal(ruleRef(c, [c, d]), c.ieee, "`name` and `friendly` are the same field: d is called door too");
    assert.equal(ruleRef(d, [c, d]), d.ieee);
    assert.equal(ruleRef(c, [c, { ...c, ieee: c.ieee.toLowerCase() }]), "door", "the same device twice in the list is one device");
    assert.equal(ruleRef(a, [{ ...a, name: "Lamp" }]), "lamp", "names are exact, as the hub compares them");
    assert.equal(ruleRef(a), "lamp", "no list: the name alone");
    assert.equal(ruleRef(a, null), "lamp");
    assert.equal(ruleRef({ ieee: ALARM_IEEE }, all), ALARM_IEEE, "the Alarm device not listed: its address");
});

test("a get reply that crosses a push keeps the pushed status and takes the config", () => {
    const status = (state, push) => ({ state, profiles: [{ id: "away", state }], at: 1000, push });
    const reply = (state) => ({ state, profiles: [{ id: "away", state }], config: { profiles: [{ id: "away" }] } });
    // The get went out when the page had seen no push (seen 0); a push came while it was out, then the reply.
    const pushed = status("triggered", 1);
    assert.equal(afterGet(pushed, reply("armed"), 0, 2000), pushed, "the older status does not roll the push back");
    // No push in between: the reply is the newest thing the page has seen.
    assert.deepEqual(afterGet(status("armed", 1), reply("triggered"), 1, 2000),
        { state: "triggered", profiles: [{ id: "away", state: "triggered" }], at: 2000, push: 1 });
    assert.deepEqual(afterGet(null, reply("armed"), 0, 2000), { state: "armed", profiles: [{ id: "away", state: "armed" }], at: 2000, push: 0 },
        "the first load");
    assert.ok(!("config" in afterGet(null, reply("armed"), 0, 2000)), "the config is kept apart from the status");
    // A second get after the first: its reply is newer than the first's even though both came after the push.
    const first = afterGet(status("armed", 1), reply("armed"), 1, 2000);
    assert.equal(afterGet(first, reply("triggered"), 1, 3000).state, "triggered");
    assert.equal(afterGet(status("triggered", 2), reply("armed"), 1, 3000).state, "triggered", "two pushes while the get was out");
});

test("a generated rule name fits the hub's 23 bytes without being cut and differs wherever its inputs differ", () => {
    const id13 = "abcdefghijklm", twin = "abcdefghijkln";   // an id has at most 13 characters
    const names = [];
    for (const profile of ["away", id13, twin, "p_1"]) {
        for (const state of STATES) names.push([`${profile}/${state}`,
            reactionRule({ alarm: "Alarm", profile, state, device: "lamp", key: "state", value: "1" }).name]);
        for (const target of ["armed", "disarmed"]) names.push([`${profile}/${target}`,
            buttonRule({ button: "b", action: "x", alarm: "Alarm", profile, target }).name]);
    }
    names.push(["all", buttonRule({ button: "b", action: "x", alarm: "Alarm", profile: "", target: "disarmed" }).name]);
    for (const [what, name] of names) assert.ok(Buffer.byteLength(name) <= 23, `${what}: ${name} is ${Buffer.byteLength(name)} bytes`);
    const reaction = names.filter(([w]) => STATES.some((s) => w.endsWith(`/${s}`))).map(([, n]) => n);
    const button = names.filter(([w]) => /\/(armed|disarmed)$/.test(w) || w === "all").map(([, n]) => n);
    // `armed`/`disarmed` are both a state and a button target: tell the two kinds apart by what made them.
    for (const kind of [reaction, button]) assert.equal(new Set(kind).size, kind.length, "no two names alike");
    // Short ids keep the whole name: the Rules list reads better with the kind of rule in front.
    assert.equal(reactionRule({ alarm: "Alarm", profile: "flood", state: "triggered", device: "x", key: "state", value: "1" }).name, "Alarm flood triggered");
    assert.equal(buttonRule({ button: "b", action: "x", alarm: "Alarm", profile: "night", target: "disarmed" }).name, "Button disarms night");
    assert.equal(reactionRule({ alarm: "Alarm", profile: id13, state: "triggered", device: "x", key: "state", value: "1" }).name, `${id13} triggered`);
    assert.equal(buttonRule({ button: "b", action: "x", alarm: "Alarm", profile: id13, target: "armed" }).name, `arms ${id13}`);
    // An id the hub would never send, too long for any name: no rule rather than one the hub cuts.
    assert.equal(reactionRule({ alarm: "Alarm", profile: "x".repeat(20), state: "triggered", device: "x", key: "state", value: "1" }), null);
    assert.equal(buttonRule({ button: "b", action: "x", alarm: "Alarm", profile: "x".repeat(20), target: "armed" }), null);
});
