// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreBody, passwordBytes, fullBackupError, fullBackupName, uploadRestore, waitForRestart }
    from "../src/full_backup.js";

test("restoreBody: u16 LE password length, the password as UTF-8, then the file", async () => {
    const file = new Blob([new Uint8Array([0xAA, 0xBB, 0xCC])]);
    const b = new Uint8Array(await restoreBody("pässwörd", file).arrayBuffer());
    const pw = new TextEncoder().encode("pässwörd");
    assert.equal(pw.length, 10, "(two 2-byte letters)");
    assert.deepEqual([...b.slice(0, 2)], [10, 0]);
    assert.deepEqual([...b.slice(2, 12)], [...pw]);
    assert.deepEqual([...b.slice(12)], [0xAA, 0xBB, 0xCC]);
    const long = new Uint8Array(await restoreBody("x".repeat(300), file).arrayBuffer());
    assert.deepEqual([...long.slice(0, 2)], [300 & 0xFF, 300 >> 8], "high byte second");
});

test("passwordBytes: bytes as the hub counts them, not characters", () => {
    assert.equal(passwordBytes("abcdefgh"), 8);
    assert.equal(passwordBytes("пароль12"), 14);
});

test("fullBackupError: the hub's codes in words, with what it named", () => {
    assert.match(fullBackupError({ error: "wrong_password" }, 400), /wrong password/i);
    assert.match(fullBackupError({ error: "partitions_differ", partition: "zhac_data" }, 409), /zhac_data/);
    assert.match(fullBackupError({ error: "newer_firmware", fw: "v2026120101" }, 409), /v2026120101/);
    assert.match(fullBackupError({ error: "on_trial" }, 409), /update/i);
    assert.equal(fullBackupError({ error: "something_new" }, 500), "something_new");
    assert.equal(fullBackupError(null, 502), "HTTP 502");
});

test("fullBackupName: the hub's file name, or a plain one", () => {
    assert.equal(fullBackupName('attachment; filename="zhac-full-zhac-20261119.zhacbak"'), "zhac-full-zhac-20261119.zhacbak");
    assert.equal(fullBackupName(null), "zhac-full.zhacbak");
    assert.equal(fullBackupName('attachment; filename="../x"'), "zhac-full.zhacbak", "nothing with a path in it");
    assert.equal(fullBackupName('attachment; filename="a/b.zhacbak"'), "zhac-full.zhacbak", "no folder either");
});

// A stand-in for XMLHttpRequest: records the request, then plays `play` on it.
function fakeXhr(play) {
    return class {
        constructor() { this.upload = {}; this.headers = {}; }
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader(k, v) { this.headers[k] = v; }
        send(body) { this.body = body; queueMicrotask(() => play(this)); }
    };
}

test("uploadRestore: posts the body with the headers, reports the upload's progress, resolves on 200", async () => {
    let req;
    const seen = [];
    const Xhr = fakeXhr((x) => {
        req = x;
        x.upload.onprogress({ lengthComputable: true, loaded: 1, total: 4 });
        x.upload.onprogress({ lengthComputable: false, loaded: 2, total: 0 });
        x.upload.onprogress({ lengthComputable: true, loaded: 4, total: 4 });
        x.status = 200; x.responseText = "{}"; x.onload();
    });
    await uploadRestore("BODY", { "X-Api-Key": "t", "Content-Type": "application/octet-stream" }, (f) => seen.push(f), Xhr);
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/backup/restore");
    assert.deepEqual(req.headers, { "X-Api-Key": "t", "Content-Type": "application/octet-stream" });
    assert.equal(req.body, "BODY");
    assert.deepEqual(seen, [0.25, 1]);
});

test("uploadRestore: the hub's refusal in words; a broken connection says so", async () => {
    const refused = fakeXhr((x) => { x.status = 400; x.responseText = '{"error":"wrong_password"}'; x.onload(); });
    await assert.rejects(uploadRestore("B", {}, () => {}, refused), /wrong password/i);
    const garbled = fakeXhr((x) => { x.status = 502; x.responseText = "<html>"; x.onload(); });
    await assert.rejects(uploadRestore("B", {}, () => {}, garbled), /HTTP 502/);
    const broken = fakeXhr((x) => x.onerror());
    await assert.rejects(uploadRestore("B", {}, () => {}, broken), /connection/i);
});

test("waitForRestart: true once the hub answers with an uptime shorter than the wait", async () => {
    let t = 0;
    const answers = [3000, null, null, 4];   // still up from before (3000 s), down twice, back 4 s after booting
    const probe = async () => answers.shift();
    const sleep = async (ms) => { t += ms; };
    assert.equal(await waitForRestart(probe, { sleep, now: () => t, everyMs: 2000, timeoutMs: 180000 }), true);
    assert.equal(answers.length, 0, "stopped at the first answer after the restart");
});

test("waitForRestart: the hub still up from before does not count; false after the timeout", async () => {
    let t = 0, probes = 0;
    const probe = async () => { probes++; return 3000 + t / 1000; };   // never restarts
    const sleep = async (ms) => { t += ms; };
    assert.equal(await waitForRestart(probe, { sleep, now: () => t, everyMs: 2000, timeoutMs: 10000 }), false);
    assert.equal(probes, 6, "probed at 0, 2, 4, 6, 8 and 10 s");
});
