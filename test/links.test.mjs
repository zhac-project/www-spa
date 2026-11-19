// SPDX-FileCopyrightText: 2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { LINKS } from "../src/links.js";

// Archived repos take no new issues or discussions, and their builds are not this hub's.
const ARCHIVED = /\/(zhac-platform|zhac-mono-core|zhac-net-core|zhac-main-core)([/#?]|$)/;

test("the archived-repo pattern also catches a link that ends at the repo name", () => {
    for (const url of ["https://github.com/zhac-project/zhac-platform",
                       "https://github.com/zhac-project/zhac-platform#readme",
                       "https://github.com/zhac-project/zhac-net-core?tab=readme-ov-file",
                       "https://github.com/zhac-project/zhac-main-core/issues"])
        assert.match(url, ARCHIVED, url);
    assert.doesNotMatch("https://github.com/zhac-project/zhac-platform-tools", ARCHIVED);
});

test("no link points at an archived repo", () => {
    for (const [key, url] of Object.entries(LINKS)) assert.doesNotMatch(url, ARCHIVED, key);
});

test("the release link is the hub firmware's latest release", () => {
    assert.equal(LINKS.releases, "https://github.com/zhac-project/zhac-wired-core/releases/latest");
});

test("bug, device request and discussions go to zhac-docs", () => {
    assert.match(LINKS.bug, /\/zhac-docs\/issues\/new\?template=bug\.yml$/);
    assert.match(LINKS.deviceRequest, /\/zhac-docs\/issues\/new\?template=device-request\.yml$/);
    assert.match(LINKS.discussions, /\/zhac-docs\/discussions$/);
});
