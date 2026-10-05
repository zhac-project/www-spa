import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtSkip, reloadText } from "../src/utils.js";

test("rule skip codes read as short phrases", () => {
    assert.equal(fmtSkip(""), "");
    assert.equal(fmtSkip(undefined), "");
    assert.equal(fmtSkip("unchanged"), "last report: no change");
    assert.equal(fmtSkip("condition_false"), "last report: condition not met");
    assert.equal(fmtSkip("action_error:zigbee.set"), "last run: zigbee.set failed");
    assert.equal(fmtSkip("something_new"), "something_new");   // a newer firmware's code shows as is
});

test("Apply's toast says how many scripts started, or that the hub is still at it", () => {
    assert.equal(reloadText({ loaded: 3, total: 3 }), "Scripts restarted: 3 of 3 started");
    assert.equal(reloadText({ loaded: 2, total: 3 }), "Scripts restarted: 2 of 3 started");
    assert.equal(reloadText({ queued: true }), "The hub is still restarting scripts");
    assert.equal(reloadText(undefined), "The hub is still restarting scripts");
});
