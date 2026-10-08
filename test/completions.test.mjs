import { test } from "node:test";
import assert from "node:assert/strict";
import { ZHAC_API } from "../src/editor/zhac-completions.js";

// The generator (tools/gen-zhac-completions.js) takes `zhac.*` headings from LUA_API.md; only functions may
// become completions, not a troubleshooting heading such as "zhac.sleep: timer pool exhausted".
test("every completion is a zhac function", () => {
    assert.ok(ZHAC_API.length > 0);
    for (const e of ZHAC_API) assert.match(e.label, /^zhac\.\w+$/);
});
