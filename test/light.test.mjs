import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PRESETS, isHex, isOn, modeOf, lightChannels, cardKeys, rawKeys, pctFromRaw, rawFromPct,
    kelvinRange, kelvinFromMired, miredFromKelvin, kelvinLabel, whiteName, colourName, writesFor, heldHex,
} from "../src/light.js";

const STRIP = [
    { name: "state", type: "binary", access: 3 },
    { name: "brightness", type: "numeric", access: 3, value_min: 0, value_max: 254 },
    { name: "color_temp", type: "numeric", access: 3, value_min: 153, value_max: 500 },
    { name: "color_x", type: "numeric", access: 3 },
    { name: "color_mode", type: "enum", access: 1, values: ["hs", "xy", "color_temp"] },
    { name: "color_hex", type: "color", access: 3 },
    { name: "do_not_disturb", type: "binary", access: 2 },
];

test("a colour strip is one channel with every light key", () => {
    const [c, ...rest] = lightChannels(STRIP);
    assert.equal(rest.length, 0);
    assert.equal(c.title, "Light");
    assert.deepEqual(c.keys, { state: "state", brightness: "brightness", colorTemp: "color_temp",
        colorHex: "color_hex", colorMode: "color_mode" });
    assert.deepEqual(c.ct, { min: 153, max: 500 });
    assert.deepEqual(c.bri, { min: 0, max: 254 });
});

test("a two-gang dimmer is two channels; a plain switch is none", () => {
    const ch = lightChannels([
        { name: "state_l1", type: "binary", access: 3 }, { name: "brightness_l1", type: "numeric", access: 3 },
        { name: "state_l2", type: "binary", access: 3 }, { name: "brightness_l2", type: "numeric", access: 3 },
    ]);
    assert.deepEqual(ch.map((c) => c.title), ["Light 1", "Light 2"]);
    assert.equal(ch[1].keys.brightness, "brightness_l2");
    assert.deepEqual(ch[0].ct, { min: 150, max: 500 });
    assert.deepEqual(lightChannels([{ name: "state", type: "binary", access: 3 }]), []);
});

test("the card takes its keys and the raw colour channels out of the table, nothing else", () => {
    const keys = cardKeys(lightChannels(STRIP));
    for (const k of ["state", "brightness", "color_temp", "color_hex", "color_mode", "color_x", "color_y", "hue", "saturation", "color_xy", "color_hs"])
        assert.ok(keys.has(k), k);
    assert.ok(!keys.has("do_not_disturb"));
    assert.ok(!keys.has("color_temp_startup"));
    const [c] = lightChannels(STRIP);
    assert.deepEqual(rawKeys(c, { state: 1, color_x: 0.56, color_hex: "#ff8a3d", linkquality: 148 }),
        ["state", "color_hex", "color_x"]);
});

test("percent and raw brightness", () => {
    assert.equal(rawFromPct(1), 3);
    assert.equal(rawFromPct(100), 254);
    assert.equal(rawFromPct(50, 0, 254), 127);
    assert.equal(rawFromPct(1, 10, 254), 10);
    assert.equal(pctFromRaw(254), 100);
    assert.equal(pctFromRaw(0), 1);
    assert.equal(pctFromRaw(127, 254), 50);
});

test("kelvin and mired, warm on the left", () => {
    assert.deepEqual(kelvinRange({ min: 153, max: 500 }), { min: 2000, max: 6536 });
    assert.equal(kelvinFromMired(333), 3003);
    assert.equal(kelvinFromMired(0), null);
    assert.equal(miredFromKelvin(3000, { min: 153, max: 500 }), 333);
    assert.equal(miredFromKelvin(1000, { min: 153, max: 500 }), 500);
    assert.equal(kelvinLabel(3003), "3000 K");
    assert.deepEqual([2700, 4000, 5000, 6500].map(whiteName), ["Warm white", "Neutral white", "Cool white", "Daylight"]);
});

test("colour names and presets", () => {
    assert.deepEqual(PRESETS.map((p) => colourName(p.hex)), PRESETS.map((p) => p.name));
    assert.equal(colourName("#ffffff"), "White");
    assert.equal(colourName("#ff8a3d"), "Orange");
    assert.ok(isHex("#FF8A3D") && !isHex("ff8a3d") && !isHex("#ff8a3"));
    assert.equal(modeOf("color_temp"), "white");
    assert.equal(modeOf("xy"), "colour");
    assert.equal(modeOf(undefined), "colour");
    assert.ok(isOn(1) && isOn(true) && isOn("ON") && !isOn(0) && !isOn("OFF"));
});

test("picking while off switches on first, once, and only when power can be set", () => {
    const [c] = lightChannels(STRIP);
    assert.deepEqual(writesFor(c, { state: 0 }, "color_hex", "#ff9500"), [["state", true], ["color_hex", "#ff9500"]]);
    assert.deepEqual(writesFor(c, { state: 1 }, "color_hex", "#ff9500"), [["color_hex", "#ff9500"]]);
    const [noPower] = lightChannels(STRIP.filter((e) => e.name !== "state"));
    assert.deepEqual(writesFor(noPower, {}, "brightness", 127), [["brightness", 127]]);
});

test("a pick shows until the hub reports anything new for it, then the report wins", () => {
    const pending = { hex: "#ff9500", from: "#00ff00" };
    assert.equal(heldHex(pending, "#00ff00"), "#ff9500");
    assert.equal(heldHex(pending, "#ff9a00"), "#ff9a00");    // the bulb's nearest colour (gamut)
    assert.equal(heldHex(null, "#FF9A00"), "#ff9a00");
    assert.equal(heldHex(null, undefined), null);
});
