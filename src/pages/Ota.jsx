// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// OTA page — triggers firmware updates on both chips from URLs that
// host the built binaries. Two independent flows so a partial release
// (e.g. SPA-only or P4-only) doesn't force re-flashing the chip that
// didn't change.
//
// Devices and the radio network are preserved structurally:
//   • CC2652 NV (PAN ID, NWK key, child table) is on the radio module,
//     never touched by either OTA path.
//   • ESP32 NVS partition (zap_store device snapshots, friendly names,
//     wifi creds) is separate from the OTA app slots — `esp_ota_write`
//     only touches the inactive `ota_X` partition.
//   • SPIFFS (SPA + Lua scripts) is its own partition too.
//
// So after OTA + reboot, `zigbee_pool_restore_persisted()` rehydrates
// the in-memory device pool and traffic resumes without re-pairing.
//
// Trigger flow is fire-and-forget at the SPA layer; the backend
// acknowledges with 202 Accepted and reboots into the new slot when
// the flash completes (~30-90 s later). The WS reconnects automatically
// after the chip comes back up.

import { useState } from "preact/hooks";
import { triggerOtaS3, triggerOtaP4, otaProgress } from "../stores/ota.js";
import { showToast, withToast } from "../stores/ui.js";
import { Card } from "../components/Card.jsx";
import { fmtBytes } from "../utils.js";

function ProgressRow({ target }) {
    const p = otaProgress.value[target];
    if (!p || p.state === "idle") return null;
    const pct = Math.max(0, Math.min(100, p.pct || 0));
    const kind = p.state === "err" ? "err"
                : p.state === "ok"  ? "ok" : "run";
    return (
        <div class={"ota-progress " + kind}>
            <div class="ota-progress-bar"
                 style={{ width: pct + "%" }} />
            <div class="ota-progress-label">
                {p.state === "ok"  && <span>✓ Flashed {fmtBytes(p.total)} — device rebooting</span>}
                {p.state === "err" && <span>✗ Failed: {p.err || "unknown error"}</span>}
                {p.state === "running" && (
                    <span>{pct}% — {fmtBytes(p.offset)} / {fmtBytes(p.total)}</span>
                )}
            </div>
        </div>
    );
}

function looksLikeBinUrl(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    if (!/\.bin(\?|$)/i.test(trimmed)) return false;
    return true;
}

export function OtaPage() {
    const [s3Url, setS3Url] = useState("");
    const [p4Url, setP4Url] = useState("");
    const [busy, setBusy]   = useState(false);

    async function doS3() {
        const url = s3Url.trim();
        if (!looksLikeBinUrl(url)) {
            showToast("S3 URL must be http(s) and end in .bin", "err");
            return;
        }
        if (!confirm(
            "Flash S3 (net-core) firmware?\n\n" +
            "The chip will reboot ~60 s after the download completes. " +
            "WiFi + WebSocket drop briefly, then the SPA reconnects to " +
            "the new build. Devices remain paired."
        )) return;
        setBusy(true);
        await withToast(
            () => triggerOtaS3(url),
            "S3 OTA started — watch the system reboot in 30-90 s",
            "S3 OTA failed",
        );
        setBusy(false);
    }

    async function doP4() {
        const url = p4Url.trim();
        if (!looksLikeBinUrl(url)) {
            showToast("P4 URL must be http(s) and end in .bin", "err");
            return;
        }
        if (!confirm(
            "Flash P4 (main-core) firmware?\n\n" +
            "S3 will pull the binary then stream it to P4 over the SPI/HAP " +
            "link as ~256-byte OTA_CHUNK frames. Total transfer ~60-120 s " +
            "for a 3 MB image. P4 reboots when done. Zigbee traffic pauses " +
            "during the transfer; devices stay paired because the CC2652 " +
            "radio module isn't touched."
        )) return;
        setBusy(true);
        await withToast(
            () => triggerOtaP4(url),
            "P4 OTA started — chunks streaming over HAP",
            "P4 OTA failed",
        );
        setBusy(false);
    }

    return (
        <div class="page">
            <h2>Firmware update (OTA)</h2>
            <p class="muted">
                Both chips can be updated independently. Devices are preserved
                across OTA — the radio module keeps the network, and the ESP32
                pool reloads from NVS after reboot.
            </p>

            <Card title="S3 — net-core (WiFi + REST + SPA)">
                <p class="muted">
                    Pulled directly by net-core via <code>esp_https_ota</code>.
                    URL must be reachable from the device's LAN.
                </p>
                <label class="field">
                    <span>S3 firmware URL</span>
                    <input type="url"
                           placeholder="https://example.com/zhac-net-core-v20260601-01.bin"
                           value={s3Url}
                           onInput={e => setS3Url(e.currentTarget.value)}
                           disabled={busy} />
                </label>
                <div class="btn-strip">
                    <button onClick={doS3} disabled={busy || !s3Url.trim()}>
                        Flash S3
                    </button>
                </div>
                <ProgressRow target="s3" />
            </Card>

            <Card title="P4 — main-core (Zigbee + Lua)">
                <p class="muted">
                    S3 fetches the binary then ships it to P4 in HAP OTA_CHUNK
                    frames. Slower than S3 OTA — count on 60-120 s for a
                    typical image — but the radio link stays up during
                    transfer (devices keep working, attrs continue flowing).
                </p>
                <label class="field">
                    <span>P4 firmware URL</span>
                    <input type="url"
                           placeholder="https://example.com/p4_core-v20260601-01.bin"
                           value={p4Url}
                           onInput={e => setP4Url(e.currentTarget.value)}
                           disabled={busy} />
                </label>
                <div class="btn-strip">
                    <button onClick={doP4} disabled={busy || !p4Url.trim()}>
                        Flash P4
                    </button>
                </div>
                <ProgressRow target="p4" />
            </Card>

            <Card title="What survives an OTA">
                <ul class="kv-list">
                    <li><strong>Zigbee network</strong> — PAN ID, NWK key,
                        child table. Stored on the CC2652 radio module's own
                        NV, not touched by either OTA path.</li>
                    <li><strong>Paired devices</strong> — IEEE list, friendly
                        names, model_id, manufacturer_name, endpoints, clusters.
                        Stored in the ESP32 NVS partition, separate from the
                        firmware slots.</li>
                    <li><strong>WiFi credentials</strong> — NVS-stored. After
                        reboot the device joins the same SSID automatically.</li>
                    <li><strong>Rules + scripts</strong> — rules in NVS,
                        Lua scripts in SPIFFS. Both survive the OTA.</li>
                </ul>
            </Card>
        </div>
    );
}
