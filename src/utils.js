// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Small formatter helpers. Kept free of Preact-isms so they're reusable
// in stores / pages / event handlers.

export function fmtUptime(secs) {
    if (secs == null) return "—";
    secs = Number(secs);
    if (!Number.isFinite(secs)) return "—";
    if (secs < 60)   return secs + "s";
    if (secs < 3600) return Math.floor(secs / 60) + "m " + (secs % 60) + "s";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h + "h " + m + "m";
}

export function fmtBytes(b) {
    if (b == null) return "—";
    b = Number(b);
    if (!Number.isFinite(b)) return "—";
    if (b < 1024)     return b + " B";
    if (b < 1048576)  return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
}

// Turn a Unix epoch (seconds) into "N ago" / "just now" / "—".
//
// Sanity-bound the input: anything before 2020-01-01 (1577836800) is
// treated as missing. Pre-SNTP firmware paths used to write
// seconds-since-boot here (uptime), which rendered as ~55 years ago
// ("494079h ago"). The firmware now gates writes on SNTP being
// synced; this guard catches any straggler that slips through.
export function fmtSince(ts) {
    if (ts == null || ts === 0) return "—";
    const n = Number(ts);
    if (!Number.isFinite(n) || n < 1577836800) return "—";
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - n);
    if (delta < 5) return "just now";
    return fmtUptime(delta) + " ago";
}

// Turn a direct "seconds ago" count into the same display as fmtSince.
// Use this when the backend hands us a relative age (e.g. Diag's
// unhandled-frame ring — P4 only tracks uptime-seconds, not epoch).
export function fmtAgo(sec) {
    if (sec == null) return "—";
    const delta = Math.max(0, Math.floor(Number(sec)));
    if (delta < 5) return "just now";
    return fmtUptime(delta) + " ago";
}

// A rule's last_skip code (rules.status) as a short phrase.
export function fmtSkip(code) {
    if (!code) return "";
    if (code === "unchanged") return "last report: no change";
    if (code === "condition_false") return "last report: condition not met";
    if (code.startsWith("action_error:")) return `last run: ${code.slice(13)} failed`;
    return code;
}

export function hex16(n) {
    if (n == null) return "—";
    return "0x" + Number(n).toString(16).toUpperCase().padStart(4, "0");
}

// script.reload's answer as the Scripts page's Apply toast (spec 2026-10-05 §3.10, §5.4): {loaded, total}, or
// {queued: true} when the hub was still restarting scripts after 5 s. The hub logs why a script failed.
export function reloadText(r) {
    if (!r || r.queued) return "The hub is still restarting scripts";
    const failed = r.total - r.loaded;
    return `Scripts restarted: ${r.loaded} of ${r.total} started` + (failed > 0 ? `. ${failed} failed: see Log.` : "");
}

// The toast's kind for the same answer: an error when a script did not start (as ZHAC Cloud shows it),
// neutral while the hub is still at it, green when every script started.
export function reloadKind(r) {
    if (!r || r.queued) return "info";
    return r.loaded < r.total ? "err" : "ok";
}

// status.scripts_held (the boot-loop guard): the script loading at the last crash, "" when unknown.
export function heldText(name) {
    return "Scripts are not running: the hub restarted twice in a row while they were starting" +
        (name ? `, the last time while loading "${name}". Fix or delete that script, then press Apply.`
              : ". Fix or delete the script that crashed it, then press Apply.");
}
