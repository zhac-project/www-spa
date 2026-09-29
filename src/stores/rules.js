// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call } from "../ws/client.js";
import { createCrudStore } from "./crud.js";

const store = createCrudStore({
    name: "rule", listCmd: "rule.list", listKey: "rules", idKey: "id",
});
export const rules            = store.sig;
export const bootstrapRules   = store.bootstrap;

export function createRule(args)      { return call("rule.create", args); }
export function updateRule(args)      { return call("rule.update", args); }
export function enableRule(id, en)    { return call("rule.enable", { id, enabled: en }); }
export function deleteRule(id)        { return call("rule.delete", { id }); }
export function runRule(id)           { return call("rule.run", { id }); }

// Run status per rule id: {runs, last_fired, last_skip, ago}. A separate command
// from rule.list, which the cloud mirrors. null until the hub answers, and for
// good on firmware without rules.status (older, dual-chip, single-chip).
export const ruleStatus = signal(null);
let noRuleStatus = false;

export async function refreshRuleStatus() {
    if (noRuleStatus) return;
    try {
        const rows = await call("rules.status");
        ruleStatus.value = Object.fromEntries((rows || []).map(s => [s.id, s]));
    } catch (e) {
        if (e.message === "unknown cmd") noRuleStatus = true;   // else: next poll retries
    }
}
