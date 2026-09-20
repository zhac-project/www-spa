import { test } from "node:test";
import assert from "node:assert/strict";
import { describeBackup, NOT_IN_BACKUP, BACKUP_FORMAT } from "../src/backup_preview.js";

const b = { zhac_backup: BACKUP_FORMAT, created: "2026-09-20T10:00:00Z", hub: "zhac", firmware: "v2026092001",
    devices: [{ ieee: "0x1", name: "hall" }, { ieee: "0x2", name: "" }, { ieee: "0x3", name: "porch" }],
    rules: [{ name: "a", dsl: "x", enabled: true }, { name: "b", dsl: "y", enabled: false }],
    scripts: [{ name: "s", src: "" }], collections: [] };

test("describeBackup: counts, skipped names, exclusions", () => {
    const lines = describeBackup(b, ["0x1"]);
    assert.match(lines[0], /2026-09-20 on "zhac" \(firmware v2026092001\)/);
    assert.match(lines[1], /2 device names, 2 rules \(1 enabled\), 1 script, 0 collections/);
    assert.match(lines[2], /1 named device is not paired on this hub.*porch/);
    assert.equal(lines.at(-1), NOT_IN_BACKUP);
    assert.equal(describeBackup(b, ["0x1", "0x3"]).length, 4, "no skipped line when all are paired");
    assert.throws(() => describeBackup({ zhac_backup: 99 }), /not a ZHAC backup/);
});
