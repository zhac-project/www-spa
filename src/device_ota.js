// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Zigbee device firmware update, on hubs that report device_ota (research 2026-11-18 C2): words for the hub's
// update state and error codes. The hub decides everything (device_ota_core.h); the page only words it.
const hex = (n, w) => "0x" + (Number(n) >>> 0).toString(16).toUpperCase().padStart(w, "0");

const ERRORS = {
    no_device: "No device was named.",
    octet_stream_required: "The page sent the file in a form the hub does not take.",
    not_an_ota_file: "This is not a Zigbee OTA file: there is no OTA header in it.",
    incomplete: "The file did not arrive whole. Try again.",
    too_large: "The file is larger than 4 MB.",
    unknown_device: "The hub does not know this device.",
    radio_down: "The Zigbee radio is not running.",
    radio_busy: "The Zigbee radio is busy. Try again in a moment.",
    busy: "Another device is updating. Wait for it to end, or cancel it on its page.",
    no_memory: "The hub has no room for the file right now.",
};

export function otaError(j, status) {
    const code = j && j.error;
    return code ? ERRORS[code] || code : `HTTP ${status}`;
}

export function otaPct(s) {
    const p = Math.round(Number(s && s.pct) || 0);
    return Math.max(0, Math.min(100, p));
}

// The device's Upgrade End statuses (ZCL): why it refused the image.
const DEVICE_STATUS = {
    0x95: "it stopped the update",
    0x96: "the image failed the device's own check",
    0x99: "it needs another image first",
};

const FAILED = {
    device_left: "The device left the hub. It keeps its firmware.",
    device_aborted: "The download stopped before the end. The device keeps its firmware; try again.",
};

// One line for the hub's update state (GET /api/device/ota).
export function otaStateText(s) {
    switch (s && s.state) {
    case "waiting":
        if (s.fits === false) {
            return `The device asks for manufacturer ${hex(s.device_manuf, 4)}, image type ${hex(s.device_image_type, 4)}; ` +
                   `this file is for ${hex(s.manuf, 4)}, image type ${hex(s.image_type, 4)}. It will not take it: ` +
                   "cancel, and pick the file made for this device.";
        }
        if (s.device_version != null) return `Waiting for the device. It runs ${hex(s.device_version, 8)}.`;
        return "Waiting for the device to ask for the image. A device that sleeps asks when it wakes: " +
               "press one of its buttons.";
    case "sending":
        return `Sending the image: ${otaPct(s)} %. Keep the device powered.`;
    case "done":
        if (s.reason === "same_version") return `The device already runs this version (${hex(s.file_version, 8)}).`;
        if (s.device_version === s.file_version) return `Updated: the device runs ${hex(s.file_version, 8)} now.`;
        return `The device has the whole image (${hex(s.file_version, 8)}) and restarts with it.`;
    case "failed":
        if (s.reason === "device_status") {
            return "The device refused the image: " +
                   (DEVICE_STATUS[s.device_status] || `status ${hex(s.device_status, 2)}`) + ". It keeps its firmware.";
        }
        return FAILED[s.reason] || `The update failed (${s.reason || "no reason given"}).`;
    case "cancelled":
        return "Cancelled. The device keeps its firmware.";
    default:
        return "";
    }
}
