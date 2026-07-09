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

// "checking" — probe in flight
// "ok"       — auth off, or auth on and we hold a working token → render app
// "needsAuth"— auth on and we have no valid token → show <Login>
// "offline"  — /api/status unreachable (device down / booting) → retry pane
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
    authState.value = token && (await tokenAccepted(token)) ? "ok" : "needsAuth";
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
