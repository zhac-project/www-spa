// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- pure merge behind the attr.bulk push (stores/devices.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAttrBulk } from "../src/utils/deviceMerge.js";

const plug  = { ieee: "0x00158D0007A1B2C3", name: "plug", attrs: { state: 0 }, lqi: 90, last_seen: 100 };
const other = { ieee: "0x00158D0007A1B2C4", name: "lamp", attrs: { state: 1 }, lqi: 70, last_seen: 100 };

test("an entry merges into its row, IEEE case-insensitive; other rows keep their refs", () => {
    const out = mergeAttrBulk([plug, other], [{ ieee: "0x00158d0007a1b2c3", attrs: { state: 1 }, last_seen: 200 }]);
    assert.deepEqual(out[0], { ...plug, attrs: { state: 1 }, last_seen: 200 });
    assert.equal(out[1], other);
});

test("entries for one device fold in order", () => {
    const out = mergeAttrBulk([plug], [
        { ieee: plug.ieee, attrs: { state: 1, power: 5 }, lqi: 80 },
        { ieee: plug.ieee, attrs: { power: 7 } },
    ]);
    assert.deepEqual(out[0].attrs, { state: 1, power: 7 });
    assert.equal(out[0].lqi, 80);
});

test("nothing to apply leaves the list as it is", () => {
    const list = [plug];
    assert.equal(mergeAttrBulk(list, []), list);
    assert.equal(mergeAttrBulk(list, null), list);
    assert.equal(mergeAttrBulk(list, [{ ieee: plug.ieee }]), list);   // no attrs: not an update
});

// research 2026-11-18 B7: a mains device that let its availability ping go unanswered
test("offline from the ping: set, cleared, and kept by an entry that does not say", () => {
    let list = mergeAttrBulk([plug], [{ ieee: plug.ieee, offline: true, attrs: {} }]);
    assert.equal(list[0].offline, true);
    assert.deepEqual(list[0].attrs, plug.attrs);
    list = mergeAttrBulk(list, [{ ieee: plug.ieee, attrs: { power: 3 } }]);
    assert.equal(list[0].offline, true);
    list = mergeAttrBulk(list, [{ ieee: plug.ieee, offline: false, last_seen: 300, attrs: {} }]);
    assert.equal(list[0].offline, false);
    assert.equal(list[0].last_seen, 300);
});
