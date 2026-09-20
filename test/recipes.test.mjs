import { test } from "node:test";
import assert from "node:assert/strict";
import { RECIPES, buildRules, describe, deviceFits, freeTimerIndex, humanize, missingField,
         referencedRefs, unknownRefs } from "../src/recipes.js";
import { RULE_TEMPLATES } from "../src/templates.js";

const S = "0x00158D0007A1B2C3", L = "0x00158D000A000003";
const byId = id => RECIPES.find(r => r.id === id);

test("every recipe builds well-formed rules", () => {
    const values = { sensor: S, light: L, button: S, door: S, valve: L, minutes: 5, time: "22:30" };
    for (const r of RECIPES) {
        const rules = buildRules(r, values, { name: "Test", timer: 3 });
        assert.ok(rules.length >= 1, r.id);
        for (const x of rules) {
            assert.match(x.dsl, /^ON .+ DO .+ ENDON$/, `${r.id}: ${x.dsl}`);
            assert.ok(x.name.startsWith("Test"), r.id);
        }
        assert.equal(missingField(r, values), "");
        assert.ok(describe(r, values, ref => ({ [S]: "sensor", [L]: "lamp" })[ref] || ref).includes("lamp") ||
                  describe(r, values).length > 10, r.id);
    }
});

test("motion light uses the timer pair", () => {
    const [on, off] = buildRules(byId("motion_light"), { sensor: S, light: L, minutes: "2" }, { name: "Hall", timer: 4 });
    assert.equal(on.dsl, `ON ${S}#occupancy=1 DO zigbee.set ${L} state 1 ; timer 4 120000 ENDON`);
    assert.equal(off.dsl, `ON Rules#Timer=4 DO zigbee.set ${L} state 0 ENDON`);
    assert.equal(off.name, "Hall (off timer)");
});

test("scheduled off turns a time into a cron", () => {
    const [r] = buildRules(byId("scheduled_off"), { light: L, time: "7:05" }, { name: "Off" });
    assert.equal(r.dsl, `ON Time#Cron=0 5 7 * * * DO zigbee.set ${L} state 0 ENDON`);
    assert.equal(missingField(byId("scheduled_off"), { light: L, time: "" }), "At");
    assert.equal(missingField(byId("motion_light"), { sensor: S, light: L, minutes: 0 }), "Off after (minutes)");
    assert.equal(missingField(byId("motion_light"), { light: L, minutes: 5 }), "Motion sensor");
});

test("deviceFits reads exposes and the SET bit", () => {
    const lamp = { exposes: [{ name: "state", access: 3 }] };
    const sensor = { exposes: [{ name: "occupancy", access: 1 }, { name: "state", access: 1 }] };
    const light = byId("motion_light").fields[1], motion = byId("motion_light").fields[0];
    assert.equal(deviceFits(light, lamp), true);
    assert.equal(deviceFits(light, sensor), false, "state is read-only on the sensor");
    assert.equal(deviceFits(motion, sensor), true);
    assert.equal(deviceFits(motion, lamp), false);
    assert.equal(deviceFits(motion, {}), false);
});

test("freeTimerIndex skips indexes rules already use", () => {
    assert.equal(freeTimerIndex([]), 1);
    assert.equal(freeTimerIndex(["ON a#b DO timer 1 5000 ENDON", "ON Rules#Timer=2 DO log x ENDON"]), 3);
    assert.equal(freeTimerIndex([1, 2, 3, 4, 5, 6, 7, 8].map(i => `ON x#y DO timer ${i} 1 ENDON`)), 0);
});

test("referencedRefs / unknownRefs / humanize", () => {
    assert.deepEqual(referencedRefs("ON kitchen switch#action=\"single\" DO zigbee.set kitchen_light state 1 ENDON"),
                     ["kitchen switch", "kitchen_light"]);
    assert.deepEqual(referencedRefs("ON Time#Cron=0 30 22 * * * DO zigbee.set LIGHT state 0 ENDON"), ["LIGHT"]);
    assert.deepEqual(referencedRefs("ON Rules#Timer=1 DO zigbee.toggle a state ; zigbee.set b state 0 ENDON"), ["a", "b"]);
    assert.deepEqual(referencedRefs("ON System#Boot DO publish x y ENDON"), []);
    for (const t of RULE_TEMPLATES) assert.ok(referencedRefs(t.dsl).length >= 1, t.name);
    const devices = [{ ieee: S, name: "hall motion" }, { ieee: L, name: "hall_light" }];
    assert.deepEqual(unknownRefs(`ON ${S}#occupancy=1 DO zigbee.set hall_light state 1 ENDON`, devices), []);
    assert.deepEqual(unknownRefs("ON MOTION_SENSOR#occupancy=1 DO zigbee.set hall_light state 1 ENDON", devices), ["MOTION_SENSOR"]);
    assert.equal(humanize(`ON ${S}#occupancy=1 DO zigbee.set ${L} state 1 ENDON`, devices),
                 "ON hall motion#occupancy=1 DO zigbee.set hall_light state 1 ENDON");
});
