// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The full backup (wired hubs that report `full_backup`): the whole hub as one file the hub encrypts with a
// password, and restores from. The page only carries bytes; these are its pure helpers (fetches: stores/backup.js).

// POST /api/backup/restore's body: u16 LE password length, the password as UTF-8, the file.
export function restoreBody(password, file) {
    const pw = new TextEncoder().encode(password);
    return new Blob([new Uint8Array([pw.length & 0xFF, pw.length >> 8]), pw, file]);
}

// The hub counts bytes (8 to 63), not characters.
export const passwordBytes = (password) => new TextEncoder().encode(password).length;

const ERRORS = {
    password_length:   "The password must be 8 to 63 bytes",
    busy:              "The hub's storage kept changing; try again in a moment",
    no_memory:         "The hub has not enough free memory right now; try again",
    partition_missing: "This hub's partition table lacks a storage partition",
    not_a_backup:      "That file is not a ZHAC full backup",
    wrong_password:    "Wrong password for this backup",
    incomplete:        "The file is incomplete",
    damaged:           "The file is damaged",
    partitions_differ: "This hub's storage layout differs from the backup's",
    newer_firmware:    "The backup comes from newer firmware: update this hub first",
    on_trial:          "The hub is still checking its last firmware update: wait a few minutes",
    update_running:    "A firmware update is running: wait for it to finish",
    no_space:          "The backup does not fit the hub's spare firmware slot",
    flash:             "Writing to the hub's flash failed",
    crypto:            "The hub could not run the encryption",
};

// The hub's JSON error reply in words.
export function fullBackupError(j, status) {
    const code = j && j.error;
    if (!code) return `HTTP ${status}`;
    const named = j.partition || j.fw;
    return (ERRORS[code] || code) + (named ? ` (${named})` : "");
}

// The download's file name from its Content-Disposition, never one with a path in it.
export function fullBackupName(disposition) {
    const m = /filename="([^"/\\]+)"/.exec(disposition || "");
    return m && !m[1].startsWith(".") ? m[1] : "zhac-full.zhacbak";
}

// POST /api/backup/restore with the upload's progress (0..1): the hub decrypts and writes the file as it arrives, so
// that is the restore's progress (fetch() reports none for uploads).
export function uploadRestore(body, headers, onProgress, Xhr = globalThis.XMLHttpRequest) {
    return new Promise((resolve, reject) => {
        const x = new Xhr();
        x.open("POST", "/api/backup/restore");
        for (const k in headers) x.setRequestHeader(k, headers[k]);
        x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
        x.onload = () => {
            if (x.status >= 200 && x.status < 300) return resolve();
            let j = null;
            try { j = JSON.parse(x.responseText); } catch (_) {}
            reject(new Error(fullBackupError(j, x.status)));
        };
        x.onerror = () => reject(new Error("The connection to the hub broke"));
        x.send(body);
    });
}

// After the hub accepted a restore: asks `probe` (the hub's uptime in seconds, null while it does not answer) every
// `everyMs` until the hub has booted since (an uptime shorter than the wait so far). False after `timeoutMs`.
export async function waitForRestart(probe, { sleep, now, everyMs = 2000, timeoutMs = 180000 }) {
    const t0 = now();
    for (;;) {
        const up = await probe();
        if (up != null && up * 1000 < now() - t0) return true;
        if (now() - t0 >= timeoutMs) return false;
        await sleep(everyMs);
    }
}
