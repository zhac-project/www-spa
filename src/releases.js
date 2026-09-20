// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Published firmware versions, read by the browser from GitHub Releases so the
// OTA page can offer "install v2026…" instead of asking for a pasted URL.
// The hub itself never talks to GitHub's API: the browser picks the asset
// and hands the hub that one download URL, exactly as the URL form does.
//
// Asset naming is the contract with the release workflows:
//   zhac-wired-core:  zhac-wired-p4-rev1x-<tag>-ota.bin  (also -s31- one day)
//   zhac-platform:    zhac-dualchip-s3-<tag>-ota.bin, zhac-dualchip-p4-<tag>-ota.bin
// Only `-ota.bin` files are offered; the full-flash images would overwrite
// the bootloader and partition table.

export const RELEASE_REPO = {
    wired:  "zhac-wired-core",
    dual:   "zhac-platform",
    single: "zhac-mono-core",
};

// "esp32p4" -> "p4", "esp32s31" -> "s31", "esp32s3" -> "s3".
export function chipToken(target) {
    const m = /^esp32(.+)$/.exec(String(target || "").toLowerCase());
    return m ? m[1] : "";
}

// Does this release asset fit the hub that asks? `chip` is the token above;
// `revision` is esp_chip_info's major*100+minor (v1.3 -> 130). A `rev1x`
// image covers v0.x–v1.x silicon (the P4's pre-v3 family); `rev3x` covers v3.x.
// No rev token in the name means the image does not care.
export function assetMatches(name, { chip, revision } = {}) {
    if (!name || !/-ota\.bin$/i.test(name)) return false;
    if (!chip || !name.toLowerCase().includes(`-${chip}-`)) return false;
    const rev = /-rev(\d)x-/i.exec(name);
    if (!rev || typeof revision !== "number") return true;
    const family = Number(rev[1]);
    const upper = (family + 1) * 100;
    const lower = family === 1 ? 0 : family * 100;   // rev1x also covers v0.x
    return revision >= lower && revision < upper;
}

// vYYYYMMDDVV -> 2026091901, anything else -> null. A `git describe` string
// with commits on top ("v2026091901-3-gabc123") is NOT a release.
export function parseTag(s) {
    const m = /^v?(\d{10})$/.exec(String(s || "").trim());
    return m ? Number(m[1]) : null;
}

// How a release relates to what the hub runs:
//   "installed" same version; "newer"/"older" than the hub's; "unknown" when
//   the hub's version is not a release tag (a developer build).
export function compareBuild(installed, tag) {
    const a = parseTag(installed), b = parseTag(tag);
    if (a == null || b == null) return "unknown";
    if (a === b) return "installed";
    return b > a ? "newer" : "older";
}

// Releases of one repo, newest first, with only the assets that fit `hub`.
// Throws on network / API errors so the page can fall back to the URL form.
export async function fetchReleases(kind, hub, fetchImpl = globalThis.fetch) {
    const repo = RELEASE_REPO[kind];
    if (!repo) return [];
    const r = await fetchImpl(`https://api.github.com/repos/zhac-project/${repo}/releases?per_page=10`, {
        headers: { Accept: "application/vnd.github+json" },
    });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const list = await r.json();
    return (Array.isArray(list) ? list : [])
        .filter(rel => !rel.draft)
        .map(rel => ({
            tag:       rel.tag_name,
            date:      (rel.published_at || "").slice(0, 10),
            notesUrl:  rel.html_url,
            prerelease: !!rel.prerelease,
            sums:      (rel.assets || []).find(a => a.name === "SHA256SUMS")?.browser_download_url || "",
            assets:    (rel.assets || [])
                .filter(a => assetMatches(a.name, hub))
                .map(a => ({ name: a.name, url: a.browser_download_url, size: a.size || 0 })),
        }))
        .filter(rel => rel.assets.length > 0);
}
