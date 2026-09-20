// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";

// Whole-system status snapshot. Shape matches what `api_status_get`
// produces today (see /api/status in rest_ops.cpp).
export const status = signal({});

let lastAutoLend = 0;   // bootstrapStatus lends the browser clock at most once a minute

export async function bootstrapStatus() {
    const data = await call("status.get");
    status.value = data || {};
    // An offline hub has no clock and its schedules wait for one; lend ours,
    // at most once a minute however often status is fetched.
    if (status.value.clock_set === false && Date.now() - lastAutoLend > 60000) {
        lastAutoLend = Date.now();
        await lendBrowserClock();
    }
}

// Hands this browser's clock to a hub that has none: no RTC, and NTP needs the
// internet. The hub only takes it while its own clock is unset, so this never
// moves a synced clock. Returns true when the hub took it.
export async function lendBrowserClock() {
    try {
        const r = await call("time.set", { epoch: Math.floor(Date.now() / 1000) });
        if (!r || !r.set) return false;
        status.value = (await call("status.get")) || status.value;
        return true;
    } catch (_) {
        return false;   // firmware without time.set, or not signed in yet
    }
}

// Which firmware is serving this page — the same bundle runs on all of them.
// Only the dual-chip S3 sends a `p4` object; the wired build says "wired";
// anything else is the single-chip S3. null until the first status.get lands.
export function hubKind(s = status.value) {
    if (!s || s.uptime == null) return null;
    if (s.sku === "wired") return "wired";
    return s.p4 ? "dual" : "single";
}

// "esp32p4" -> "ESP32-P4". The single-chip S3 build does not report a target.
export function chipName(s = status.value) {
    const t = (s && s.target) || "esp32s3";
    return t.toUpperCase().replace(/^ESP32/, "ESP32-");
}

on("status.tick", (s) => {
    // status.tick is a periodic delta — merge so fields the server
    // omits stay as their last-known value.
    if (s) status.value = { ...status.value, ...s };
});
