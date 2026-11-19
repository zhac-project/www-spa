// SPDX-FileCopyrightText: 2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import { LINKS } from "../src/links.js";

// Archived repos take no new issues or discussions; only the old releases stay there (LINKS.releases).
const ARCHIVED = /\/(zhac-platform|zhac-mono-core|zhac-net-core|zhac-main-core)\//;

test("no link that asks the user to act points at an archived repo", () => {
    for (const [key, url] of Object.entries(LINKS)) {
        if (key === "releases") continue;
        assert.doesNotMatch(url, ARCHIVED, key);
    }
});

test("bug, device request and discussions go to zhac-docs", () => {
    assert.match(LINKS.bug, /\/zhac-docs\/issues\/new\?template=bug\.yml$/);
    assert.match(LINKS.deviceRequest, /\/zhac-docs\/issues\/new\?template=device-request\.yml$/);
    assert.match(LINKS.discussions, /\/zhac-docs\/discussions$/);
});
