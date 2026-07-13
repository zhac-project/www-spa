// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Auth-gate state.
//
// The controller's REST + WebSocket API is auth-gated when "Auth (bearer
// token)" is enabled on the device — which is the secure-by-default state on a
// fresh unit. Without a valid token the WS handshake is rejected and every
// gated REST call returns 401, which used to leave the SPA a blank shell with
// no explanation (the only token field lived in Settings, itself unreachable
// while unauthenticated).
//
// This store probes the PUBLIC `/api/status` for `auth_enabled`, validates any
// token already saved in this browser, and drives <App> to show the <Login>
// gate instead of an empty page.
import { signal } from "@preact/signals";

// "checking"  — probe in flight
// "ok"        — auth off, or auth on and we hold a working token → render app
// "needsAuth" — auth on and we have no valid token → show <Login> (password)
// "needsSetup"— auth on but the device has NO admin password yet → show the
//               one-time "set admin password" card (first boot / pre-password
//               firmware upgrade). Setting it logs this browser in.
// "offline"   — /api/status unreachable (device down / booting) → retry pane
export const authState = signal("checking");
export const authError = signal("");

function storedToken() {
    try { return localStorage.getItem("zhac_token") || ""; } catch (_) { return ""; }
}

// Validate a token against a GATED endpoint. `/api/status` is public so it
// can't test a token; `/api/devices` is a stable gated GET that returns 200
// with a good token and 401 without one. Success is an explicit 2xx so a wrong
// URL (404) or a network error fails closed rather than accepting a bad token.
async function tokenAccepted(token) {
    try {
        const r = await fetch("/api/devices", {
            headers: { "X-Api-Key": token },
            cache: "no-store",
        });
        return r.ok;
    } catch (_) {
        return false;   // unreachable — cannot confirm, treat as not accepted
    }
}

// Probe auth state once on boot (and on manual retry).
export async function probeAuth() {
    authState.value = "checking";
    let status;
    try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) throw new Error("status " + r.status);
        status = await r.json();
    } catch (_) {
        authState.value = "offline";
        return;
    }
    if (!status || status.auth_enabled !== true) {
        authState.value = "ok";        // auth disabled on the device — no gate
        return;
    }
    const token = storedToken();
    if (token && (await tokenAccepted(token))) {
        authState.value = "ok";        // valid token beats setup — don't re-gate
        return;
    }
    // No admin password on the device yet (fresh unit, or upgraded from
    // token-only firmware) → force the one-time setup card before login.
    authState.value = status.auth_setup_required === true ? "needsSetup"
                                                          : "needsAuth";
}

// Password login: exchange the password for the API token via
// POST /api/auth/login, persist the token, and let the caller reload.
export async function submitPassword(password) {
    authError.value = "";
    const pw = password || "";
    if (!pw) { authError.value = "Enter the admin password."; return false; }
    let r;
    try {
        r = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pw }),
        });
    } catch (_) {
        authError.value = "Device unreachable — try again.";
        return false;
    }
    if (r.status === 401) {
        authError.value = "Wrong password.";
        return false;
    }
    if (r.status === 409) {           // no password set — flip to setup card
        authState.value = "needsSetup";
        return false;
    }
    if (!r.ok) {
        authError.value = "Login failed (" + r.status + ").";
        return false;
    }
    const data = await r.json().catch(() => null);
    if (!data || !data.token) {
        authError.value = "Unexpected response from the device.";
        return false;
    }
    try { localStorage.setItem("zhac_token", data.token); } catch (_) {}
    return true;
}

// One-time first-boot setup: set the admin password and log this browser in.
export async function submitSetup(password, confirm) {
    authError.value = "";
    const pw = password || "";
    if (pw.length < 8 || pw.length > 63) {
        authError.value = "Password must be 8-63 characters.";
        return false;
    }
    if (pw !== (confirm || "")) {
        authError.value = "Passwords don't match.";
        return false;
    }
    let r;
    try {
        r = await fetch("/api/auth/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pw }),
        });
    } catch (_) {
        authError.value = "Device unreachable — try again.";
        return false;
    }
    if (r.status === 403) {           // someone else just claimed it — log in
        authState.value = "needsAuth";
        authError.value = "A password was already set — sign in with it.";
        return false;
    }
    if (!r.ok) {
        authError.value = "Setup failed (" + r.status + ").";
        return false;
    }
    const data = await r.json().catch(() => null);
    if (!data || !data.token) {
        authError.value = "Unexpected response from the device.";
        return false;
    }
    try { localStorage.setItem("zhac_token", data.token); } catch (_) {}
    return true;
}

// Called from the <Login> form. Validates, then persists the token; the caller
// reloads so ws/client.js re-handshakes with it (the same flow Settings uses).
export async function submitToken(token) {
    authError.value = "";
    const t = (token || "").trim();
    if (t.length !== 32) {
        authError.value = "Token must be exactly 32 characters.";
        return false;
    }
    if (!(await tokenAccepted(t))) {
        authError.value = "Token rejected — check the value on the device serial log.";
        return false;
    }
    try { localStorage.setItem("zhac_token", t); } catch (_) {}
    return true;
}
