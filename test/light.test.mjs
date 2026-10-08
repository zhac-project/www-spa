import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PRESETS, isHex, isOn, modeOf, lightChannels, cardKeys, rawKeys, pctFromRaw, rawFromPct,
    kelvinRange, kelvinFromMired, miredFromKelvin, kelvinLabel, whiteName, colourName, writesFor, heldHex,
    pickable, powerGate, kelvinCss, inkFor,
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

test("the mode is read from color_mode even when no row lists it (most colour bulbs list none)", () => {
    const [c] = lightChannels(STRIP.filter((e) => e.name !== "color_mode"));
    assert.equal(c.keys.colorMode, "color_mode");
    const [l2] = lightChannels([{ name: "state_l2", type: "binary", access: 3 }, { name: "color_hex_l2", type: "color", access: 3 }]);
    assert.equal(l2.keys.colorMode, "color_mode_l2");
});

test("a brightness with no power to switch is a setting, not a light (thermostat displays)", () => {
    // Lytko L101Z: display brightness 0-100 %; Tuya _TZE204_tagezcph: backlight 0-8. Neither has a writable state.
    const thermostat = [
        { name: "brightness", type: "numeric", access: 3, value_min: 0, value_max: 8 },
        { name: "local_temperature", type: "numeric", access: 1 },
        { name: "system_mode", type: "enum", access: 3 },
    ];
    assert.deepEqual(lightChannels(thermostat), []);
    assert.deepEqual(lightChannels([{ name: "state", type: "binary", access: 1 }, ...thermostat]), []);
    // with a power switch it is a dimmer; a colour or a white alone still makes a light
    assert.equal(lightChannels([{ name: "state", type: "binary", access: 3 }, ...thermostat]).length, 1);
    assert.equal(lightChannels([{ name: "color_temp", type: "numeric", access: 3 }]).length, 1);
    assert.equal(lightChannels([{ name: "color_hex", type: "color", access: 3 }]).length, 1);
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

test("a white glows with its own tint, warm amber to cool blue (the web's and the app's kelvinCss)", () => {
    assert.equal(kelvinCss(2000), "rgb(255,180,107)");
    assert.equal(kelvinCss(4250), "rgb(255,244,229)");
    assert.equal(kelvinCss(6500), "rgb(214,230,255)");
    assert.equal(kelvinCss(1500), kelvinCss(2000));
    assert.equal(kelvinCss(9000), kelvinCss(6500));
    assert.notEqual(kelvinCss(2700), kelvinCss(6500));
});

test("the bulb's ink is dark on a light colour and white on a deep one (WCAG luminance, crossover 0.2)", () => {
    const DARK = "var(--light-ink)", LIGHT = "var(--light-ink-deep)";
    assert.equal(inkFor("#0000ff"), LIGHT);                  // pure blue: about 2:1 with dark ink
    assert.equal(inkFor("#ff0000"), DARK);
    assert.equal(inkFor("#ffd60a"), DARK);
    assert.equal(inkFor("#7a7a7a"), LIGHT);                  // luminance 0.195
    assert.equal(inkFor("#7c7c7c"), DARK);                   // 0.201
    for (const k of [2000, 2700, 4000, 6500]) assert.equal(inkFor(kelvinCss(k)), DARK, `${k} K`);
    assert.equal(inkFor("var(--surface-soft)"), DARK);       // not a colour it can read
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

test("a read-only expose is never a control: no power write, no colour channel", () => {
    const ro = (name, type = "numeric") => ({ name, type, access: 1 });
    const [c] = lightChannels([ro("state", "binary"), { name: "brightness", type: "numeric", access: 3 },
        { name: "color_temp", type: "numeric", access: 3 }, ro("color_hex", "color")]);
    assert.equal(c.keys.state, null);
    assert.equal(c.keys.colorHex, null);
    assert.deepEqual(writesFor(c, { state: 0 }, "brightness", 127), [["brightness", 127]]);
    assert.deepEqual(lightChannels([ro("state", "binary"), ro("color_hex", "color")]), []);
    assert.deepEqual(lightChannels([ro("brightness")]), []);
});

test("black is no colour: the picker's black is refused before anything is sent, power included", () => {
    assert.ok(!pickable("#000000") && !pickable("#000000".toUpperCase()));
    assert.ok(pickable("#010000") && pickable("#FF9500") && PRESETS.every((p) => pickable(p.hex)));
    assert.ok(!pickable("orange") && !pickable("#00000") && !pickable(undefined));
});

// The transport, with the power write held until the test answers it.
function heldPower() {
    const wire = [], answers = [];
    const setAttr = (key, value) => {
        wire.push([key, value]);
        return key === "state" ? new Promise((res, rej) => answers.push({ res, rej })) : Promise.resolve();
    };
    return { wire, setAttr, answer: () => answers.shift() };
}
const settled = () => new Promise((r) => setTimeout(r, 0));

test("picks made while the switch-on is in flight wait for it and go out in order, the last one last", { timeout: 2000 }, async () => {
    const [c] = lightChannels(STRIP);
    const off = { state: 0 }, on = { state: 1 };
    const { wire, setAttr, answer } = heldPower();
    const send = powerGate();
    const picks = [
        send(writesFor(c, off, "color_hex", "#ff9500"), "state", setAttr),
        send(writesFor(c, off, "color_hex", "#0a84ff"), "state", setAttr),
        send(writesFor(c, on, "brightness", 203), "state", setAttr),   // the hub's own "on" came before its answer
    ];
    await settled();
    assert.deepEqual(wire, [["state", true]]);                         // one switch-on, nothing ahead of it
    answer().res();
    await Promise.all(picks);
    assert.deepEqual(wire, [["state", true], ["color_hex", "#ff9500"], ["color_hex", "#0a84ff"], ["brightness", 203]]);
    // once it is answered a pick goes straight out; a tap on the power switch is a switch-on too
    await send(writesFor(c, on, "color_hex", "#ff2d55"), "state", setAttr);
    assert.deepEqual(wire.at(-1), ["color_hex", "#ff2d55"]);
    wire.length = 0;
    const tap = send(writesFor(c, off, "state", true), "state", setAttr);
    const after = send(writesFor(c, off, "color_temp", 250), "state", setAttr);
    await settled();
    assert.deepEqual(wire, [["state", true]]);
    answer().res();
    await Promise.all([tap, after]);
    assert.deepEqual(wire, [["state", true], ["color_temp", 250]]);
});

test("a refused switch-on drops every pick waiting on it, and the next pick asks again", { timeout: 2000 }, async () => {
    const [c] = lightChannels(STRIP);
    const off = { state: 0 };
    const { wire, setAttr, answer } = heldPower();
    const send = powerGate();
    const a = send(writesFor(c, off, "color_hex", "#ff9500"), "state", setAttr);
    const b = send(writesFor(c, off, "brightness", 127), "state", setAttr);
    await settled();
    answer().rej(new Error("radio refused"));
    await assert.rejects(a, /radio refused/);
    await assert.rejects(b, /radio refused/);
    assert.deepEqual(wire, [["state", true]]);
    const again = send(writesFor(c, off, "color_hex", "#0a84ff"), "state", setAttr);
    await settled();
    assert.deepEqual(wire, [["state", true], ["state", true]]);
    answer().res();
    await again;
    assert.deepEqual(wire.at(-1), ["color_hex", "#0a84ff"]);
});

test("writing the power key itself adds no second power write", () => {
    const [c] = lightChannels(STRIP);
    assert.deepEqual(writesFor(c, { state: 0 }, "state", true), [["state", true]]);
    assert.deepEqual(writesFor(c, {}, "state", false), [["state", false]]);
});

test("every _l1.._l9 gang is a channel, titled by its number", () => {
    const ex = [];
    for (let i = 1; i <= 9; i++) ex.push({ name: `state_l${i}`, type: "binary", access: 3 }, { name: `brightness_l${i}`, type: "numeric", access: 3 });
    assert.deepEqual(lightChannels(ex).map((c) => c.title), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `Light ${i}`));
});

test("state values: numbers, booleans, strings in any case, and junk", () => {
    for (const v of [true, 1, "ON", "on", "1", "true"]) assert.ok(isOn(v), String(v));
    for (const v of [false, 0, "OFF", "off", "0", "false", null, undefined, ""]) assert.ok(!isOn(v), String(v));
});

test("percent round-trips; every clamp holds at both ends", () => {
    for (let p = 1; p <= 100; p++) assert.equal(pctFromRaw(rawFromPct(p, 0, 254), 254), p);
    assert.equal(rawFromPct(0), 1);
    assert.equal(rawFromPct(150), 254);
    assert.equal(pctFromRaw(300), 100);
    assert.equal(miredFromKelvin(9000, { min: 153, max: 500 }), 153);
    assert.equal(miredFromKelvin(1000, { min: 153, max: 500 }), 500);
});

test("raw keys include read-only color exposes that the card hides", () => {
    const [c] = lightChannels([
        { name: "state", type: "binary", access: 3 },
        { name: "brightness", type: "numeric", access: 3 },
        { name: "color_hex", type: "color", access: 1 },
    ]);
    assert.deepEqual(rawKeys(c, { state: 1, brightness: 127, color_hex: "#ff8a3d" }), ["state", "brightness", "color_hex"]);
});

test("color_temp with value_min 0 or missing falls back to default minimum", () => {
    const [c] = lightChannels([
        { name: "state", type: "binary", access: 3 },
        { name: "brightness", type: "numeric", access: 3 },
        { name: "color_temp", type: "numeric", access: 3, value_min: 0, value_max: 500 },
    ]);
    assert.deepEqual(c.ct, { min: 150, max: 500 });
    const kr = kelvinRange(c.ct);
    assert.ok(Number.isFinite(kr.max), `kelvinRange max should be finite, got ${kr.max}`);
});
