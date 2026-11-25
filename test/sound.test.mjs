// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- Settings › Sound's REST calls (src/sound.js), against a stubbed fetch.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { loadSound, saveSound, playSound, stopSound } from "../src/sound.js";

let calls, reply;
const realFetch = globalThis.fetch;
beforeEach(() => {
    calls = [];
    reply = { status: 200, body: {} };
    globalThis.localStorage = { getItem: (k) => (k === "zhac_token" ? "tok123" : null) };
    globalThis.fetch = async (url, init) => {
        calls.push({ url, ...init });
        return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
    };
});
after(() => { globalThis.fetch = realFetch; delete globalThis.localStorage; });

test("GET maps max_volume to max, a missing `sounds` to [] and a missing `error` to \"\"", async () => {
    reply.body = { present: true, volume: 40, max_volume: 70, muted: false, playing: null };
    assert.deepEqual(await loadSound(), { present: true, volume: 40, max: 70, muted: false, playing: null, error: "", sounds: [] });
    assert.equal(calls[0].url, "/api/sound");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers["X-Api-Key"], "tok123");
    assert.equal(calls[0].cache, "no-store");
});

test("GET keeps the sound list and the hub's error text", async () => {
    const sounds = [{ name: "beep", ms: 120, loop: true, urgent: false }];
    reply.body = { present: false, volume: 0, max_volume: 70, muted: true, playing: "beep", sounds, error: "codec" };
    const s = await loadSound();
    assert.deepEqual(s.sounds, sounds);
    assert.equal(s.error, "codec");
    assert.equal(s.playing, "beep");
    assert.equal(s.muted, true);
});

test("saveSound PUTs the patch with the API key and answers in the same shape", async () => {
    reply.body = { present: true, volume: 55, max_volume: 70, muted: false, playing: null, sounds: [] };
    const s = await saveSound({ volume: 55 });
    assert.equal(calls[0].method, "PUT");
    assert.equal(calls[0].url, "/api/sound");
    assert.equal(calls[0].body, '{"volume":55}');
    assert.equal(calls[0].headers["X-Api-Key"], "tok123");
    assert.equal(calls[0].headers["Content-Type"], "application/json");
    assert.equal(s.max, 70);
    assert.equal(s.volume, 55);
});

test("playSound POSTs the name; stopSound POSTs nothing", async () => {
    reply.body = { ok: true };
    await playSound("doorbell");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "/api/sound/play");
    assert.equal(calls[0].body, '{"name":"doorbell"}');
    await stopSound();
    assert.equal(calls[1].method, "POST");
    assert.equal(calls[1].url, "/api/sound/stop");
    assert.equal(calls[1].body, undefined);
});

test("a refusal rejects with the hub's own text", async () => {
    reply = { status: 400, body: { error: "muted" } };
    await assert.rejects(playSound("beep"), (e) => e.message === "muted" && e.status === 400);
});

test("a body-less failure rejects with HTTP <status>; a 404 carries .status", async () => {
    reply = { status: 404, body: {} };
    await assert.rejects(loadSound(), (e) => e.message === "HTTP 404" && e.status === 404);
});

test("no token stored: the key header is empty", async () => {
    globalThis.localStorage = { getItem: () => { throw new Error("blocked"); } };
    reply.body = { present: true };
    await loadSound();
    assert.equal(calls[0].headers["X-Api-Key"], "");
});
