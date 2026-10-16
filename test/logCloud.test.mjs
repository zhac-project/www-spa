import { test } from "node:test";
import assert from "node:assert/strict";
import { LOG_LEVELS, levelToast, countersText } from "../src/logCloud.js";

test("the three levels, in order, with what each sends", () => {
    assert.deepEqual(LOG_LEVELS.map((l) => l.id), ["errors", "warnings", "everything"]);
    assert.deepEqual(LOG_LEVELS.map((l) => l.name), ["Errors", "Warnings", "Everything"]);
    assert.deepEqual(LOG_LEVELS.map((l) => l.meaning),
        ["Errors only.", "Warnings and errors.", "All lines, about 1–20 MB a day."]);
});

test("toasts say what changed", () => {
    assert.equal(levelToast("warnings", true), "Log to cloud on · Warnings");
    assert.equal(levelToast("everything", false), "Log to cloud: Everything");
    assert.equal(levelToast("off", true), "Log to cloud off");
});

test("counters read since the hub started, with thousands separators", () => {
    assert.equal(countersText(12345, 0), "Sent 12,345 lines · 0 dropped (since the hub started)");
    assert.equal(countersText(1, 3), "Sent 1 line · 3 dropped (since the hub started)");
    assert.equal(countersText(undefined, undefined), "Sent 0 lines · 0 dropped (since the hub started)");
});
