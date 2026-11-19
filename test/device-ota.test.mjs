// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { otaError, otaStateText, otaPct } from "../src/device_ota.js";

test("every error code the hub sends has words", () => {
    for (const code of ["no_device", "octet_stream_required", "not_an_ota_file", "incomplete", "too_large", "unknown_device",
                        "radio_down", "radio_busy", "busy", "no_memory"]) {
        const t = otaError({ error: code }, 400);
        assert.ok(t && t !== code && !t.startsWith("HTTP"), code);
    }
    assert.equal(otaError({ error: "new_code" }, 400), "new_code");
    assert.equal(otaError(null, 502), "HTTP 502");
});

test("pct stays within 0..100", () => {
    assert.equal(otaPct({ pct: 42 }), 42);
    assert.equal(otaPct({ pct: 140 }), 100);
    assert.equal(otaPct({ pct: -3 }), 0);
    assert.equal(otaPct({}), 0);
    assert.equal(otaPct(null), 0);
});

const base = { ieee: "0x00158D0001020304", manuf: 0x117c, image_type: 0x2101, file_version: 0x23086631, fits: true };

test("waiting: before and after the device asked", () => {
    assert.match(otaStateText({ ...base, state: "waiting" }), /press one of its buttons/);
    assert.match(otaStateText({ ...base, state: "waiting", device_version: 0x22000000 }), /runs 0x22000000/);
});

test("waiting: the device asks for another image, both shown", () => {
    const t = otaStateText({ ...base, state: "waiting", fits: false, device_manuf: 0x1002, device_image_type: 0x0001,
                             device_version: 1 });
    assert.match(t, /0x1002/);
    assert.match(t, /0x0001/);
    assert.match(t, /0x117C/);
    assert.match(t, /0x2101/);
});

test("sending shows the percentage", () => {
    assert.match(otaStateText({ ...base, state: "sending", pct: 37 }), /37 %/);
});

test("done: whole image, then running the new version, or already on it", () => {
    assert.match(otaStateText({ ...base, state: "done", device_version: 0x22000000 }), /restarts/);
    assert.match(otaStateText({ ...base, state: "done", device_version: 0x23086631 }), /runs 0x23086631/);
    assert.match(otaStateText({ ...base, state: "done", reason: "same_version" }), /already runs/);
});

test("failed: the reason in words", () => {
    assert.match(otaStateText({ ...base, state: "failed", reason: "device_status", device_status: 0x96 }), /check/);
    assert.match(otaStateText({ ...base, state: "failed", reason: "device_status", device_status: 0x81 }), /0x81/);
    assert.match(otaStateText({ ...base, state: "failed", reason: "device_left" }), /left/);
    assert.match(otaStateText({ ...base, state: "failed", reason: "device_aborted" }), /stopped/);
    assert.match(otaStateText({ ...base, state: "failed", reason: "odd" }), /odd/);
});

test("cancelled, idle", () => {
    assert.match(otaStateText({ ...base, state: "cancelled" }), /keeps its firmware/);
    assert.equal(otaStateText({ state: "idle" }), "");
});
