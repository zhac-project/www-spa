// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- pure ordering behind the Devices page column headers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortDevices, nextSort, parseSort } from "../src/utils/deviceSort.js";

const T = 1_800_000_000; // a plausible epoch second
const dev = (ieee, extra = {}) => ({ ieee, ...extra });
const ids = (list) => list.map((d) => d.ieee);

test("name: case-insensitive, numbers by value, A to Z", () => {
    const list = [
        dev("e1", { name: "lamp 10" }),
        dev("e2", { name: "Lamp 2" }),
        dev("e3", { name: "bedroom" }),
        dev("e4", { name: "Attic" }),
    ];
    assert.deepEqual(ids(sortDevices(list, "name", "asc")), ["e4", "e3", "e2", "e1"]);
    assert.deepEqual(ids(sortDevices(list, "name", "desc")), ["e1", "e2", "e3", "e4"]);
});

test("name: a row with no name sorts by the IEEE it displays", () => {
    const list = [dev("0x0002"), dev("0x0001", { name: "" }), dev("0x0003", { name: "Zed" })];
    assert.deepEqual(ids(sortDevices(list, "name", "asc")), ["0x0001", "0x0002", "0x0003"]);
});

test("last seen: ascending = most recently seen first", () => {
    const list = [
        dev("old",    { last_seen: T - 3600 }),
        dev("new",    { last_seen: T - 5 }),
        dev("middle", { last_seen: T - 600 }),
    ];
    assert.deepEqual(ids(sortDevices(list, "last_seen", "asc")), ["new", "middle", "old"]);
    assert.deepEqual(ids(sortDevices(list, "last_seen", "desc")), ["old", "middle", "new"]);
});

test("missing values go last in both directions", () => {
    const list = [
        dev("never",  { name: "A" }),
        dev("zero",   { name: "B", last_seen: 0 }),
        dev("junk",   { name: "C", last_seen: 5 }),          // pre-2020: shows "—"
        dev("seen",   { name: "D", last_seen: T }),
        dev("nolqi",  { name: "E" }),
        dev("lqi0",   { name: "F", lqi: 0 }),
        dev("lqi200", { name: "G", lqi: 200 }),
        dev("novend", { name: "H", vendor: "" }),
        dev("vend",   { name: "I", vendor: "Aqara" }),
    ];
    for (const dir of ["asc", "desc"]) {
        assert.equal(ids(sortDevices(list, "last_seen", dir))[0], "seen", dir);
        assert.deepEqual(ids(sortDevices(list, "last_seen", dir)).slice(1).sort(),
            ["junk", "lqi0", "lqi200", "never", "nolqi", "novend", "vend", "zero"], dir);
        const lqi = ids(sortDevices(list, "lqi", dir));
        assert.deepEqual(lqi.slice(0, 2), dir === "asc" ? ["lqi0", "lqi200"] : ["lqi200", "lqi0"], dir);
        assert.equal(ids(sortDevices(list, "vendor", dir))[0], "vend", dir);
    }
});

test("lqi: 0 is a value, lowest first when ascending", () => {
    const list = [dev("a", { lqi: 120 }), dev("b", { lqi: 0 }), dev("c", { lqi: 30 })];
    assert.deepEqual(ids(sortDevices(list, "lqi", "asc")), ["b", "c", "a"]);
    assert.deepEqual(ids(sortDevices(list, "lqi", "desc")), ["a", "c", "b"]);
});

test("vendor and model sort as text, empty ones last", () => {
    const list = [
        dev("a", { name: "x", model: "TS0601" }),
        dev("b", { name: "y", model: "ts011f" }),
        dev("c", { name: "z" }),
    ];
    assert.deepEqual(ids(sortDevices(list, "model", "asc")), ["b", "a", "c"]);
    assert.deepEqual(ids(sortDevices(list, "model", "desc")), ["a", "b", "c"]);
});

test("ties fall back to name, then IEEE, in either direction", () => {
    const list = [
        dev("e3", { name: "Plug", vendor: "IKEA" }),
        dev("e2", { name: "Plug", vendor: "IKEA" }),
        dev("e1", { name: "Bulb", vendor: "IKEA" }),
        dev("e4", { name: "Door", vendor: "Aqara" }),
    ];
    for (const dir of ["asc", "desc"]) {
        const got = ids(sortDevices(list, "vendor", dir));
        const ikea = got.filter((i) => i !== "e4");
        assert.deepEqual(ikea, ["e1", "e2", "e3"], dir);
    }
    assert.equal(ids(sortDevices(list, "vendor", "asc"))[0], "e4");
    assert.equal(ids(sortDevices(list, "vendor", "desc"))[3], "e4");
});

test("stable: the same input always gives the same order, input untouched", () => {
    const list = [dev("b", { name: "x" }), dev("a", { name: "x" }), dev("c", { name: "x" })];
    const copy = list.slice();
    const once = ids(sortDevices(list, "name", "asc"));
    assert.deepEqual(once, ["a", "b", "c"]);
    assert.deepEqual(ids(sortDevices(list.slice().reverse(), "name", "asc")), once);
    assert.deepEqual(list, copy);
});

test("unknown column returns the list as is", () => {
    const list = [dev("b"), dev("a")];
    assert.equal(sortDevices(list, "constructor", "asc"), list);
    assert.equal(sortDevices(list, undefined, "asc"), list);
});

test("nextSort: same column reverses, a new one starts ascending", () => {
    assert.deepEqual(nextSort(null, "name"), { col: "name", dir: "asc" });
    assert.deepEqual(nextSort({ col: "name", dir: "asc" }, "name"), { col: "name", dir: "desc" });
    assert.deepEqual(nextSort({ col: "name", dir: "desc" }, "name"), { col: "name", dir: "asc" });
    assert.deepEqual(nextSort({ col: "name", dir: "desc" }, "lqi"), { col: "lqi", dir: "asc" });
});

test("parseSort: accepts a saved choice, rejects anything else", () => {
    assert.deepEqual(parseSort('{"col":"last_seen","dir":"desc"}'), { col: "last_seen", dir: "desc" });
    for (const bad of [null, "", "nope", "{}", '{"col":"name"}', '{"col":"x","dir":"asc"}',
                       '{"col":"name","dir":"up"}', '{"col":"constructor","dir":"asc"}', "null"]) {
        assert.equal(parseSort(bad), null, String(bad));
    }
});
