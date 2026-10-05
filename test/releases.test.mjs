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
    const p4 = { kind: "wired", chip: "p4", revision: 130 };
    assert.equal(assetMatches("zhac-wired-p4-rev1x-v2026091901-ota.bin", p4), true);
    assert.equal(assetMatches("zhac-wired-p4-rev1x-v2026091901.bin", p4), false, "full-flash image");
    assert.equal(assetMatches("zhac-rcp-c6-v2026091901.bin", p4), false, "radio image");
    assert.equal(assetMatches("zhac-wired-s31-v2026091901-ota.bin", p4), false, "other chip");
    assert.equal(assetMatches("zhac-dualchip-s3-v2026091901-ota.bin", { kind: "dual", chip: "s3" }), true);
    assert.equal(assetMatches("SHA256SUMS", p4), false);
});

test("assetMatches: silicon revision families", () => {
    const name = "zhac-wired-p4-rev1x-v2026091901-ota.bin";
    const p4 = { kind: "wired", chip: "p4" };
    assert.equal(assetMatches(name, { ...p4, revision: 1 }), true, "v0.1 is in the pre-v3 family");
    assert.equal(assetMatches(name, { ...p4, revision: 199 }), true);
    assert.equal(assetMatches(name, { ...p4, revision: 301 }), false, "v3.1 needs a rev3x image");
    assert.equal(assetMatches("zhac-wired-p4-rev3x-v2026091901-ota.bin", { ...p4, revision: 301 }), true);
    assert.equal(assetMatches(name, p4), true, "unknown revision: offer it");
});

// Every wired release since v2026092601 also carries the C6 radio installer, a
// one-off P4 app: it fits "-p4-" and "-ota.bin", GitHub lists it first, and
// installing it instead of the hub firmware took the hub off the network.
test("assetMatches: the C6 radio installer is never the hub firmware", () => {
    const p4 = { kind: "wired", chip: "p4", revision: 130 };
    assert.equal(assetMatches("zhac-c6-rcp-installer-p4-rev1x-v2026100302-ota.bin", p4), false);
    assert.equal(assetMatches("zhac-wired-p4-rev1x-v2026100302-ota.bin", p4), true);
});

test("assetMatches: the product prefix follows the hub kind", () => {
    assert.equal(assetMatches("zhac-wired-s31-v2026100302-ota.bin", { kind: "wired", chip: "s31" }), true);
    assert.equal(assetMatches("zhac-dualchip-p4-v2026100302-ota.bin", { kind: "dual", chip: "p4", revision: 130 }), true);
    assert.equal(assetMatches("zhac-dualchip-p4-v2026100302-ota.bin", { kind: "wired", chip: "p4", revision: 130 }), false, "dual-chip image on a wired hub");
    assert.equal(assetMatches("zhac-wired-p4-rev1x-v2026100302-ota.bin", { kind: "dual", chip: "p4", revision: 130 }), false, "wired image on a dual-chip hub");
    assert.equal(assetMatches("zhac-mono-s3-v2026100302-ota.bin", { kind: "single", chip: "s3" }), true);
    assert.equal(assetMatches("zhac-wired-p4-rev1x-v2026100302-ota.bin", { chip: "p4", revision: 130 }), false, "no kind, no match");
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

test("fetchReleases: a wired hub gets its own firmware, not the C6 installer GitHub lists first", async () => {
    const api = [
        { tag_name: "v2026100302", published_at: "2026-10-03T10:00:00Z", html_url: "u", draft: false, assets: [
            { name: "zhac-c6-rcp-installer-p4-rev1x-v2026100302-ota.bin", browser_download_url: "installer", size: 5 },
            { name: "zhac-wired-p4-rev1x-v2026100302-ota.bin", browser_download_url: "p4", size: 3 },
            { name: "zhac-wired-s31-v2026100302-ota.bin", browser_download_url: "s31", size: 4 } ] },
    ];
    const fetchImpl = async () => ({ ok: true, json: async () => api });
    const urls = async (hub) => (await fetchReleases("wired", hub, fetchImpl))[0].assets.map(a => a.url);
    assert.deepEqual(await urls({ chip: "p4", revision: 130 }), ["p4"]);
    assert.deepEqual(await urls({ chip: "s31" }), ["s31"]);
});
