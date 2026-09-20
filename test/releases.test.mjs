// node --test test/  -- pure functions behind the OTA version picker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assetMatches, chipToken, compareBuild, fetchReleases, parseTag } from "../src/releases.js";

test("chipToken strips the esp32 prefix", () => {
    assert.equal(chipToken("esp32p4"), "p4");
    assert.equal(chipToken("esp32s31"), "s31");
    assert.equal(chipToken("ESP32S3"), "s3");
    assert.equal(chipToken(undefined), "");
});

test("assetMatches: only -ota.bin for the right chip", () => {
    const p4 = { chip: "p4", revision: 130 };
    assert.equal(assetMatches("zhac-wired-p4-rev1x-v2026091901-ota.bin", p4), true);
    assert.equal(assetMatches("zhac-wired-p4-rev1x-v2026091901.bin", p4), false, "full-flash image");
    assert.equal(assetMatches("zhac-rcp-c6-v2026091901.bin", p4), false, "radio image");
    assert.equal(assetMatches("zhac-wired-s31-v2026091901-ota.bin", p4), false, "other chip");
    assert.equal(assetMatches("zhac-dualchip-s3-v2026091901-ota.bin", { chip: "s3" }), true);
    assert.equal(assetMatches("SHA256SUMS", p4), false);
});

test("assetMatches: silicon revision families", () => {
    const name = "zhac-wired-p4-rev1x-v2026091901-ota.bin";
    assert.equal(assetMatches(name, { chip: "p4", revision: 1 }), true, "v0.1 is in the pre-v3 family");
    assert.equal(assetMatches(name, { chip: "p4", revision: 199 }), true);
    assert.equal(assetMatches(name, { chip: "p4", revision: 301 }), false, "v3.1 needs a rev3x image");
    assert.equal(assetMatches("zhac-wired-p4-rev3x-v2026091901-ota.bin", { chip: "p4", revision: 301 }), true);
    assert.equal(assetMatches(name, { chip: "p4" }), true, "unknown revision: offer it");
});

test("parseTag / compareBuild", () => {
    assert.equal(parseTag("v2026091901"), 2026091901);
    assert.equal(parseTag("2026091901"), 2026091901);
    assert.equal(parseTag("v2026091901-3-gabc123"), null, "developer build");
    assert.equal(parseTag("abc1234"), null);
    assert.equal(compareBuild("v2026091901", "v2026091901"), "installed");
    assert.equal(compareBuild("v2026091901", "v2026092001"), "newer");
    assert.equal(compareBuild("v2026092001", "v2026091901"), "older");
    assert.equal(compareBuild("abc1234-dirty", "v2026091901"), "unknown");
});

test("fetchReleases keeps only releases with a fitting asset, newest first", async () => {
    const api = [
        { tag_name: "v2026092001", published_at: "2026-09-20T10:00:00Z", html_url: "u2", draft: false, assets: [
            { name: "zhac-wired-p4-rev1x-v2026092001-ota.bin", browser_download_url: "d2", size: 3 },
            { name: "zhac-wired-p4-rev1x-v2026092001.bin", browser_download_url: "full", size: 9 },
            { name: "SHA256SUMS", browser_download_url: "sums2", size: 1 } ] },
        { tag_name: "v2026091901", published_at: "2026-09-19T10:00:00Z", html_url: "u1", draft: false, assets: [
            { name: "zhac-rcp-c6-v2026091901.bin", browser_download_url: "rcp", size: 2 } ] },
        { tag_name: "v2026091801", draft: true, assets: [
            { name: "zhac-wired-p4-rev1x-v2026091801-ota.bin", browser_download_url: "d0", size: 3 } ] },
    ];
    const fetchImpl = async (url) => ({ ok: true, json: async () => (url.includes("zhac-wired-core") ? api : []) });
    const rels = await fetchReleases("wired", { chip: "p4", revision: 130 }, fetchImpl);
    assert.deepEqual(rels.map(r => r.tag), ["v2026092001"]);
    assert.deepEqual(rels[0].assets.map(a => a.url), ["d2"]);
    assert.equal(rels[0].sums, "sums2");
    assert.equal(rels[0].date, "2026-09-20");
    await assert.rejects(() => fetchReleases("wired", {}, async () => ({ ok: false, status: 403 })), /403/);
    assert.deepEqual(await fetchReleases("nope", {}, fetchImpl), []);
});
