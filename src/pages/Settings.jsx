// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings: WiFi status/scan/connect/forget, MQTT, Zigbee network, misc toggles,
// OTA inputs, danger-zone reset. Every action maps to a WS command.
import { useEffect, useState } from "preact/hooks";
import { call } from "../ws/client.js";
import { status } from "../stores/status.js";
import { showToast, navigate } from "../stores/ui.js";
import { Card } from "../components/Card.jsx";
import { Badge } from "../components/Badge.jsx";

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
                </Card>

                <Card title="OTA">
                    <p class="muted" style="margin-bottom:8px;font-size:13px">
                        Firmware updates live on the dedicated OTA page, which
                        validates the URL, prompts before flashing, and shows
                        progress for both chips.
                    </p>
                    <button class="primary small"
                            onClick={() => navigate("ota")}>Open OTA page</button>
                </Card>
            </div>
        </div>
    );
}

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
        </div>
    );
}
