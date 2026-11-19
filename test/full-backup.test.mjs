import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreBody, passwordBytes, fullBackupError, fullBackupName } from "../src/full_backup.js";

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
