// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";

// Device shape (loose): { ieee, name, nwk, vendor, model, eps, clusters,
//   exposes, attrs, lqi, last_seen, proto, power_source, ... }
export const devices = signal([]);

const MOCK_DEVICES = [
    {
        ieee: "0x00158d000a000001",
        friendly_name: "kitchen switch",
        vendor: "Aqara", model: "WXKG01LM",
        exposes: [
            { name: "action", type: "enum", access: 1,
              values: ["single", "double", "triple", "hold", "release"] },
            { name: "battery", type: "numeric", access: 1, unit: "%",
              category: "diagnostic" },
        ],
    },
    {
        ieee: "0x00158d000a000002",
        friendly_name: "kitchen plug",
        vendor: "TuYa", model: "TS011F",
        exposes: [
            { name: "state", type: "binary", access: 3, values: ["off", "on"] },
            { name: "power", type: "numeric", access: 1, unit: "W" },
        ],
    },
    {
        ieee: "0x00158d000a000003",
        friendly_name: "kitchen light",
        vendor: "IKEA", model: "LED1949C5",
        exposes: [
            { name: "state",      type: "binary",  access: 3,
              values: ["off", "on"] },
            { name: "brightness", type: "numeric", access: 3 },
            { name: "color_temp", type: "numeric", access: 3, unit: "mired" },
        ],
    },
    {
        ieee: "0x00158d000a000004",
        friendly_name: "balcony temp",
        vendor: "Aqara", model: "WSDCGQ11LM",
        exposes: [
            { name: "temperature", type: "numeric", access: 1, unit: "°C" },
            { name: "humidity",    type: "numeric", access: 1, unit: "%" },
            { name: "battery",     type: "numeric", access: 1, unit: "%",
              category: "diagnostic" },
        ],
    },
];

export async function bootstrapDevices() {
    try {
        const data = await call("device.list");
        // Tolerate either { devices: [...] } or a bare array.
        devices.value = Array.isArray(data) ? data : (data?.devices || []);
    } catch (err) {
        if (import.meta.env.DEV) {
            console.warn("[mock] device.list failed; seeding 4 dev fixtures.", err);
            devices.value = MOCK_DEVICES;
        } else {
            throw err;
        }
    }
}

// Fetch one device with full detail (exposes, attrs, eps, ...).
export async function getDevice(ieee) {
    return call("device.get", { ieee });
}

export async function renameDevice(ieee, name) {
    return call("device.rename", { ieee, name });
}

export async function reinterviewDevice(ieee) {
    return call("device.reinterview", { ieee });
}

// Re-run ONLY the configure pipeline (bindings + reports + config_steps)
// without redoing the full interview. Faster than reinterview when the
// device's (model_id, manufacturer_name) are already cached — e.g. when
// a definition gained new reports[] / config_steps[] and the user wants
// an existing paired device to pick them up. Server-side handler in
// mono-core: `cmd_device_configure` in main/ws_bridge.cpp.
export async function configureDevice(ieee) {
    return call("device.configure", { ieee });
}

export async function deleteDevice(ieee, hard = false) {
    return call("device.delete", { ieee, hard });
}

export async function setDeviceAttr(ieee, key, value) {
    return call("device.attr.set", { ieee, key, value });
}

export async function bindDevice(args) {
    return call("device.bind", args);
}

// Native ZCL group membership (dedicated device.groups.* API). Each add/remove
// sends the ZCL Groups command to the device AND updates the S3-side membership
// mirror; all three return the updated tracked list `{groups:[...]}`. Lets a
// light obey a hardware zone-remote (e.g. MiBoxer FUT089Z groups 101-108).
export async function deviceGroupsList(ieee)           { return call("device.groups.list",   { ieee }); }
export async function deviceGroupsAdd(ieee, ep, gid)    { return call("device.groups.add",    { ieee, ep, gid }); }
export async function deviceGroupsRemove(ieee, ep, gid) { return call("device.groups.remove", { ieee, ep, gid }); }

// ── Event fan-in ────────────────────────────────────────────────────────

// IEEEs can arrive in mixed case ("0x70C5…" vs the stored lowercase
// from device.list) depending on which encoder emitted them. Compare
// case-insensitively so live-update events always find their row.
function sameIeee(a, b) {
    if (!a || !b) return false;
    return String(a).toLowerCase() === String(b).toLowerCase();
}

on("device.added", (d) => {
    if (!d || !d.ieee) return;
    const list = devices.value;
    if (list.some(x => sameIeee(x.ieee, d.ieee))) return;
    devices.value = [...list, d];
});

on("device.updated", (d) => {
    if (!d || !d.ieee) return;
    devices.value = devices.value.map(x =>
        sameIeee(x.ieee, d.ieee) ? { ...x, ...d } : x);
});

on("device.removed", (d) => {
    if (!d || !d.ieee) return;
    devices.value = devices.value.filter(x => !sameIeee(x.ieee, d.ieee));
});

// attr.changed delivers one key/value pair; patch in place to keep
// refs to unchanged rows stable. Backend doesn't currently emit this
// shape (it prefers attr.bulk), but the subscription stays so future
// single-attr events work automatically.
on("attr.changed", (a) => {
    if (!a || !a.ieee) return;
    devices.value = devices.value.map(x => {
        if (!sameIeee(x.ieee, a.ieee)) return x;
        const prevAttrs = x.attrs || {};
        return { ...x, attrs: { ...prevAttrs, [a.key]: a.value },
                 last_seen: a.ts || x.last_seen };
    });
});

// attr.bulk now carries an ARRAY of per-attr device_update entries,
// emitted by S3's coalescer every ~100 ms. Each entry is shaped
// `{type,ieee,lqi,last_seen,attrs}`. Multiple entries for the same
// IEEE may appear in one batch; we merge their attrs in order, then
// walk devices once.
on("attr.bulk", (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return;

    // First pass: build a lookup keyed by lowercased IEEE so multiple
    // updates to the same device collapse into one merged delta.
    const updates = new Map();
    for (const a of entries) {
        if (!a || !a.ieee || !a.attrs) continue;
        const key = String(a.ieee).toLowerCase();
        const prev = updates.get(key);
        updates.set(key, {
            attrs:     { ...(prev?.attrs || {}), ...a.attrs },
            lqi:       a.lqi       != null ? a.lqi       : prev?.lqi,
            last_seen: a.last_seen != null ? a.last_seen : prev?.last_seen,
        });
    }
    if (updates.size === 0) return;

    // Second pass: apply each merged delta to the matching row.
    devices.value = devices.value.map(x => {
        const u = updates.get(String(x.ieee).toLowerCase());
        if (!u) return x;
        return {
            ...x,
            attrs:     { ...(x.attrs || {}), ...u.attrs },
            lqi:       u.lqi       != null ? u.lqi       : x.lqi,
            last_seen: u.last_seen != null ? u.last_seen : x.last_seen,
        };
    });
});
