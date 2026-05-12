// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
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
