// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// OTA store — the WS `ota.update` call + progress state from the hub's push
// events (zhac-wired-core main/ota_update.cpp), all with target "self":
//
//   ota.start    {target, total, offset}
//   ota.progress {target, offset, total, pct}
//   ota.complete {target, ok:bool, total, err?, offset?}

import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";

// The hub refuses an older release unless allowOlder (firmware review
// 2026-10-24 HS-10).
export async function triggerOtaSelf(url, allowOlder = false) {
    return call("ota.update", allowOlder ? { url, allow_older: true } : { url });
}

// Progress state per target. Each entry: {state, offset, total, pct, err}.
// state ∈ "idle" | "running" | "ok" | "err".
const blank = (target) => ({ target, state: "idle", offset: 0, total: 0, pct: 0, err: "" });
export const otaProgress = signal({ self: blank("self") });

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
