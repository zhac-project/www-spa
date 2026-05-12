// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";

// Whole-system status snapshot. Shape matches what `api_status_get`
// produces today (see /api/status in rest_ops.cpp).
export const status = signal({});

export async function bootstrapStatus() {
    const data = await call("status.get");
    status.value = data || {};
}

on("status.tick", (s) => {
    // status.tick is a periodic delta — merge so fields the server
    // omits stay as their last-known value.
    if (s) status.value = { ...status.value, ...s };
});
