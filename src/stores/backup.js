// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Backup and restore of what you build on a hub: device names, rules, Lua
// scripts and collections. It runs over the ordinary API calls, so it works
// the same on every ZHAC firmware. Not included: the Zigbee network itself
// (keys, PAN id — devices re-pair on a new radio) and settings that hold
// credentials (MQTT broker URL, passwords).
import { call } from "../ws/client.js";
import { writeScript } from "./scripts.js";
export { describeBackup, NOT_IN_BACKUP } from "../backup_preview.js";

import { BACKUP_FORMAT } from "../backup_preview.js";
export { BACKUP_FORMAT };
const rows = (d, key) => (Array.isArray(d) ? d : (d?.[key] || []));
const lc = (s) => String(s || "").toLowerCase();

export async function createBackup(status = {}) {
    const [devices, rules, scripts, groups] = await Promise.all([
        call("device.list"), call("rule.list"), call("script.list"), call("group.list"),
    ]);
    const bodies = [];
    for (const s of rows(scripts, "scripts")) {
        const r = await call("script.read", { name: s.name });
        bodies.push({ name: s.name, src: typeof r?.src === "string" ? r.src : "" });
    }
    return {
        zhac_backup: BACKUP_FORMAT,
        created: new Date().toISOString(),
        firmware: status.fw_version || status.fw || "",
        hub: status.hostname || "",
        devices: rows(devices, "devices").map((d) => ({ ieee: d.ieee, name: d.name || d.friendly || "" })),
        rules: rows(rules, "rules").map((r) => ({ name: r.name || "", dsl: r.dsl || "", enabled: r.enabled !== false })),
        scripts: bodies,
        collections: rows(groups, "groups").map((g) => ({
            name: g.name,
            members: (g.members || []).map((m) => ({ ieee: m.ieee, ep: m.ep || 1 })),
        })),
    };
}

export function downloadJson(obj, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Merge a backup into this hub: renames devices that are paired here, adds
// or updates rules and collections by name, writes scripts. Never deletes.
// Returns counts plus a list of what was skipped and why.
export async function restoreBackup(b) {
    if (!b || b.zhac_backup !== BACKUP_FORMAT) throw new Error("This is not a ZHAC backup file.");
    const out = { names: 0, rules: 0, scripts: 0, collections: 0, skipped: [] };
    const paired = new Set(rows(await call("device.list"), "devices").map((d) => lc(d.ieee)));

    for (const d of b.devices || []) {
        if (!d.name) continue;
        if (!paired.has(lc(d.ieee))) { out.skipped.push(`${d.name}: not paired on this hub`); continue; }
        try { await call("device.rename", { ieee: d.ieee, name: d.name }); out.names++; }
        catch (e) { out.skipped.push(`${d.name}: ${e.message}`); }
    }

    let here = rows(await call("rule.list"), "rules");
    for (const r of b.rules || []) {
        const same = here.find((x) => x.name === r.name);
        try {
            if (same) await call("rule.update", { id: same.id, name: r.name, dsl: r.dsl });
            else      await call("rule.create", { name: r.name, dsl: r.dsl });
            out.rules++;
        } catch (e) { out.skipped.push(`rule "${r.name}": ${e.message}`); }
    }
    here = rows(await call("rule.list"), "rules");      // new rules are enabled: apply the saved state
    for (const r of b.rules || []) {
        const now = here.find((x) => x.name === r.name);
        if (now && (now.enabled !== false) !== r.enabled) {
            try { await call("rule.enable", { id: now.id, enabled: r.enabled }); } catch (_) { /* reported above */ }
        }
    }

    for (const s of b.scripts || []) {
        try { await writeScript(s.name, s.src); out.scripts++; }
        catch (e) { out.skipped.push(`script "${s.name}": ${e.message}`); }
    }

    let groups = rows(await call("group.list"), "groups");
    for (const g of b.collections || []) {
        try {
            let id = groups.find((x) => x.name === g.name)?.id;
            if (id == null) {
                const r = await call("group.create", { name: g.name });
                id = r?.id ?? r?.group?.id;
                if (id == null) {
                    groups = rows(await call("group.list"), "groups");
                    id = groups.find((x) => x.name === g.name)?.id;
                }
            }
            if (id == null) throw new Error("the hub did not return its id");
            const members = (g.members || []).filter((m) => paired.has(lc(m.ieee)));
            await call("group.update", { id, members });
            out.collections++;
        } catch (e) { out.skipped.push(`collection "${g.name}": ${e.message}`); }
    }
    return out;
}
