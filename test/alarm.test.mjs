// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- the Security page's pure helpers (src/alarm.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALARM_IEEE, MODES, SETTABLE, stateLabel, stateKind, countdownLabel, leftNow, fmtLeft, isSensor, newSensor,
         sirenKind, newSiren, configToSend, settable, ruleRef, valueChoices, reactionRule, buttonRule } from "../src/alarm.js";

const bin = (name, access = 3) => ({ name, type: "binary", access });

test("the state badge says the state, and the mode while arming or in the entry delay", () => {
    assert.equal(stateLabel({ state: "disarmed", mode: "away" }), "Disarmed");
    assert.equal(stateLabel({ state: "armed_night", mode: "night" }), "Armed night");
    assert.equal(stateLabel({ state: "arming", mode: "away" }), "Arming (away)");
    assert.equal(stateLabel({ state: "pending", mode: "home" }), "Entry delay (home)");
    assert.equal(stateLabel({ state: "triggered", mode: "away" }), "Triggered", "after a panic the mode is the last armed one");
    assert.equal(stateLabel({ state: "new_state" }), "new_state", "a state this page does not know shows as the hub names it");
    assert.equal(stateLabel(null), "—");
    assert.deepEqual(["disarmed", "arming", "armed_away", "armed_home", "armed_night", "pending", "triggered"].map(stateKind),
                     ["off", "warn", "ok", "ok", "ok", "warn", "err"]);
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
    assert.equal(countdownLabel("triggered"), "Sirens stop in");
    assert.equal(countdownLabel("armed_away"), "");
});

test("a sensor is a device with contact, occupancy, presence or vibration; a new one guards as the spec says", () => {
    assert.equal(isSensor([bin("contact", 1)]), true);
    assert.equal(isSensor([bin("occupancy", 1)]), true);
    assert.equal(isSensor([bin("presence", 1)]), true);
    assert.equal(isSensor([bin("vibration", 1)]), true);
    assert.equal(isSensor([bin("state"), { name: "temperature", type: "numeric", access: 1 }]), false);
    assert.equal(isSensor(undefined), false);
    // Away always; home and night for doors, windows and vibration, not for motion and presence.
    assert.deepEqual(newSensor("0x1", [bin("contact", 1)]), { ieee: "0x1", modes: ["away", "home", "night"], entry: false });
    assert.deepEqual(newSensor("0x2", [bin("vibration", 1)]).modes, MODES);
    assert.deepEqual(newSensor("0x3", [bin("occupancy", 1)]).modes, ["away"]);
    assert.deepEqual(newSensor("0x4", [bin("presence", 1)]).modes, ["away"]);
});

test("a siren's kind is suggested from what it can be set to", () => {
    // An IAS WD siren also reports a read-only `alarm`: warning comes first.
    assert.equal(sirenKind([bin("alarm", 1), bin("warning", 2)]), "warning");
    assert.equal(sirenKind([bin("alarm"), { name: "melody", type: "enum", access: 3, values: ["1", "2"] }]), "alarm");
    assert.equal(sirenKind([bin("state")]), "state");
    assert.equal(sirenKind([bin("alarm", 1), bin("state")]), "state", "a read-only alarm cannot sound");
    assert.equal(sirenKind([bin("contact", 1)]), "", "nothing to switch on: not a siren");
    assert.equal(sirenKind(undefined), "");
    assert.deepEqual(newSiren("0x1", "warning"), { ieee: "0x1", kind: "warning", mode: "burglar", level: "high", strobe: true });
    assert.deepEqual(newSiren("0x1", "alarm"), { ieee: "0x1", kind: "alarm" });
    assert.deepEqual(newSiren("0x1", "state"), { ieee: "0x1", kind: "state" });
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

test("Add a reaction: an alarm state sets a device's key", () => {
    assert.deepEqual(reactionRule({ alarm: "Alarm", state: "triggered", device: "hall_siren", key: "warning", value: "burglar,high,1,180" }),
        { name: "Alarm triggered", dsl: 'ON Alarm#alarm_state="triggered" DO zigbee.set hall_siren warning burglar,high,1,180 ENDON' });
    assert.equal(reactionRule({ alarm: ALARM_IEEE, state: "armed_night", device: "rgb", key: "effect", value: "police" }).dsl,
                 `ON ${ALARM_IEEE}#alarm_state="armed_night" DO zigbee.set rgb effect police ENDON`);
    for (const missing of ["state", "device", "key", "value"]) {
        const f = { alarm: "Alarm", state: "triggered", device: "lamp", key: "state", value: "1", [missing]: "" };
        assert.equal(reactionRule(f), null, missing);
    }
    assert.equal(reactionRule({ alarm: "Alarm", state: "triggered", device: "lamp", key: "state", value: "on now" }), null,
                 "the hub reads one word: `on now` would set `on`");
    assert.equal(reactionRule({ alarm: "Alarm", state: "triggered", device: "lamp", key: "state", value: "1;log x" }), null);
});

test("Arm with a button: a button's action sets the Alarm device's state", () => {
    assert.deepEqual(buttonRule({ button: "hall_button", action: "single", alarm: "Alarm", target: "armed_away" }),
        { name: "Button arms away", dsl: 'ON hall_button#action="single" DO zigbee.set Alarm alarm_state armed_away ENDON' });
    assert.equal(buttonRule({ button: "b", action: "double", alarm: "Alarm", target: "disarmed" }).name, "Button disarms");
    for (const target of SETTABLE) assert.ok(buttonRule({ button: "b", action: "x", alarm: "Alarm", target }), target);
    assert.equal(buttonRule({ button: "b", action: "x", alarm: "Alarm", target: "triggered" }), null, "the Alarm device refuses it");
    assert.equal(buttonRule({ button: "b", action: "", alarm: "Alarm", target: "armed_home" }), null);
    assert.equal(buttonRule({ button: "b", action: 'a"b', alarm: "Alarm", target: "armed_home" }), null);
    for (const r of SETTABLE.map((target) => buttonRule({ button: "b", action: "x", alarm: "Alarm", target })))
        assert.ok(new TextEncoder().encode(r.name).length <= 23, `the hub keeps 23 bytes of a rule name: ${r.name}`);
});
