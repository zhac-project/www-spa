// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// CRUD-store factory. Each listable-resource store (rules, scripts, groups)
// shares the same shape: a signal holding an array of entities, one bootstrap
// call, and three event subscribers (added/updated/deleted) keyed on an id
// field. Build one via `createCrudStore` instead of copy-pasting the file.
import { signal } from "@preact/signals";
import { call, on } from "../ws/client.js";

// Build a CRUD store for a single resource.
//
//   name        — e.g. "rule" (used as event prefix: rule.added/updated/deleted)
//   listCmd     — WS command that returns the full list, e.g. "rule.list"
//   listKey     — field on the list response that holds the array, e.g. "rules"
//   idKey       — entity field used to match update/delete events, e.g. "id"
//
// Returns `{ sig, bootstrap }` — the signal and a bootstrap function.
// Subscribes to the three event types as a side effect.
export function createCrudStore({ name, listCmd, listKey, idKey }) {
    const sig = signal([]);

    async function bootstrap() {
        const data = await call(listCmd);
        sig.value = Array.isArray(data) ? data : (data?.[listKey] || []);
    }

    const sameId = (a, b) => a != null && a[idKey] === b[idKey];

    on(`${name}.added`, (r) => {
        if (!r || r[idKey] == null) return;
        if (sig.value.some(x => sameId(x, r))) return;
        sig.value = [...sig.value, r];
    });

    on(`${name}.updated`, (r) => {
        if (!r || r[idKey] == null) return;
        sig.value = sig.value.map(x => sameId(x, r) ? { ...x, ...r } : x);
    });

    on(`${name}.deleted`, (r) => {
        if (!r || r[idKey] == null) return;
        sig.value = sig.value.filter(x => !sameId(x, r));
    });

    return { sig, bootstrap };
}
