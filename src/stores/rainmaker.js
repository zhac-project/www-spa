// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// RainMaker bridge store — thin WS-call wrappers around the cloud-uplink
// selector and the RainMaker agent (Tasks 9-18, firmware side). No push
// events exist for this feature yet, so there's no signal here: the
// Settings page pulls status on demand (see UplinkCard / RainMakerCard
// in pages/Settings.jsx, which mirror RemoteCard's own poll-on-mount
// pattern rather than a global store signal).
import { call } from "../ws/client.js";

// Uplink selector — mode ∈ "none" | "custom_mqtt" | "rainmaker".
// uplinkSet's reply may carry `reboot_required: true` when switching AWAY
// from "rainmaker": the RainMaker SDK can't be de-initialised at runtime,
// so the agent keeps running until the device reboots.
export function uplinkGet()     { return call("uplink.get"); }
export function uplinkSet(mode) { return call("uplink.set", { mode }); }

// RainMaker agent status/association.
// state ∈ "disabled" | "init_claim" | "connecting" | "unassociated" |
//         "ready" | "backoff" | "claim_failed"
export function rainmakerStatus() { return call("rainmaker.status"); }
export function rainmakerAssoc(userId, secret) {
    return call("rainmaker.assoc.set", { user_id: userId, secret });
}

// Per-device RainMaker bridging — consumed by the device-detail toggle
// (Task 20), not by this task's Settings UI.
export function deviceRainmakerList()        { return call("device.rainmaker.list"); }
export function deviceRainmakerAdd(ieee)     { return call("device.rainmaker.add",    { ieee }); }
export function deviceRainmakerRemove(ieee)  { return call("device.rainmaker.remove", { ieee }); }
