// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings: WiFi status/scan/connect/forget, MQTT, Zigbee network, misc toggles,
// OTA inputs, danger-zone reset. Every action maps to a WS command.
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../ws/client.js";
import { status } from "../stores/status.js";
import { showToast, withToast, SUCCESS, navigate, themeMode, setTheme } from "../stores/ui.js";
import { uplinkGet, uplinkSet, rainmakerStatus, rainmakerAssoc } from "../stores/rainmaker.js";
import { rmCloudLogin, rmCloudUser, rmCloudMap } from "../stores/rainmaker-cloud.js";
import { Card } from "../components/Card.jsx";
import { Badge } from "../components/Badge.jsx";
import { fmtSince } from "../utils.js";

export function SettingsPage() {
    const d = status.value || {};

    // WiFi ----------------------------------------------------------------
    const [wifi, setWifi] = useState(null);
    const [nets, setNets] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [ssid, setSsid] = useState("");
    const [pass, setPass] = useState("");

    async function loadWifi() {
        try { setWifi(await call("wifi.status")); } catch (_) {}
    }
    useEffect(() => { loadWifi(); }, []);

    async function doScan() {
        setScanning(true);
        try {
            const res = await call("wifi.scan");
            setNets(res?.networks || []);
        } catch (e) { showToast("Scan failed: " + e.message, "err"); }
        finally { setScanning(false); }
    }
    async function doConnect(e) {
        e.preventDefault();
        try { await call("wifi.connect", { ssid, pass }); showToast("Connecting…", "ok"); }
        catch (e) { showToast("Connect failed: " + e.message, "err"); }
    }
    async function doForget() {
        if (!confirm("Forget WiFi credentials and reboot into AP mode?")) return;
        try { await call("wifi.disconnect"); showToast("Forgotten — rebooting", "ok"); }
        catch (e) { showToast("Failed: " + e.message, "err"); }
    }

    // Zigbee network ------------------------------------------------------
    const [ch, setCh] = useState(15);
    const [key, setKey] = useState("");
    async function saveZigbee(regenerate = false) {
        try {
            const args = { channel: Number(ch) };
            if (regenerate) args.regenerate = true;
            else if (key) args.net_key_hex = key;
            await call("zigbee.settings.set", args);
            showToast("Saved (applies after factory reset)", "ok");
        } catch (e) { showToast("Failed: " + e.message, "err"); }
    }
    async function doZigbeeReset() {
        if (!confirm("WARNING: erase ALL paired devices, rules, and scripts from P4?")) return;
        try { await call("zigbee.reset"); showToast("Reset — rebooting", "ok"); }
        catch (e) { showToast("Failed: " + e.message, "err"); }
    }

    // Settings toggles / MQTT fields --------------------------------------
    const [brokerUrl, setBrokerUrl] = useState(d.mqtt_broker || "");
    const [mqttRoot,  setMqttRoot]  = useState(d.mqtt_root_topic || "");
    useEffect(() => {
        if (d.mqtt_broker != null && !brokerUrl)  setBrokerUrl(d.mqtt_broker);
        if (d.mqtt_root_topic != null && !mqttRoot) setMqttRoot(d.mqtt_root_topic);
    }, [d.mqtt_broker, d.mqtt_root_topic]);

    async function writeSettings(patch, successMsg) {
        try { await call("settings.set", patch); showToast(successMsg || "Saved", "ok"); }
        catch (e) { showToast("Failed: " + e.message, "err"); }
    }

    // OTA -----------------------------------------------------------------
    // Inline OTA inputs were removed: they bypassed the URL validation
    // and confirm() dialog that OtaPage runs, and didn't surface progress
    // either. Single canonical trigger flow lives in pages/Ota.jsx; this
    // card just links there.

    return (
        <div class="page">
            <div class="cards">
                <Card title="Appearance">
                    <div class="theme-radio-group" role="radiogroup" aria-label="Theme">
                        {["system", "light", "dark"].map((m) => (
                            <label key={m} class="theme-radio">
                                <input
                                    type="radio"
                                    name="theme"
                                    value={m}
                                    checked={themeMode.value === m}
                                    onChange={() => setTheme(m)}
                                />
                                <span class="theme-radio-label">
                                    {m === "system" ? "System" : m === "light" ? "Light" : "Dark"}
                                </span>
                            </label>
                        ))}
                    </div>
                    <div class="muted" style="margin-top:8px;font-size:12px">
                        System follows your OS/browser preference. Light and Dark override it.
                    </div>
                </Card>

                <Card title="WiFi">
                    <div style="margin-bottom:12px">
                        {wifi == null ? "…" : (
                            wifi.mode === "ap"
                                ? <><Badge kind="warn">AP Mode</Badge> SSID: <strong>{wifi.ssid}</strong> — IP: {wifi.ip}</>
                                : <><Badge kind="ok">Connected</Badge>{" "}<strong>{wifi.ssid}</strong> — IP: {wifi.ip} — RSSI: {wifi.rssi} dBm</>
                        )}
                    </div>
                    <button type="button" class="secondary" disabled={scanning} onClick={doScan}>
                        {scanning ? "Scanning…" : "Scan Networks"}
                    </button>
                    {nets.length > 0 && (
                        <div style="margin:8px 0">
                            {nets.map((n, i) => (
                                <div key={i} class="wifi-net"
                                     onClick={() => setSsid(n.ssid)}
                                     style="cursor:pointer;padding:6px 8px;border:1px solid var(--border);border-radius:4px;margin:4px 0;display:flex;justify-content:space-between">
                                    <span>{n.auth !== "open" ? "🔒 " : ""}{n.ssid}</span>
                                    <span class="muted">{n.rssi} dBm</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <form onSubmit={doConnect}>
                        <label>SSID<input type="text" value={ssid}
                                          onInput={(e) => setSsid(e.currentTarget.value)} /></label>
                        <label>Password<input type="password" value={pass}
                                              onInput={(e) => setPass(e.currentTarget.value)} /></label>
                        <button type="submit" class="primary">Connect</button>
                    </form>
                    <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)" />
                    <button type="button" class="danger small" onClick={doForget}>
                        Forget WiFi &amp; Switch to AP Mode
                    </button>
                </Card>

                <Card title="MQTT">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                        <label class="toggle">
                            <input type="checkbox" checked={!!d.mqtt_enabled}
                                   onChange={(e) => writeSettings({ mqtt_enabled: e.currentTarget.checked },
                                       e.currentTarget.checked ? "MQTT enabled (reboot required)" : "MQTT disabled (reboot required)")} />
                            <span class="toggle-slider" />
                        </label>
                        <span>Enable MQTT client</span>
                    </div>
                    <label>Broker URL<input type="text" value={brokerUrl}
                                            onInput={(e) => setBrokerUrl(e.currentTarget.value)} /></label>
                    <label>Root topic<input type="text" value={mqttRoot}
                                            onInput={(e) => setMqttRoot(e.currentTarget.value)} /></label>
                    <button class="primary small"
                            onClick={() => writeSettings({ broker_url: brokerUrl, mqtt_root_topic: mqttRoot }, "MQTT saved")}>
                        Save
                    </button>
                </Card>

                <UplinkCard />

                <Card title="Zigbee network">
                    <label>Channel
                        <select value={ch} onChange={(e) => setCh(Number(e.currentTarget.value))}>
                            {Array.from({ length: 26 - 11 + 1 }, (_, i) => 11 + i).map(n =>
                                <option key={n} value={n}>{n}</option>)}
                        </select>
                    </label>
                    <label>Network key (32 hex chars)
                        <input type="text" value={key} maxLength={32}
                               onInput={(e) => setKey(e.currentTarget.value)} />
                    </label>
                    <div class="btn-strip" style="margin-top:8px">
                        <button class="primary small" onClick={() => saveZigbee(false)}>Save</button>
                        <button class="small" onClick={() => saveZigbee(true)}>Regenerate random key</button>
                    </div>
                    <p class="field-hint">Channel + key changes apply after factory reset.</p>
                    <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)" />
                    <p class="muted" style="margin-bottom:8px;font-size:13px">
                        Erase all paired devices, rules, and scripts from P4. The coordinator will reboot.
                    </p>
                    <button class="danger small" onClick={doZigbeeReset}>Factory reset P4</button>
                </Card>

                <Card title="Misc">
                    <ToggleRow label="Metrics"
                               checked={!!d.metrics_enabled}
                               onChange={(v) => writeSettings({ metrics_enabled: v })} />
                    <ToggleRow label="Auth (bearer token)"
                               checked={!!d.auth_enabled}
                               onChange={(v) => writeSettings({ auth_enabled: v })} />
                    <ToggleRow label="Disable AP when STA connected"
                               checked={!!d.ap_disabled}
                               onChange={(v) => writeSettings({ ap_disabled: v })} />
                    <ToggleRow label="Stream logs to MQTT"
                               checked={!!d.log_mqtt_enabled}
                               onChange={(v) => writeSettings({ log_mqtt_enabled: v })} />
                    {d.auth_enabled && d.api_token && (
                        <ApiTokenRow token={d.api_token} />
                    )}
                    <ApiTokenSetupRow />
                </Card>

                {d.auth_enabled && <ChangePasswordCard />}

                <Card title="OTA">
                    <p class="muted" style="margin-bottom:8px;font-size:13px">
                        Firmware updates live on the dedicated OTA page, which
                        validates the URL, prompts before flashing, and shows
                        progress for both chips.
                    </p>
                    <button class="primary small"
                            onClick={() => navigate("ota")}>Open OTA page</button>
                </Card>

                {d.remote_available && <RemoteCard />}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Uplink selector + RainMaker card — chooses which cloud agent runs: none,
// the existing custom-MQTT gateway (MQTT card above), or the RainMaker
// bridge (Tasks 9-18, firmware side). RainMakerCard mirrors RemoteCard's
// poll-on-mount pattern below (setTimeout tick loop + `alive` flag) rather
// than a new mechanism — this project has flagged stacked-interval bugs
// before.
// ---------------------------------------------------------------------------

const UPLINK_OPTIONS = [
    { value: "none",        label: "None" },
    { value: "custom_mqtt", label: "Custom MQTT" },
    { value: "rainmaker",   label: "RainMaker" },
];

function uplinkLabel(v) {
    return UPLINK_OPTIONS.find(o => o.value === v)?.label || v;
}

function UplinkCard() {
    const [mode, setMode] = useState(null);      // null while loading
    const [loadErr, setLoadErr] = useState(false);
    const [rebootNotice, setRebootNotice] = useState(false);
    const [busy, setBusy] = useState(false);

    // uplinkGet() can race the WS handshake (client.js authenticates on
    // 'open' before any command is safe to send) and reject with "not
    // connected" — a fire-once fetch would then leave `mode` null forever
    // with the radios stuck disabled and no feedback. Retry on the same
    // recursive-setTimeout cadence RainMakerCard/RemoteCard use below so
    // this card self-heals the same way they do.
    useEffect(() => {
        let alive = true;
        let t;

        async function tick() {
            try {
                const res = await uplinkGet();
                if (alive) { setMode(res?.uplink ?? "none"); setLoadErr(false); }
            } catch (_) {
                if (alive) setLoadErr(true);
            }
            if (alive) t = setTimeout(tick, 5000);
        }

        tick();
        return () => { alive = false; clearTimeout(t); };
    }, []);

    function retryLoad() {
        uplinkGet().then(
            (res) => { setMode(res?.uplink ?? "none"); setLoadErr(false); },
            () => setLoadErr(true),
        );
    }

    async function change(next) {
        if (next === mode || busy) return;
        if (!confirm(`Switch cloud uplink to "${uplinkLabel(next)}"? The other connection stops.`)) return;
        setBusy(true);
        try {
            const res = await uplinkSet(next);
            setMode(res?.uplink ?? next);
            setRebootNotice(!!res?.reboot_required);
            showToast("Uplink set to " + uplinkLabel(res?.uplink ?? next), "ok");
        } catch (e) {
            showToast("Failed: " + e.message, "err");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Card title="Uplink">
                <div class="theme-radio-group" role="radiogroup" aria-label="Cloud uplink">
                    {UPLINK_OPTIONS.map((o) => (
                        <label key={o.value} class="theme-radio">
                            <input
                                type="radio"
                                name="uplink"
                                value={o.value}
                                checked={mode === o.value}
                                disabled={busy || mode === null}
                                onChange={() => change(o.value)}
                            />
                            <span class="theme-radio-label">{o.label}</span>
                        </label>
                    ))}
                </div>
                {mode === null && (
                    loadErr ? (
                        <div class="field-hint" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--danger)">
                            <span>Couldn't read uplink setting.</span>
                            <button type="button" class="small" onClick={retryLoad}>Retry</button>
                        </div>
                    ) : (
                        <p class="muted" style="font-size:12px">Loading current setting…</p>
                    )
                )}
                <p class="field-hint">
                    Only one cloud uplink runs at a time. Switching stops the other connection.
                </p>
                {rebootNotice && (
                    <div class="field-hint" style="margin-top:8px;color:var(--warn)">
                        Reboot required to fully stop the RainMaker agent — the SDK can't be
                        de-initialised at runtime, so it keeps running in the background until
                        the device reboots.
                    </div>
                )}
            </Card>
            {mode === "rainmaker" && <RainMakerCard />}
        </>
    );
}

const RAINMAKER_STATE_BADGE = {
    disabled:     { kind: null,   label: "Disabled" },
    init_claim:   { kind: "warn", label: "Claiming node…" },
    connecting:   { kind: "warn", label: "Connecting" },
    unassociated: { kind: "warn", label: "Unassociated" },
    ready:        { kind: "ok",   label: "Ready" },
    backoff:      { kind: "warn", label: "Retrying…" },
    claim_failed: { kind: "err",  label: "Claim failed" },
};

function RainMakerStateBadge({ state }) {
    const entry = RAINMAKER_STATE_BADGE[state] || { kind: null, label: state || "—" };
    if (!entry.kind) return <span class="muted">{entry.label}</span>;
    return <Badge kind={entry.kind}>{entry.label}</Badge>;
}

// 32 hex chars (128 bits) of node-mapping secret for the one-click flow
// below. crypto.getRandomValues, never Math.random — this value round-trips
// through both the node (rainmaker.assoc.set, WS) and Espressif's cloud
// (nodes/mapping PUT) as the shared secret proving the mapping request is
// legitimate.
function randomHex32() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function RainMakerCard() {
    const [st, setSt] = useState(null);           // rainmaker.status response
    const [userId, setUserId] = useState("");
    const [secret, setSecret] = useState("");
    const [assocBusy, setAssocBusy] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    // One-click cloud connect — design doc §10 "Onboarding v2 / Flow A".
    // The password only ever lives in this component's state, only for as
    // long as it takes to sign in to Espressif; the RainMaker token lives
    // only in a local variable inside doCloudConnect below (never React
    // state, so it never even reaches a re-render or devtools inspector),
    // discarded the moment the mapping call finishes. Neither is ever
    // written to localStorage, sent to the node, or logged.
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [connecting, setConnecting] = useState(false);
    const [step, setStep] = useState("");
    const [connectError, setConnectError] = useState(null);
    const [connectedEmail, setConnectedEmail] = useState(null);
    const unmountedRef = useRef(false);

    useEffect(() => {
        let alive = true;
        let t;

        async function tick() {
            try {
                const res = await rainmakerStatus();
                if (alive) setSt(res);
            } catch (_) {}
            if (alive) t = setTimeout(tick, 5000);
        }

        tick();
        return () => { alive = false; clearTimeout(t); };
    }, []);

    // Belt-and-braces: drop the password on unmount too (navigating away
    // mid-flow), on top of the clears already in doCloudConnect below.
    useEffect(() => {
        unmountedRef.current = false;
        return () => { unmountedRef.current = true; setPassword(""); };
    }, []);

    async function copyNodeId() {
        try {
            await navigator.clipboard.writeText(st?.node_id || "");
            showToast("Node ID copied", "ok");
        } catch (_) {
            showToast("Clipboard unavailable — select and copy manually", "err");
        }
    }

    async function doAssoc(e) {
        e.preventDefault();
        if (!userId.trim() || !secret.trim() || assocBusy) return;
        setAssocBusy(true);
        const ok = await withToast(
            () => rainmakerAssoc(userId.trim(), secret.trim()),
            "Association saved — claiming node…", "Association failed");
        setAssocBusy(false);
        if (ok === SUCCESS) setSecret("");
    }

    // Bounded recursive-setTimeout wait for rainmaker.status to report
    // "ready" after the cloud mapping call — the same idiom as the poll
    // above (and RemoteCard's), just wrapped as a promise so
    // doCloudConnect() can await it inline. Deliberately NOT a second
    // ongoing setInterval: it self-terminates on success, on timeout, or if
    // the card unmounts, and it feeds the same `st` state the badge/dl
    // above already render from.
    function waitForReady(maxAttempts = 24) { // 24 * 5s ≈ 2 min
        return new Promise((resolve, reject) => {
            let attempts = 0;
            function tick() {
                if (unmountedRef.current) { reject(new Error("cancelled")); return; }
                rainmakerStatus().then((res) => {
                    if (unmountedRef.current) { reject(new Error("cancelled")); return; }
                    setSt(res);
                    if (res?.state === "ready") { resolve(res); return; }
                    attempts += 1;
                    if (attempts >= maxAttempts) {
                        reject(new Error("Timed out waiting for the node to confirm — check its status below"));
                        return;
                    }
                    setTimeout(tick, 5000);
                }).catch(() => {
                    attempts += 1;
                    if (unmountedRef.current || attempts >= maxAttempts) {
                        reject(new Error("Timed out waiting for the node to confirm — check its status below"));
                        return;
                    }
                    setTimeout(tick, 5000);
                });
            }
            tick();
        });
    }

    async function doCloudConnect(e) {
        e.preventDefault();
        if (connecting || !email.trim() || !password) return;
        if (!st?.node_id) { showToast("Node ID not loaded yet — wait a moment and retry", "err"); return; }

        setConnecting(true);
        setConnectError(null);
        const signInEmail = email.trim();
        let token = null;
        try {
            setStep("Signing in…");
            const login = await rmCloudLogin(signInEmail, password);
            token = login.token;
            setPassword("");                          // no longer needed past this point

            const { userId: cloudUserId } = await rmCloudUser(token);

            setStep("Linking hub…");
            const nodeSecret = randomHex32();
            await rainmakerAssoc(cloudUserId, nodeSecret);
            await rmCloudMap(st.node_id, nodeSecret, token);

            setStep("Waiting for confirmation…");
            await waitForReady();

            if (unmountedRef.current) return;
            setConnectedEmail(signInEmail);
            setEmail("");
            showToast("RainMaker account connected", "ok");
        } catch (err) {
            if (!unmountedRef.current) {
                const msg = err?.message || String(err);
                setConnectError(msg);
                showToast("Connect failed: " + msg, "err");
            }
        } finally {
            token = null;
            if (!unmountedRef.current) { setConnecting(false); setStep(""); }
            setPassword("");
        }
    }

    const state = st?.state;
    // Task 21 fix: claim_failed used to fall into needsAssoc too, showing
    // the association form with its submit button relabeled "Retry" — but
    // rainmaker_gw_assoc_start() (firmware) unconditionally rejects with
    // ESP_ERR_INVALID_STATE while claim_failed (no live agent to hand a
    // mapping request to; see rainmaker_gw.h's own doc comment), so that
    // button could never succeed. Association only makes sense once a
    // claim has actually gone through, i.e. unassociated.
    const needsAssoc = state === "unassociated";
    const claimFailed = state === "claim_failed";

    return (
        <Card title="RainMaker">
            <div style="margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <RainMakerStateBadge state={state} />
            </div>
            {connectedEmail && (
                <p class="field-hint" style="color:var(--success);margin-bottom:10px">
                    Connected as {connectedEmail}
                </p>
            )}
            <dl class="info-dl">
                <dt>Node ID</dt>
                <dd style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <code class="mono">{st?.node_id || "—"}</code>
                    {st?.node_id && (
                        <button type="button" class="small" onClick={copyNodeId}>Copy</button>
                    )}
                </dd>
                <dt>Devices bridged</dt>
                <dd>{st?.devices ?? "—"}</dd>
            </dl>

            {needsAssoc && (
                <>
                    <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)" />
                    <p class="field-hint">
                        Sign in with your RainMaker account to link this hub — no CLI needed.
                        Sign-in goes straight to Espressif over HTTPS; ZHAC never sees or stores
                        your password.
                    </p>
                    <form onSubmit={doCloudConnect}>
                        <label>Email / username
                            <input type="email" value={email} autocomplete="username"
                                   disabled={connecting}
                                   onInput={(e) => setEmail(e.currentTarget.value)} />
                        </label>
                        <label>Password
                            <input type="password" value={password} autocomplete="current-password"
                                   disabled={connecting}
                                   onInput={(e) => setPassword(e.currentTarget.value)} />
                        </label>
                        <button type="submit" class="primary small" disabled={connecting}>
                            {connecting ? (step || "Connecting…") : "Connect RainMaker account"}
                        </button>
                    </form>
                    {connectError && !connecting && (
                        <p class="field-hint" style="color:var(--danger)">{connectError}</p>
                    )}

                    <div style="margin-top:14px">
                        <button type="button" class="small" onClick={() => setAdvancedOpen(v => !v)}>
                            {advancedOpen ? "Hide advanced" : "Advanced — enter credentials manually (CLI)"}
                        </button>
                    </div>
                    {advancedOpen && (
                        <>
                            <p class="field-hint" style="margin-top:10px">
                                Run <code class="mono">test --addnode &lt;node_id&gt;</code> from the
                                RainMaker CLI using the Node ID above, then paste the resulting user ID
                                and secret here. Use this if your account has MFA enabled or the
                                one-click sign-in above doesn't work.
                            </p>
                            <form onSubmit={doAssoc}>
                                <label>User ID
                                    <input type="text" value={userId} autocomplete="off"
                                           onInput={(e) => setUserId(e.currentTarget.value)} />
                                </label>
                                <label>Secret
                                    <input type="password" value={secret} autocomplete="off"
                                           onInput={(e) => setSecret(e.currentTarget.value)} />
                                </label>
                                <button type="submit" class="primary small" disabled={assocBusy}>
                                    {assocBusy ? "Associating…" : "Associate"}
                                </button>
                            </form>
                        </>
                    )}
                </>
            )}
            {claimFailed && (
                <>
                    <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)" />
                    <div class="field-hint" style="color:var(--danger)">
                        Node claim failed — the device could not register with the RainMaker
                        cloud. Check the device log for the specific reason. Claiming only runs
                        once at startup, so reboot the device to retry; association becomes
                        available again only after a successful claim.
                    </div>
                </>
            )}
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Remote card — §5.6
// ---------------------------------------------------------------------------

const STATE_BADGE = {
    DISABLED:        { kind: null,   label: "Disabled" },
    IDLE_NO_WIFI:    { kind: "warn", label: "No WiFi" },
    CONNECTING:      { kind: "warn", label: "Connecting" },
    AUTHENTICATING:  { kind: "warn", label: "Authenticating" },
    READY:           { kind: "ok",   label: "Connected" },
    BACKOFF:         { kind: "warn", label: "Reconnecting" },
};

function RemoteStateBadge({ state }) {
    const entry = STATE_BADGE[state] || { kind: null, label: state || "—" };
    if (!entry.kind) return <span class="muted">{entry.label}</span>;
    return <Badge kind={entry.kind}>{entry.label}</Badge>;
}

function RemoteCard() {
    const [url,      setUrl]      = useState("");
    const [token,    setToken]    = useState("");
    const [deviceId, setDeviceId] = useState("");
    const [st,       setSt]       = useState(null);   // remote.status response

    useEffect(() => {
        let alive = true;
        let t;

        async function tick() {
            try {
                const res = await call("remote.status");
                if (alive) setSt(res);
            } catch (_) {}
            if (alive) t = setTimeout(tick, 5000);
        }

        tick();
        return () => { alive = false; clearTimeout(t); };
    }, []);

    async function doConnect() {
        try {
            await call("remote.connect", { url, token, device_id: deviceId });
            showToast("Remote connect requested", "ok");
        } catch (e) { showToast("Connect failed: " + e.message, "err"); }
    }

    async function doDisconnect() {
        try {
            await call("remote.disconnect", { forget: false });
            showToast("Disconnected", "ok");
        } catch (e) { showToast("Disconnect failed: " + e.message, "err"); }
    }

    async function doForget() {
        if (!confirm("Forget remote credentials and disconnect?")) return;
        try {
            await call("remote.disconnect", { forget: true });
            showToast("Credentials forgotten", "ok");
        } catch (e) { showToast("Failed: " + e.message, "err"); }
    }

    return (
        <Card title="Remote">
            <label>URL
                <input type="text" value={url} placeholder="wss://example.com/zhac"
                       autocomplete="off"
                       onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
            <label>Token
                <input type="password" value={token} placeholder="(paste token)"
                       autocomplete="off"
                       onInput={(e) => setToken(e.currentTarget.value)} />
            </label>
            <label>Device ID <span class="muted" style="font-weight:normal;font-size:12px">(optional — defaults to base MAC)</span>
                <input type="text" value={deviceId} placeholder="leave blank to use base MAC"
                       autocomplete="off"
                       onInput={(e) => setDeviceId(e.currentTarget.value)} />
            </label>
            <div class="btn-strip" style="margin-top:8px">
                <button class="primary small" onClick={doConnect}>Connect</button>
                <button class="secondary small" onClick={doDisconnect}>Disconnect</button>
                <button class="danger small" onClick={doForget}>Forget credentials</button>
            </div>
            {st && (
                <>
                    <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)" />
                    <dl class="info-dl">
                        <dt>State</dt>
                        <dd><RemoteStateBadge state={st.state} /></dd>
                        <dt>Connected since</dt>
                        <dd>{st.connected_since ? fmtSince(st.connected_since) : "—"}</dd>
                        <dt>Last event</dt>
                        <dd>{st.last_event_at ? fmtSince(st.last_event_at) : "—"}</dd>
                        <dt>RTT</dt>
                        <dd>{st.rtt_ms != null ? st.rtt_ms + " ms" : "—"}</dd>
                        <dt>TX drops</dt>
                        <dd>{st.tx_drops ?? "—"}</dd>
                        <dt>Auth fails</dt>
                        <dd>{st.auth_fails ?? "—"}</dd>
                    </dl>
                </>
            )}
        </Card>
    );
}

// ---------------------------------------------------------------------------

function ToggleRow({ label, checked, onChange }) {
    return (
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <label class="toggle">
                <input type="checkbox" checked={checked}
                       onChange={(e) => onChange(e.currentTarget.checked)} />
                <span class="toggle-slider" />
            </label>
            <span style="font-size:13px">{label}</span>
        </div>
    );
}

// Bearer token is rendered masked by default so a passing glance / a
// DevTools screenshot doesn't leak it. Reveal is opt-in and per-mount —
// no signal/store state, so navigating away re-masks. Copy uses the
// Clipboard API guarded for non-secure contexts (where it throws).
function ApiTokenRow({ token }) {
    const [shown, setShown] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(token);
            showToast("Token copied", "ok");
        } catch (_) {
            showToast("Clipboard unavailable — reveal + copy manually", "err");
        }
    }
    return (
        <div class="field-hint" style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>API token:</span>
            <code class="mono">{shown ? token : "•".repeat(12)}</code>
            <button type="button" class="small"
                    onClick={() => setShown(v => !v)}>
                {shown ? "Hide" : "Show"}
            </button>
            <button type="button" class="small" onClick={copy}>Copy</button>
            <button type="button" class="small" onClick={() => {
                try { localStorage.setItem("zhac_token", token); } catch (_) {}
                showToast("Token saved to this browser — reconnecting", "ok");
                setTimeout(() => location.reload(), 400);
            }}>Use here</button>
        </div>
    );
}

// Change the admin password (POST /api/auth/password). Requires the current
// password (token possession alone must not be enough to change it) and
// rotates the API token on success, signing every OTHER browser out; this
// browser re-saves the fresh token from the response and reloads.
function ChangePasswordCard() {
    const [cur, setCur]         = useState("");
    const [next, setNext]       = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy]       = useState(false);

    async function change() {
        if (busy) return;
        if (next.length < 8 || next.length > 63) {
            showToast("New password must be 8-63 characters", "err"); return;
        }
        if (next !== confirm) {
            showToast("Passwords don't match", "err"); return;
        }
        setBusy(true);
        let tok = "";
        try { tok = localStorage.getItem("zhac_token") || ""; } catch (_) {}
        let r;
        try {
            r = await fetch("/api/auth/password", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Api-Key": tok },
                body: JSON.stringify({ current: cur, new: next }),
            });
        } catch (_) {
            setBusy(false); showToast("Device unreachable", "err"); return;
        }
        setBusy(false);
        if (r.status === 401) { showToast("Current password is wrong", "err"); return; }
        if (!r.ok)            { showToast("Change failed (" + r.status + ")", "err"); return; }
        const data = await r.json().catch(() => null);
        if (data && data.token) {
            try { localStorage.setItem("zhac_token", data.token); } catch (_) {}
        }
        showToast("Password changed — reconnecting", "ok");
        setTimeout(() => location.reload(), 400);
    }

    return (
        <Card title="Admin password">
            <p class="muted" style="margin-bottom:8px;font-size:13px">
                Used to sign in to this WebUI. Changing it signs out every
                other browser and rotates the API token.
            </p>
            <label class="login-field"><span>Current password</span>
                <input type="password" value={cur} autocomplete="current-password"
                       onInput={(e) => setCur(e.currentTarget.value)} /></label>
            <label class="login-field"><span>New password</span>
                <input type="password" value={next} autocomplete="new-password"
                       placeholder="8-63 characters"
                       onInput={(e) => setNext(e.currentTarget.value)} /></label>
            <label class="login-field"><span>Confirm new password</span>
                <input type="password" value={confirm} autocomplete="new-password"
                       onInput={(e) => setConfirm(e.currentTarget.value)} /></label>
            <button class="primary small" disabled={busy || !next || !confirm}
                    onClick={change}>{busy ? "Saving…" : "Change password"}</button>
        </Card>
    );
}

// F19 (FINDINGS.md): the browser keeps the bearer token in
// localStorage.zhac_token; ws/client.js reads it on every (re)connect and
// the REST helper sends it as the X-Api-Key header. This row is the only
// place that SETS it, and it stays reachable while unauthenticated so the
// first-boot bootstrap works: the operator reads the token from the serial
// console (printed once at first boot), pastes it here, hits Save. Saving
// reloads the page so the WebSocket re-handshakes with the new token.
function ApiTokenSetupRow() {
    const [val, setVal] = useState("");
    let saved = "";
    try { saved = localStorage.getItem("zhac_token") || ""; } catch (_) {}
    function save() {
        const t = val.trim();
        if (!t) { showToast("Paste a token first", "err"); return; }
        try { localStorage.setItem("zhac_token", t); } catch (_) {}
        showToast("Token saved — reconnecting", "ok");
        setTimeout(() => location.reload(), 400);
    }
    function clearTok() {
        try { localStorage.removeItem("zhac_token"); } catch (_) {}
        showToast("Token cleared — reconnecting", "ok");
        setTimeout(() => location.reload(), 400);
    }
    return (
        <div class="field-hint" style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>This browser's token:</span>
            <code class="mono">{saved ? "saved ✓" : "not set"}</code>
            <input type="password" value={val} placeholder="paste API token"
                   onInput={(e) => setVal(e.currentTarget.value)}
                   style="flex:1;min-width:160px" />
            <button type="button" class="small" onClick={save}>Save</button>
            <button type="button" class="small" onClick={clearTok}>Clear</button>
        </div>
    );
}
