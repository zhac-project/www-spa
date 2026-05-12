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
export function fmtSince(ts) {
    if (ts == null || ts === 0) return "—";
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts));
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

export function hex16(n) {
    if (n == null) return "—";
    return "0x" + Number(n).toString(16).toUpperCase().padStart(4, "0");
}
