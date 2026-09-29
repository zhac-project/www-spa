import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtSkip } from "../src/utils.js";

test("rule skip codes read as short phrases", () => {
    assert.equal(fmtSkip(""), "");
    assert.equal(fmtSkip(undefined), "");
    assert.equal(fmtSkip("unchanged"), "last report: no change");
    assert.equal(fmtSkip("condition_false"), "last report: condition not met");
    assert.equal(fmtSkip("action_error:zigbee.set"), "last run: zigbee.set failed");
    assert.equal(fmtSkip("something_new"), "something_new");   // a newer firmware's code shows as is
});
