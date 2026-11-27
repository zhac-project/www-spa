// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Settings > Remote > "Cloud control" and "Allow the cloud to disarm the alarm" (HL-02, HL-03): the option texts
// and the settings payloads. The hub validates and decides; the page shows the value the hub reports. No
// imports, so `npm test` can load it.

export const CLOUD_LEVELS = [
    { id: "view",    label: "View only — the cloud shows states" },
    { id: "devices", label: "Devices — the cloud can switch devices" },
    { id: "full",    label: "Devices and rules — the cloud can also change rules, open pairing and read logs and scripts" },
];

export const ALARM_HINT = "Off: the cloud and the app can arm the alarm but not disarm it.";

export const levelPatch = (id) => ({ remote_level: id });
export const alarmPatch = (on) => ({ remote_alarm: !!on });

const TOAST = { view: "view only", devices: "devices", full: "devices and rules" };

export const levelToast = (id) => `Cloud control: ${TOAST[id] ?? id}`;
