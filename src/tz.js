// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings > Time: people pick an IANA zone ("Europe/Kyiv"), the hub stores
// the POSIX TZ string it runs on ("EET-2EEST,M3.5.0/3,M10.5.0/4"). This only
// looks names up in the generated table (src/tzdata.js); the hub does every
// piece of time arithmetic itself.
import { ZONES } from "./tzdata.js";

export const ZONE_NAMES = Object.keys(ZONES);   // sorted by the generator

export const posixFor = (zone) => ZONES[zone] || null;

export const zoneLabel = (zone) => zone.replace(/_/g, " ");

// The browser's own zone. Blank where Intl cannot say.
export function browserZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
    catch (_) { return ""; }
}

function canonical(name) {
    try { return new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone; }
    catch (_) { return null; }   // a name this browser does not know
}

// `name` as a table key. Browsers report some zones by older names
// ("Europe/Kiev", "Asia/Calcutta"); Intl maps both spellings to one id, so
// the table needs no alias list.
let byCanonical = null;
export function tableZone(name) {
    if (!name) return null;
    if (ZONES[name]) return name;
    const id = canonical(name);
    if (!id) return null;
    if (!byCanonical) {
        byCanonical = new Map();
        for (const z of ZONE_NAMES) {
            const c = canonical(z);
            if (c && !byCanonical.has(c)) byCanonical.set(c, z);
        }
    }
    return byCanonical.get(id) || null;
}

// The zone to show for the hub's `timezone` status field:
//   ""               never set, the hub runs on UTC: the browser's zone
//   a table string   the browser's zone if it has exactly these rules, else
//                    the first zone that does (several zones share a string)
//   anything else    null -- set some other way; shown as-is, never overwritten
export function pickZone(posix, browser) {
    const mine = tableZone(browser);
    if (!posix) return mine || "Etc/UTC";
    if (mine && ZONES[mine] === posix) return mine;
    return ZONE_NAMES.find((z) => ZONES[z] === posix) || null;
}
