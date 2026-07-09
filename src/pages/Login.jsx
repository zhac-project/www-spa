// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full-screen sign-in gate, shown when the controller has API auth enabled and
// this browser holds no valid token. Replaces the old failure mode where an
// unauthenticated SPA rendered a blank shell with no explanation. On success
// the token is stored and the page reloads so the WebSocket re-handshakes with
// it (the same flow Settings uses when you paste a token there).
import { useState } from "preact/hooks";
import { authError, submitToken } from "../stores/auth.js";

export function Login() {
    const [token, setToken] = useState("");
    const [busy, setBusy]   = useState(false);
    const err = authError.value;

    async function onSubmit(e) {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        const ok = await submitToken(token);
        setBusy(false);
        if (ok) location.reload();   // re-handshake WS + REST with the new token
    }

    return (
        <div class="login-gate">
            <form class="login-card" onSubmit={onSubmit}>
                <span class="brand login-brand">ZHAC</span>
                <h2 class="login-title">Sign in</h2>
                <p class="login-lead">This controller requires an API token.</p>
                <label class="login-field">
                    <span>API token</span>
                    <input type="password" value={token} autoFocus
                           autocomplete="off" spellcheck={false}
                           placeholder="32-character token"
                           onInput={(e) => setToken(e.currentTarget.value)} />
                </label>
                {err && <p class="error-text">{err}</p>}
                <button type="submit" class="primary"
                        disabled={busy || !token.trim()}>
                    {busy ? "Checking…" : "Connect"}
                </button>
                <p class="login-hint">
                    The token is printed to the device’s serial log on first
                    boot, or an admin can read/rotate it under Settings → Auth.
                    If you own the device and lost it, disable Auth (or erase
                    NVS) over serial.
                </p>
            </form>
        </div>
    );
}
