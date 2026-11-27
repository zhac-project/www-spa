// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- Settings > Remote > "Cloud control" and the alarm switch (HL-02, HL-03): the settings payload
// and the option texts. The hub decides and validates; the page only carries the words and the saved value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOUD_LEVELS, levelPatch, alarmPatch, levelToast, ALARM_HINT } from "../src/cloudControl.js";

test("the three levels, in order, with the texts the owner reads", () => {
    assert.deepEqual(CLOUD_LEVELS.map((l) => l.id), ["view", "devices", "full"]);
    assert.deepEqual(CLOUD_LEVELS.map((l) => l.label), [
        "View only — the cloud shows states",
        "Devices — the cloud can switch devices",
        "Devices and rules — the cloud can also change rules, open pairing and read logs and scripts",
    ]);
});

test("the level payload carries remote_level as view, devices or full, and nothing else", () => {
    for (const id of ["view", "devices", "full"]) assert.deepEqual(levelPatch(id), { remote_level: id });
});

test("the alarm payload carries remote_alarm as a real boolean", () => {
    assert.deepEqual(alarmPatch(true), { remote_alarm: true });
    assert.deepEqual(alarmPatch(false), { remote_alarm: false });
    assert.deepEqual(alarmPatch(undefined), { remote_alarm: false });
    assert.deepEqual(alarmPatch("on"), { remote_alarm: true });
});

test("toasts say what was asked; the alarm line says what the switch does when off", () => {
    assert.equal(levelToast("view"), "Cloud control: view only");
    assert.equal(levelToast("devices"), "Cloud control: devices");
    assert.equal(levelToast("full"), "Cloud control: devices and rules");
    assert.equal(ALARM_HINT, "Off: the cloud and the app can arm the alarm but not disarm it.");
});
