// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Published firmware versions, read by the browser from GitHub Releases so the
// OTA page can offer "install v2026…" instead of asking for a pasted URL.
// The hub itself never talks to GitHub's API: the browser picks the asset
// and hands the hub that one download URL, exactly as the URL form does.
//
// Asset naming is the contract with zhac-wired-core's release workflow:
//   zhac-wired-<chip>[-rev<N>x]-<tag>-ota.bin   (p4 rev1x / rev3x, s31)
// Only `-ota.bin` files are offered; the full-flash images would overwrite
// the bootloader and partition table.
//
// A name must START with "zhac-wired-" plus the hub's chip token. "Contains -p4- and ends in -ota.bin" is not enough: wired releases
// also carry zhac-c6-rcp-installer-p4-rev1x-<tag>-ota.bin (releases from
// v2026092601 on), a one-off P4 app that writes the C6 radio. It passed that
// loose test, GitHub lists it before the hub firmware, and installing it
// took the hub off the network until a power cycle rolled it back.

const REPO = "zhac-wired-core";

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
    if (!name || !chip) return false;
    if (!name.toLowerCase().startsWith(`zhac-wired-${chip}-`) || !/-ota\.bin$/i.test(name)) return false;
    const rev = /-rev(\d)x-/i.exec(name);
    if (!rev || typeof revision !== "number") return true;
    const family = Number(rev[1]);
    const upper = (family + 1) * 100;
    const lower = family === 1 ? 0 : family * 100;   // rev1x also covers v0.x
    return revision >= lower && revision < upper;
}

// Orders releases and pre-releases: a pre-release vYYYYMMDDVV-rcN (N one or two
// digits) comes before its release vYYYYMMDDVV, as on the hub (zhac-wired-core
// main/ota_image.h). null for anything else: a `git describe` string with
// commits on top ("v2026091901-3-gabc123") is a developer build, not a release.
export function tagOrder(s) {
    const m = /^v?(\d{10})(?:-rc(\d{1,2}))?$/.exec(String(s || "").trim());
    return m ? Number(m[1]) * 1000 + (m[2] === undefined ? 999 : Number(m[2])) : null;
}

// How a release relates to what the hub runs:
//   "installed" same version; "newer"/"older" than the hub's; "unknown" when
//   either is neither a release nor a pre-release tag (a developer build).
export function compareBuild(installed, tag) {
    const a = tagOrder(installed), b = tagOrder(tag);
    if (a == null || b == null) return "unknown";
    if (a === b) return "installed";
    return b > a ? "newer" : "older";
}

// The hub firmware's releases, newest first, with only the assets that fit `hub`.
// Throws on network / API errors so the page can fall back to the URL form.
export async function fetchReleases(hub, fetchImpl = globalThis.fetch) {
    const r = await fetchImpl(`https://api.github.com/repos/zhac-project/${REPO}/releases?per_page=10`, {
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
