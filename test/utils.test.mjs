import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtSkip, reloadText, reloadKind, heldText, mergeTick } from "../src/utils.js";

test("rule skip codes read as short phrases", () => {
    assert.equal(fmtSkip(""), "");
    assert.equal(fmtSkip(undefined), "");
    assert.equal(fmtSkip("unchanged"), "last report: no change");
    assert.equal(fmtSkip("condition_false"), "last report: condition not met");
    assert.equal(fmtSkip("action_error:zigbee.set"), "last run: zigbee.set failed");
    assert.equal(fmtSkip("something_new"), "something_new");   // a newer firmware's code shows as is
});

test("Apply's toast says how many scripts started, how many failed, or that the hub is still at it", () => {
    assert.equal(reloadText({ loaded: 3, total: 3 }), "Scripts restarted: 3 of 3 started");
    assert.equal(reloadText({ loaded: 2, total: 3 }), "Scripts restarted: 2 of 3 started. 1 failed: see Log.");
    assert.equal(reloadText({ queued: true }), "The hub is still restarting scripts");
    assert.equal(reloadText(undefined), "The hub is still restarting scripts");
});

test("Apply's toast is an error when a script did not start, neutral while the hub is still at it", () => {
    assert.equal(reloadKind({ loaded: 3, total: 3 }), "ok");
    assert.equal(reloadKind({ loaded: 0, total: 0 }), "ok");   // no scripts: nothing failed
    assert.equal(reloadKind({ loaded: 2, total: 3 }), "err");
    assert.equal(reloadKind({ loaded: 0, total: 1 }), "err");
    assert.equal(reloadKind({ queued: true }), "info");
    assert.equal(reloadKind(undefined), "info");
});

test("a status tick keeps what it leaves out, but a tick without scripts_held ends the hold", () => {
    const shown = { remote_scripts: true, uptime: 5, scripts_held: "pump" };
    // While held the firmware puts scripts_held in every tick: the banner stays.
    assert.deepEqual(mergeTick(shown, { uptime: 15, scripts_held: "pump" }),
                     { remote_scripts: true, uptime: 15, scripts_held: "pump" });
    // A cloud Apply ended the hold: the next tick has no scripts_held, and the banner goes (status.get not needed).
    assert.deepEqual(mergeTick(shown, { uptime: 25 }), { remote_scripts: true, uptime: 25 });
    // Firmware that never holds: nothing changes but the merge.
    assert.deepEqual(mergeTick({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
});

test("the Scripts page says why the hub held its scripts", () => {
    assert.equal(heldText("pump"),
        "Scripts are not running: the hub restarted twice in a row while they were starting, the last time " +
        "while loading \"pump\". Fix or delete that script, then press Apply.");
    assert.equal(heldText(""),
        "Scripts are not running: the hub restarted twice in a row while they were starting. Fix or delete " +
        "the script that crashed it, then press Apply.");
});
