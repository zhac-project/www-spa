// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Zigbee device firmware update, on hubs that report device_ota (research 2026-11-18 C2): the hub's REST calls.
// Words for its states and errors: ../device_ota.js.
import { otaError } from "../device_ota.js";

function headers(type) {
    const h = { "Cache-Control": "no-store" };
    if (type) h["Content-Type"] = type;
    try { const t = localStorage.getItem("zhac_token"); if (t) h["X-Api-Key"] = t; } catch (_) {}
    return h;
}

async function hub(path, init) {
    const r = await fetch(path, { cache: "no-store", ...init });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(otaError(j, r.status));
    return j;
}

// The update the hub runs, or {state: "idle"}.
export const otaState = () => hub("/api/device/ota", { headers: headers() });

// The hub checks the file, holds it and tells the device; resolves with {manuf, image_type, file_version, size}.
export const otaUpload = (ieee, file) =>
    hub(`/api/device/ota?ieee=${encodeURIComponent(ieee)}`,
        { method: "POST", headers: headers("application/octet-stream"), body: file });

// Resolves with the state after the cancel.
export const otaCancel = () => hub("/api/device/ota/cancel", { method: "POST", headers: headers() });
