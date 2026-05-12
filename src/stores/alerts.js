// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";

// Alert: { code, ieee?, msg, ts }. Oldest first to match REST contract.
export const alerts = signal([]);

export async function bootstrapAlerts() {
    const data = await call("alerts.get");
    alerts.value = Array.isArray(data) ? data : (data?.alerts || []);
}

on("alert.added", (a) => {
    if (!a) return;
    alerts.value = [...alerts.value, a];
});
