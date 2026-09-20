// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// External links the UI offers, in one place so a moved page is a one-line fix.
const GH = "https://github.com/zhac-project";

export const LINKS = {
    firstSteps:    `${GH}/zhac-docs/blob/master/FIRST_20_MINUTES.md`,
    troubleshooting: `${GH}/zhac-docs/blob/master/TROUBLESHOOTING.md`,
    docs:          `${GH}/zhac-docs#readme`,
    rules:         `${GH}/zhac-docs/blob/master/RULES_DSL.md`,
    lua:           `${GH}/zhac-docs/blob/master/LUA_API.md`,
    devices:       `${GH}/zhac-docs/blob/master/supported-devices/README.md`,
    deviceRequest: `${GH}/zhac-platform/issues/new?template=device-request.yml`,
    bug:           `${GH}/zhac-platform/issues/new?template=bug.yml`,
    discussions:   `${GH}/zhac-platform/discussions`,
    flasher:       "https://zhac-project.github.io/zhac-docs/flash/",
    radio:         `${GH}/zhac-wired-core#zigbee-radio-esp32-c6`,
    releases: {
        dual:   `${GH}/zhac-platform/releases/latest`,
        wired:  `${GH}/zhac-wired-core/releases/latest`,
        single: `${GH}/zhac-mono-core/releases`,
    },
};
