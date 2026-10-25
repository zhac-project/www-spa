// node --test -- review 2026-10-24 HS-12: the hub closes a WebSocket session on a frame over
// 8 KB, so the editor's syntax check sends a long source over REST instead of on the socket.
// The WebSocket client connects when imported: it gets a socket that is open and records what
// it sends; fetch records the REST calls. The theme store reads matchMedia and document.
import { test } from "node:test";
import assert from "node:assert/strict";

const sent = [];
const posts = [];
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document = { documentElement: { dataset: {} } };
globalThis.location = { protocol: "http:", host: "hub.local" };
globalThis.WebSocket = class { static OPEN = 1; readyState = 1; addEventListener() {} send(t) { sent.push(t); } };
globalThis.fetch = async (url, init) => {
    posts.push({ url, init });
    return { ok: true, json: async () => ({ ok: false, err: "'end' expected", line: 3 }) };
};

const { frameTooLarge } = await import("../src/ws/frame.js");
const { checkScript } = await import("../src/stores/scripts.js");
const { status } = await import("../src/stores/status.js");

const longSrc = "x = 1\n".repeat(2000);   // 12,000 bytes

test("frameTooLarge counts UTF-8 bytes against the hub's 8 KB cap", () => {
    assert.equal(frameTooLarge("a".repeat(8192)), false);
    assert.equal(frameTooLarge("a".repeat(8193)), true);
    assert.equal(frameTooLarge("я".repeat(4097)), true, "4097 Cyrillic letters are 8194 bytes");
});

test("checkScript: a source too long for one frame is checked over REST, not sent on the socket", async () => {
    status.value = { uptime: 1, sku: "wired" };
    posts.length = 0;
    assert.deepEqual(await checkScript(longSrc), { ok: false, err: "'end' expected", line: 3 });
    assert.equal(sent.length, 0);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, "/api/scripts/check/check");
    assert.equal(posts[0].init.method, "POST");
    assert.equal(posts[0].init.body, longSrc);
});

test("checkScript: the dual-chip hub has no REST check (it would save a script named check)", async () => {
    status.value = { uptime: 1, p4: true };
    posts.length = 0;
    await assert.rejects(checkScript(longSrc), /too_large/);
    assert.equal(posts.length, 0);
    assert.equal(sent.length, 0);
});
