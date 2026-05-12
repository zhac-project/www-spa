// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { call } from "../ws/client.js";
import { createCrudStore } from "./crud.js";

// Group: { id, name, members: [{ ieee, ep }] }
const store = createCrudStore({
    name: "group", listCmd: "group.list", listKey: "groups", idKey: "id",
});
export const groups          = store.sig;
export const bootstrapGroups = store.bootstrap;

export function createGroup(args) { return call("group.create", args); }
export function updateGroup(args) { return call("group.update", args); }
export function deleteGroup(id)   { return call("group.delete", { id }); }
export function getGroup(id)      { return call("group.get",    { id }); }
export function groupCmd(args)    { return call("group.cmd",    args); }
