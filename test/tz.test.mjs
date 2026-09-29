import { test } from "node:test";
import assert from "node:assert/strict";
import { ZONES, TZDATA_VERSION } from "../src/tzdata.js";
import { ZONE_NAMES, posixFor, zoneLabel, tableZone, pickZone } from "../src/tz.js";

const KYIV = "EET-2EEST,M3.5.0/3,M10.5.0/4";

test("the table: sorted IANA names, printable POSIX strings the hub accepts", () => {
    assert.match(TZDATA_VERSION, /^20\d\d[a-z]$/);
    assert.ok(ZONE_NAMES.length > 400);
    assert.deepEqual(ZONE_NAMES, [...ZONE_NAMES].sort());
    for (const z of ZONE_NAMES) {   // what the hub's sys_set_timezone accepts
        assert.match(ZONES[z], /^[\x21-\x7e]{3,63}$/, z);
        assert.doesNotMatch(ZONES[z], /["\\]/, z);
    }
    assert.equal(posixFor("Europe/Kyiv"), KYIV);
    assert.equal(posixFor("America/New_York"), "EST5EDT,M3.2.0,M11.1.0");
    assert.equal(posixFor("Asia/Kolkata"), "IST-5:30");
    assert.equal(posixFor("Etc/UTC"), "UTC0");
    assert.equal(posixFor("Etc/GMT-3"), "<+03>-3");
    assert.equal(posixFor("Europe/Kiev"), null);   // old spellings go through tableZone
    assert.equal(posixFor("Nowhere/Town"), null);
});

test("labels read as place names", () => {
    assert.equal(zoneLabel("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos Aires");
    assert.equal(zoneLabel("Europe/Kyiv"), "Europe/Kyiv");
});

test("browser zone names map onto the table, old spellings included", () => {
    assert.equal(tableZone("Europe/Kyiv"), "Europe/Kyiv");
    assert.equal(tableZone("Europe/Kiev"), "Europe/Kyiv");        // what Chrome reports
    assert.equal(tableZone("Asia/Calcutta"), "Asia/Kolkata");
    assert.equal(tableZone("America/Buenos_Aires"), "America/Argentina/Buenos_Aires");
    assert.equal(tableZone("UTC"), "Etc/UTC");
    assert.equal(tableZone("Nowhere/Town"), null);
    assert.equal(tableZone(""), null);
    assert.equal(tableZone(undefined), null);
});

test("nothing set yet: the browser's zone, else UTC", () => {
    assert.equal(pickZone("", "Europe/Kiev"), "Europe/Kyiv");
    assert.equal(pickZone("", "Nowhere/Town"), "Etc/UTC");
    assert.equal(pickZone("", ""), "Etc/UTC");
});

test("a stored string shows the browser's zone when the rules match, else the first that has them", () => {
    assert.equal(pickZone(KYIV, "Europe/Kiev"), "Europe/Kyiv");
    assert.equal(pickZone(KYIV, "Europe/Helsinki"), "Europe/Helsinki");   // same rules, the browser's name
    const first = pickZone(KYIV, "America/New_York");
    assert.equal(posixFor(first), KYIV);
    assert.equal(first, ZONE_NAMES.find((z) => ZONES[z] === KYIV));
    assert.equal(pickZone("UTC0", ""), "Etc/UTC");
});

test("a string not in the table is left alone", () => {
    assert.equal(pickZone("CET-1CEST-2,M3.5.0,M10.5.0/3x", "Europe/Kiev"), null);
});
