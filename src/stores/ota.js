// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// OTA store — WS wrappers around the firmware endpoints + progress
// state derived from backend push events.
//
//   POST /api/ota/s3  {"url":"..."}   — net-core self-update via esp_https_ota
//   POST /api/ota/p4  {"url":"..."}   — net-core fetches binary then streams
//                                       to P4 over HAP OTA_CHUNK frames
//
// Trigger is fire-and-forget at the SPA layer; backend returns 202
// Accepted and the actual flash happens asynchronously. Progress is
// surfaced via three WS push events emitted by net-core's task_ota /
// task_p4_ota:
//
//   ota.start    {target:"s3"|"p4", total, offset}
//   ota.progress {target, offset, total, pct}
//   ota.complete {target, ok:bool, total, err?, offset?}
//
// For P4 the `pct` is wire-confirmed — derived from P4's
// OTA_CHECKPOINT_RSP, not S3's optimistic counter. So the bar can
// only move forward when P4 has actually written that many bytes to
// flash (catches stalls instead of hiding them behind a hopeful UI).

import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";

export async function triggerOtaS3(url) {
    return call("ota.s3", { url });
}

export async function triggerOtaP4(url) {
    return call("ota.p4", { url });
}

// Progress state per target. Each entry: {state, offset, total, pct, err}.
// state ∈ "idle" | "running" | "ok" | "err".
const blank = (target) => ({ target, state: "idle", offset: 0, total: 0, pct: 0, err: "" });
export const otaProgress = signal({
    s3: blank("s3"),
    p4: blank("p4"),
});

function update(target, patch) {
    otaProgress.value = {
        ...otaProgress.value,
        [target]: { ...otaProgress.value[target], ...patch },
    };
}

on("ota.start", (e) => {
    if (!e || !e.target) return;
    update(e.target, {
        state: "running", offset: e.offset || 0,
        total:  e.total  || 0, pct: 0, err: "",
    });
});

on("ota.progress", (e) => {
    if (!e || !e.target) return;
    update(e.target, {
        state: "running", offset: e.offset || 0,
        total:  e.total  || 0, pct:    e.pct    || 0,
    });
});

on("ota.complete", (e) => {
    if (!e || !e.target) return;
    update(e.target, {
        state: e.ok ? "ok" : "err",
        total: e.total  || otaProgress.value[e.target]?.total  || 0,
        offset: e.offset || otaProgress.value[e.target]?.offset || 0,
        pct:   e.ok ? 100 : (otaProgress.value[e.target]?.pct || 0),
        err:   e.err || "",
    });
});
