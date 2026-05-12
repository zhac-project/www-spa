// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call } from "../ws/client.js";

// Unhandled ZCL frames diagnostic entries.
// Entry: { cluster, id, cs, count, last_seen, ieee }
export const diag = signal([]);

export async function bootstrapDiag() {
    const data = await call("diagnostics.unhandled.get");
    diag.value = Array.isArray(data) ? data : (data?.entries || []);
}
