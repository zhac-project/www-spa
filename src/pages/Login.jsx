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
import { useEffect, useState } from "preact/hooks";
import { authError, setupSecsLeft, probeAuth,
         submitToken, submitPassword, submitSetup } from "../stores/auth.js";

// The first-claim window closed (hub powered on > 10 min ago, no password).
// Nothing to type: the only way forward is a power cycle, then a reload.
function SetupClosed() {
    const [busy, setBusy] = useState(false);
    async function retry() { setBusy(true); await probeAuth(); setBusy(false); }
    return (
        <div class="login-gate">
            <div class="login-card">
                <span class="brand login-brand">ZHAC</span>
                <h2 class="login-title">Set-up window closed</h2>
                <p class="login-lead">
                    This hub has no admin password yet, but it only lets one be set in the
                    first 10 minutes after it is powered on. That time has passed.
                </p>
                <ol class="login-steps">
                    <li>Unplug the hub's power, wait a few seconds, plug it back in.</li>
                    <li>Wait for it to come back (about half a minute).</li>
                    <li>Press <strong>Try again</strong> and set the password within 10 minutes.</li>
                </ol>
                <button class="primary" onClick={retry} disabled={busy}>
                    {busy ? "Checking…" : "Try again"}
                </button>
                <p class="login-hint">
                    This keeps a hub that was never set up from being claimed by whoever finds
                    it on the network later. Only someone who can reach its power can open it.
                </p>
            </div>
        </div>
    );
}

export function Login({ setup = false, closed = false }) {
    const [pw, setPw]           = useState("");
    const [confirm, setConfirm] = useState("");
    const [useToken, setUseToken] = useState(false);
    const [busy, setBusy]       = useState(false);
    const err = authError.value;
    const left = setupSecsLeft.value;

    // Countdown while the set-up card is open; at zero the store flips to
    // "setupClosed" on the next probe, so re-probe then.
    useEffect(() => {
        if (!setup || closed || left < 0) return;
        const t = setInterval(() => {
            if (setupSecsLeft.value > 0) setupSecsLeft.value -= 1;
            else { clearInterval(t); probeAuth(); }
        }, 1000);
        return () => clearInterval(t);
    }, [setup, closed, left < 0]);

    if (closed) return <SetupClosed />;

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
                        ? "First boot: choose the admin password for this hub." +
                          (left > 0 ? ` You have ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` +
                                      " before the hub closes set-up; a power cycle reopens it." : "")
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
