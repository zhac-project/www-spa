// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full-screen auth gate. Two modes driven by the auth store:
//  - "needsSetup": first-boot (or pre-password firmware upgrade) — the device
//    has no admin password yet; this one-time card sets it and logs in.
//  - "needsAuth": normal sign-in with the admin password, exchanged for the
//    API token via POST /api/auth/login. An "advanced" toggle still accepts a
//    raw 32-char API token (serial-log workflow / older firmware).
// On success the token is stored and the page reloads so the WebSocket
// re-handshakes with it (the same flow Settings uses).
import { useState } from "preact/hooks";
import { authError, submitToken, submitPassword, submitSetup } from "../stores/auth.js";

export function Login({ setup = false }) {
    const [pw, setPw]           = useState("");
    const [confirm, setConfirm] = useState("");
    const [useToken, setUseToken] = useState(false);
    const [busy, setBusy]       = useState(false);
    const err = authError.value;

    async function onSubmit(e) {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        const ok = setup ? await submitSetup(pw, confirm)
                 : useToken ? await submitToken(pw)
                 : await submitPassword(pw);
        setBusy(false);
        if (ok) location.reload();   // re-handshake WS + REST with the token
    }

    return (
        <div class="login-gate">
            <form class="login-card" onSubmit={onSubmit}>
                <span class="brand login-brand">ZHAC</span>
                <h2 class="login-title">{setup ? "Set admin password" : "Sign in"}</h2>
                <p class="login-lead">
                    {setup
                        ? "First boot: choose the admin password for this controller."
                        : useToken
                            ? "Paste the 32-character API token."
                            : "Enter the admin password."}
                </p>
                <label class="login-field">
                    <span>{setup ? "New password" : useToken ? "API token" : "Password"}</span>
                    <input type="password" value={pw} autoFocus
                           autocomplete={setup ? "new-password" : "current-password"}
                           spellcheck={false}
                           placeholder={setup ? "8-63 characters"
                                       : useToken ? "32-character token" : ""}
                           onInput={(e) => setPw(e.currentTarget.value)} />
                </label>
                {setup && (
                    <label class="login-field">
                        <span>Confirm password</span>
                        <input type="password" value={confirm}
                               autocomplete="new-password" spellcheck={false}
                               onInput={(e) => setConfirm(e.currentTarget.value)} />
                    </label>
                )}
                {err && <p class="error-text">{err}</p>}
                <button type="submit" class="primary"
                        disabled={busy || !pw.trim() || (setup && !confirm.trim())}>
                    {busy ? "Checking…" : setup ? "Set password & sign in" : "Sign in"}
                </button>
                {!setup && (
                    <p class="login-hint">
                        <a href="#" onClick={(e) => { e.preventDefault();
                                                      setUseToken(!useToken); setPw(""); }}>
                            {useToken ? "Use password instead" : "Use API token instead"}
                        </a>
                    </p>
                )}
                <p class="login-hint">
                    {setup
                        ? "The password is stored on the device as a salted hash and " +
                          "can be changed later under Settings → Auth."
                        : "Lost the password? Hold the device's serial console: the API " +
                          "token printed there still signs in (advanced), or erase NVS " +
                          "to re-run first-boot setup."}
                </p>
            </form>
        </div>
    );
}
