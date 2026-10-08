// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// The light card as data: which keys make a light channel, the writes one pick
// needs, and presentation only (percent <-> the device's 0-254, kelvin <->
// mired, colour names). The colour itself is the hub's `color_hex`.

export const PRESETS = [
    { name: "Red", hex: "#ff3b30" }, { name: "Orange", hex: "#ff9500" },
    { name: "Yellow", hex: "#ffd60a" }, { name: "Green", hex: "#34c759" },
    { name: "Cyan", hex: "#32ade6" }, { name: "Blue", hex: "#0a84ff" },
    { name: "Violet", hex: "#af52de" }, { name: "Pink", hex: "#ff2d55" },
];

const ACCESS_SET = 0x02;
const HEX = /^#[0-9a-f]{6}$/i;
// Raw colour channels a colour card replaces (only plain keys exist for these).
const RAW_COLOUR = ["color_x", "color_y", "color_xy", "color_hs", "hue", "saturation"];

export const isHex = (v) => typeof v === "string" && HEX.test(v);
export const isOn = (v) => v === true || v === 1 || (typeof v === "string" && /^(on|true|1)$/i.test(v));
export const modeOf = (colorMode) => (colorMode === "color_temp" ? "white" : "colour");

export function lightChannels(exposes) {
    const by = new Map((exposes || []).filter((e) => e && e.name).map((e) => [e.name, e]));
    const writable = (n) => !!by.get(n) && (by.get(n).access & ACCESS_SET) !== 0;
    const range = (n, lo, hi) => {
        const e = by.get(n);
        const min = Number.isFinite(e?.value_min) ? e.value_min : lo;
        const max = Number.isFinite(e?.value_max) && e.value_max > min ? e.value_max : hi;
        return { min, max };
    };
    const out = [];
    for (const s of ["", "_l1", "_l2", "_l3", "_l4", "_l5", "_l6", "_l7", "_l8", "_l9"]) {
        const bri = writable(`brightness${s}`), ct = writable(`color_temp${s}`), hex = writable(`color_hex${s}`);
        if (!bri && !ct && !hex) continue;
        out.push({
            suffix: s,
            keys: {
                state: writable(`state${s}`) ? `state${s}` : null,
                brightness: bri ? `brightness${s}` : null,
                colorTemp: ct ? `color_temp${s}` : null,
                colorHex: hex ? `color_hex${s}` : null,
                colorMode: by.has(`color_mode${s}`) ? `color_mode${s}` : null,
            },
            bri: range(`brightness${s}`, 0, 254),
            ct: range(`color_temp${s}`, 150, 500),
        });
    }
    for (const c of out) c.title = out.length === 1 || !c.suffix ? "Light" : `Light ${c.suffix.slice(2)}`;
    return out;
}

export function cardKeys(channels) {
    const keys = new Set();
    for (const c of channels) {
        for (const k of Object.values(c.keys)) if (k) keys.add(k);
        keys.add(`color_mode${c.suffix}`);
        keys.add(`color_hex${c.suffix}`);
        if (!c.suffix) RAW_COLOUR.forEach((k) => keys.add(k));
    }
    return keys;
}

export function rawKeys(channel, attrs) {
    const own = Object.values(channel.keys).filter(Boolean);
    const raw = channel.suffix ? [] : RAW_COLOUR;
    return [...own, ...raw].filter((k) => attrs && k in attrs);
}

export function pctFromRaw(raw, max = 254) {
    const m = Number(max) > 0 ? Number(max) : 254;
    return Math.min(100, Math.max(1, Math.round((Number(raw) || 0) * 100 / m)));
}
export function rawFromPct(pct, min = 0, max = 254) {
    const m = Number(max) > 0 ? Number(max) : 254;
    const lo = Math.max(1, Number(min) || 0);
    return Math.min(m, Math.max(lo, Math.round(Number(pct) * m / 100)));
}

export const kelvinRange = (ct) => ({ min: Math.round(1e6 / ct.max), max: Math.round(1e6 / ct.min) });
export const kelvinFromMired = (m) => (Number(m) > 0 ? Math.round(1e6 / Number(m)) : null);
export const miredFromKelvin = (k, ct) => Math.min(ct.max, Math.max(ct.min, Math.round(1e6 / Number(k))));
export const kelvinLabel = (k) => `${Math.round(k / 100) * 100} K`;
export const whiteName = (k) =>
    k < 3300 ? "Warm white" : k < 4500 ? "Neutral white" : k < 5800 ? "Cool white" : "Daylight";

const HUE_NAMES = [[15, "Red"], [45, "Orange"], [70, "Yellow"], [160, "Green"], [200, "Cyan"],
    [255, "Blue"], [290, "Violet"], [350, "Pink"], [361, "Red"]];
export function colourName(hex) {
    if (!isHex(hex)) return "";
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    if (mx === 0 || d / mx < 0.12) return "White";
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return HUE_NAMES.find(([lim]) => h < lim)[1];
}

export function writesFor(channel, attrs, key, value) {
    const sk = channel.keys.state;
    const out = [];
    if (sk && key !== sk && !isOn(attrs?.[sk])) out.push([sk, true]);
    out.push([key, value]);
    return out;
}

// `pending` = {hex, from}: the pick and the colour reported when it was made.
export function heldHex(pending, reported) {
    if (pending?.hex && reported === pending.from) return pending.hex;
    return isHex(reported) ? reported.toLowerCase() : null;
}
