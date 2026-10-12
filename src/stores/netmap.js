// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";
import { showToast } from "./ui.js";
import { scanErrorText } from "../netmap.js";

// Network map (spec 2026-10-12 §4, §5). null = not asked yet; false = this hub
// has no map ops (dual-chip, mono), so the Map tab stays hidden; true = it has.
export const netmapSupported = signal(null);
// receivedAt: when this page got the current map (ms), for a hub whose clock is not set.
export const netmap = signal({ scanning: false, progress: null, map: null, receivedAt: 0 });

function apply(data) {
    const prev = netmap.value;
    const map = data?.map ?? null;
    const fresh = map && (!prev.map || map.ts !== prev.map.ts || map.duration_ms !== prev.map.duration_ms);
    netmap.value = {
        scanning: !!data?.scanning,
        progress: data?.progress || null,
        map: map || (data?.scanning ? prev.map : null),
        receivedAt: fresh ? Date.now() : prev.receivedAt,
    };
}

// The first answer decides: a failure before any success ("unknown cmd" on hubs
// without the ops, or whatever the dual-chip S3 says) hides the tab. Once the
// hub has answered, a transport hiccup keeps the tab. Re-runs on every reconnect.
export async function bootstrapNetmap() {
    try {
        apply(await call("net.map.get"));
        netmapSupported.value = true;
    } catch (_) {
        if (netmapSupported.value !== true) netmapSupported.value = false;
    }
}

export async function startScan() {
    try {
        await call("net.map.scan");
        netmap.value = { ...netmap.value, scanning: true, progress: { done: 0, total: 0, current: "" } };
    } catch (e) {
        showToast(scanErrorText(e.message), "err");
    }
}

on("net.map.progress", (d) => {
    netmap.value = { ...netmap.value, scanning: true, progress: d };
});

on("net.map.done", (d) => {
    if (d && d.ok === false) showToast(scanErrorText(d.err || "failed"), "err");
    bootstrapNetmap();
});
