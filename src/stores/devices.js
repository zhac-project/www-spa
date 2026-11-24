// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";
import { mergeAttrBulk } from "../utils/deviceMerge.js";

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

// device.list rows carry no exposes; the pickers (Rules recipes, Security) need them to know which
// device is a motion sensor and which a light. Fetched once per device and kept, so reopening a
// picker is instant.
export const deviceDetails = signal({});   // ieee -> detail (with exposes)
let detailsLoading = null;

export async function loadDetails() {
    if (detailsLoading) return detailsLoading;
    detailsLoading = (async () => {
        try { if (devices.value.length === 0) await bootstrapDevices(); } catch { /* shown as "no devices" */ }
        const out = { ...deviceDetails.value };
        await Promise.all(devices.value.map(async d => {
            if (out[d.ieee]) return;
            try { out[d.ieee] = await getDevice(d.ieee); } catch { out[d.ieee] = { ieee: d.ieee, exposes: [] }; }
        }));
        deviceDetails.value = out;
    })();
    try { await detailsLoading; } finally { detailsLoading = null; }
}

// No firmware today broadcasts `device.updated` after a rename, so the
// cached `devices` signal would otherwise keep showing the old name until
// the next full device.list (e.g. a page reload). Patch it here instead --
// every caller (DeviceDetail, the backup restore merge) goes through this
// function and benefits.
export async function renameDevice(ieee, name) {
    const res = await call("device.rename", { ieee, name });
    devices.value = devices.value.map(x =>
        sameIeee(x.ieee, ieee) ? { ...x, name, friendly: name } : x);
    return res;
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
// Authoritative refresh: reads the device's real ZCL group table + reconciles.
export async function deviceGroupsRefresh(ieee, ep)    { return call("device.groups.refresh", { ieee, ep }); }

// Global native-ZCL membership, inverted by gid (groups.all op). Read-only fetch.
export async function groupsAll() { return call("groups.all", {}); }

// ── Event fan-in ────────────────────────────────────────────────────────

// IEEEs can arrive in mixed case ("0x70C5…" vs the stored lowercase
// from device.list) depending on which encoder emitted them. Compare
// case-insensitively so live-update events always find their row.
export function sameIeee(a, b) {
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

// attr.bulk carries an ARRAY of per-device entries, emitted by the hub's
// coalescer every ~100 ms; utils/deviceMerge.js folds them in.
on("attr.bulk", (entries) => {
    const next = mergeAttrBulk(devices.value, entries);
    if (next !== devices.value) devices.value = next;
});
