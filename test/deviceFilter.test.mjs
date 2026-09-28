// node --test -- pure predicate behind the Devices page filter box.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceMatchesFilter } from "../src/utils/deviceFilter.js";

const kitchen = { name: "Kitchen switch", ieee: "0x00158d000a000001", model: "WXKG01LM", vendor: "Aqara" };
const plug    = { name: "Kitchen plug",   ieee: "0x00158d000a000002", model: "TS011F",   vendor: "TuYa" };
const noName  = { ieee: "0x00158d000a000003", model: "LED1949C5", vendor: "IKEA" };

test("empty or blank query matches everything", () => {
    assert.equal(deviceMatchesFilter(kitchen, ""), true);
    assert.equal(deviceMatchesFilter(kitchen, "   "), true);
    assert.equal(deviceMatchesFilter(kitchen, undefined), true);
});

test("matches name, case-insensitive substring", () => {
    assert.equal(deviceMatchesFilter(kitchen, "kitchen"), true);
    assert.equal(deviceMatchesFilter(kitchen, "SWITCH"), true);
    assert.equal(deviceMatchesFilter(kitchen, "plug"), false);
});

test("matches ieee, model, vendor", () => {
    assert.equal(deviceMatchesFilter(kitchen, "a000001"), true);
    assert.equal(deviceMatchesFilter(kitchen, "wxkg01lm"), true);
    assert.equal(deviceMatchesFilter(kitchen, "aqara"), true);
    assert.equal(deviceMatchesFilter(plug, "tuya"), true);
});

test("no match returns false", () => {
    assert.equal(deviceMatchesFilter(kitchen, "nope"), false);
});

test("tolerates a device with no name", () => {
    assert.equal(deviceMatchesFilter(noName, "ikea"), true);
    assert.equal(deviceMatchesFilter(noName, ""), true);
});

test("tolerates a missing device", () => {
    assert.equal(deviceMatchesFilter(null, "x"), false);
    assert.equal(deviceMatchesFilter(null, ""), true);
});
