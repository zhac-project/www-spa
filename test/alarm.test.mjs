// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- the Safety page's pure helpers (src/alarm.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_IEEE, stateLabel, stateKind, countdownLabel, classLabel, leftNow, fmtLeft, isSensor, suits, outputKind,
         newOutput, withValue, proposeId, TEMPLATES, templatesFor, newProfile, running, notGuarding, configToSend,
         settable, ruleRef, valueChoices, reactionRule, buttonRule, profilesDiffer } from "../src/alarm.js";

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
    const cfg = { exit_delay: 30, entry_delay: 30, siren_time: 180, notify_arm: false, sensors: [], sirens: [], keypads: [], codes_count: 2 };
    const kept = configToSend(cfg, null);
    assert.equal("codes" in kept, false, "no `codes`: the hub keeps the stored ones");
    assert.equal("codes_count" in kept, false);
    assert.equal(kept.siren_time, 180);
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
