// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- the demo hub (tools/demo-server.mjs) answers a profile config as the firmware does.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let demo, ws, seq = 0;
const waits = new Map();
const call = (cmd, args = {}) => new Promise((resolve) => {
    const id = ++seq;
    waits.set(id, resolve);
    ws.send(JSON.stringify({ id, cmd, args }));
});

before(async () => {
    const port = await new Promise((res) => {
        const s = net.createServer();
        s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
    });
    demo = spawn(process.execPath, ["tools/demo-server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(port) } });
    await new Promise((resolve, reject) => {
        demo.stdout.on("data", (d) => { if (/demo hub/.test(d)) resolve(); });
        demo.on("exit", (code) => reject(new Error(`demo server exited with ${code}`)));
    });
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id != null && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
    });
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
});

after(() => { ws?.close(); demo?.kill(); });

test("alarm.config.set refuses a profile id the firmware would refuse, in its words", async () => {
    const { data } = await call("alarm.get");
    const { codes_count: _n, ...config } = data.config;
    const withId = (id) => ({ config: { ...config, profiles: config.profiles.map((p, i) => (i === 1 ? { ...p, id } : p)) } });
    for (const id of ["", "Away2", "1abc", "a-b", "abcdefghijklmn", undefined]) {   // undefined: no id at all
        const r = await call("alarm.config.set", withId(id));
        assert.equal(r.ok, false, `id ${JSON.stringify(id)}`);
        assert.equal(r.err, "profiles[1]: id must be 1-13 of a-z, 0-9 and _, starting with a letter");
    }
    assert.equal((await call("alarm.get")).data.config.profiles[1].id, "home", "a refused config changes nothing");
    assert.equal((await call("alarm.config.set", withId("a_1"))).ok, true, "a good id is taken");
    assert.equal((await call("alarm.get")).data.config.profiles[1].id, "a_1");
});
