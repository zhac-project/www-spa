// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// OTA page — offers the published firmware versions that fit this hub and
// installs the chosen one; a URL form stays under "Advanced" for images that
// are not on GitHub (a local build, a test image).
//
// The browser reads GitHub Releases (releases.js) and hands the hub ONE
// download URL, exactly as the URL form does; the hub itself never talks to
// GitHub's API. Devices and the radio network are preserved structurally:
//   • CC2652 NV (PAN ID, NWK key, child table) is on the radio module,
//     never touched by either OTA path.
//   • ESP32 NVS partition (zap_store device snapshots, friendly names,
//     wifi creds) is separate from the OTA app slots — `esp_ota_write`
//     only touches the inactive `ota_X` partition.
//   • SPIFFS (SPA + Lua scripts) is its own partition too.
//
// Trigger flow is fire-and-forget at the SPA layer; the backend
// acknowledges with 202 Accepted and reboots into the new slot when
// the flash completes (~30-90 s later). The WS reconnects automatically
// after the chip comes back up.

import { useEffect, useState } from "preact/hooks";
import { triggerOtaS3, triggerOtaP4, triggerOtaSelf, otaProgress } from "../stores/ota.js";
import { status, hubKind, chipName } from "../stores/status.js";
import { showToast, withToast } from "../stores/ui.js";
import { Card } from "../components/Card.jsx";
import { fmtBytes } from "../utils.js";
import { LINKS } from "../links.js";
import { fetchReleases, chipToken, compareBuild, parseTag } from "../releases.js";

const RELEASES = LINKS.releases;
const FLASHER = LINKS.flasher;

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

const RELATION = { installed: "Installed", newer: "Newer", older: "Older", unknown: "" };

// Published versions that fit one chip, with an Install button each.
// `hub` = { chip, revision }; `installed` = the version the chip reports.
function ReleasesCard({ kind, hub, installed, chipLabel, confirmText, onInstall, busy, setBusy, target }) {
    const [st, setSt] = useState({ loading: true, rels: [], err: "" });
    useEffect(() => {
        let alive = true;
        setSt({ loading: true, rels: [], err: "" });
        fetchReleases(kind, hub)
            .then(rels => alive && setSt({ loading: false, rels, err: "" }))
            .catch(e => alive && setSt({ loading: false, rels: [], err: e.message || "failed" }));
        return () => { alive = false; };
    }, [kind, hub.chip, hub.revision]);

    async function install(rel, asset) {
        if (!confirm(`Install ${rel.tag} on the ${chipLabel}?\n\n${confirmText}`)) return;
        setBusy(true);
        await withToast(() => onInstall(asset.url), `Update to ${rel.tag} started`, "Update failed");
        setBusy(false);
    }

    const devBuild = !!installed && parseTag(installed) == null;
    return (
        <Card title={`${chipLabel} — available versions`}>
            <p class="muted">
                Installed: <code>{installed || "unknown"}</code>
                {devBuild && " (not a release build, so every version is offered)"}.
            </p>
            {st.loading && <p class="muted">Looking up releases…</p>}
            {st.err && (
                <p class="muted">
                    Could not reach GitHub from this browser ({st.err}). The hub's network may have
                    no internet access. Open the{" "}
                    <a href={RELEASES[kind] || RELEASES.wired} target="_blank" rel="noopener">releases page</a>{" "}
                    from another device, or use the URL form under <em>Advanced</em> below.
                </p>
            )}
            {!st.loading && !st.err && st.rels.length === 0 && (
                <p class="muted">No published release fits this hub yet ({hub.chip}
                {typeof hub.revision === "number" ? `, silicon v${Math.floor(hub.revision / 100)}.${hub.revision % 100}` : ""}).</p>
            )}
            {st.rels.length > 0 && (
                <table class="data-table">
                    <thead><tr><th>Version</th><th>Date</th><th></th><th></th></tr></thead>
                    <tbody>
                        {st.rels.map(rel => {
                            const rel8n = compareBuild(installed, rel.tag);
                            const asset = rel.assets[0];
                            return (
                                <tr key={rel.tag}>
                                    <td>
                                        <code>{rel.tag}</code>
                                        {rel.prerelease && <span class="muted"> pre-release</span>}
                                        {rel8n !== "unknown" && <span class="muted"> · {RELATION[rel8n]}</span>}
                                    </td>
                                    <td>{rel.date}</td>
                                    <td class="muted">
                                        <a href={rel.notesUrl} target="_blank" rel="noopener">Notes</a>
                                        {rel.sums && <>{" · "}<a href={rel.sums} target="_blank" rel="noopener">SHA256SUMS</a></>}
                                        {asset.size > 0 && ` · ${fmtBytes(asset.size)}`}
                                    </td>
                                    <td>
                                        <button class="small primary" disabled={busy || rel8n === "installed"}
                                                onClick={() => install(rel, asset)}>
                                            {rel8n === "installed" ? "Installed" : "Install"}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            <ProgressRow target={target} />
        </Card>
    );
}

function UrlForm({ label, placeholder, busy, onFlash }) {
    const [url, setUrl] = useState("");
    return (
        <>
            <label class="field">
                <span>{label}</span>
                <input type="url" placeholder={placeholder} value={url}
                       onInput={e => setUrl(e.currentTarget.value)} disabled={busy} />
            </label>
            <div class="btn-strip">
                <button onClick={() => onFlash(url.trim())} disabled={busy || !url.trim()}>Install from URL</button>
            </div>
        </>
    );
}

export function OtaPage() {
    const kind = hubKind(status.value);
    if (kind === "dual") return <DualChipOta />;
    if (!kind) return <div class="page" />;
    return <SingleChipOta kind={kind} />;
}

function SingleChipOta({ kind }) {
    const d = status.value || {};
    const [busy, setBusy] = useState(false);
    const chip = chipName(d);
    const confirmText = "The hub downloads the image, reboots into it and comes back in " +
                        "about a minute. Devices, rules and scripts are kept.";

    async function doFlash(u) {
        if (!looksLikeBinUrl(u)) {
            showToast("URL must be http(s) and end in .bin", "err");
            return;
        }
        if (!confirm(`Update the ${chip} firmware from this URL?\n\n${confirmText}`)) return;
        setBusy(true);
        await withToast(() => triggerOtaSelf(u), "Update started", "Update failed");
        setBusy(false);
    }

    if (!d.ota) {
        return (
            <div class="page">
                <h2>Firmware update</h2>
                <Card title="Not available on this build">
                    <p class="muted">
                        This firmware cannot update itself over the network yet.
                        Flash a new release over USB from your browser instead —
                        devices and settings survive as long as you do not erase
                        the flash.
                    </p>
                    <p><a href={FLASHER} target="_blank" rel="noopener">Open the browser flasher</a></p>
                </Card>
            </div>
        );
    }
    return (
        <div class="page">
            <h2>Firmware update (OTA)</h2>
            {d.ota_state === "pending" && (
                <div class="card clock-unset" role="status">
                    <p><strong>The new firmware is on trial.</strong> The hub keeps it once its
                    storage, web server and Zigbee radio check out, which takes under a minute
                    on a healthy hub. If that does not happen within ten minutes it goes back
                    to the previous version by itself. Wait for the trial to end before
                    starting another update.</p>
                </div>
            )}
            {d.ota_rollback_reason && (
                <div class="card clock-unset" role="alert">
                    <p><strong>The last update was undone.</strong> The new firmware never became
                    healthy: {d.ota_rollback_reason}. The hub is running the previous version;
                    devices, rules and settings are as they were. Try the update again, and if
                    it comes back here, report it with the reason above.</p>
                </div>
            )}
            <ReleasesCard kind={kind} hub={{ chip: chipToken(d.target), revision: d.revision }}
                          installed={d.fw || d.fw_version} chipLabel={chip} confirmText={confirmText}
                          onInstall={triggerOtaSelf} busy={busy} setBusy={setBusy} target="self" />
            <details class="card">
                <summary>Advanced: install from a URL</summary>
                <p class="muted">
                    For an image that is not a published release. Use an <code>-ota.bin</code> file
                    (not the full-flash image); the hub downloads it itself, so the URL must be
                    reachable from its network.
                </p>
                <UrlForm label="Firmware URL" busy={busy} onFlash={doFlash}
                         placeholder="https://…/zhac-wired-p4-rev1x-v2026….-ota.bin" />
            </details>
            <Card title="What survives an update">
                <ul class="kv-list">
                    <li><strong>Zigbee network and paired devices</strong> — stored in
                        their own flash partitions, which an update does not touch.</li>
                    <li><strong>Rules, scripts, names and settings</strong> — kept.</li>
                    <li><strong>The web UI</strong> — replaced together with the firmware.</li>
                </ul>
            </Card>
        </div>
    );
}

function DualChipOta() {
    const d = status.value || {};
    const [busy, setBusy] = useState(false);
    const s3Text = "The chip will reboot ~60 s after the download completes. " +
                   "WiFi + WebSocket drop briefly, then the SPA reconnects to " +
                   "the new build. Devices remain paired.";
    const p4Text = "S3 will pull the binary then stream it to P4 over the SPI/HAP " +
                   "link as ~256-byte OTA_CHUNK frames. Total transfer ~60-120 s " +
                   "for a 3 MB image. P4 reboots when done. Zigbee traffic pauses " +
                   "during the transfer; devices stay paired because the CC2652 " +
                   "radio module isn't touched.";

    async function doS3(url) {
        if (!looksLikeBinUrl(url)) { showToast("S3 URL must be http(s) and end in .bin", "err"); return; }
        if (!confirm(`Flash S3 (net-core) firmware from this URL?\n\n${s3Text}`)) return;
        setBusy(true);
        await withToast(() => triggerOtaS3(url), "S3 OTA started — watch the system reboot in 30-90 s", "S3 OTA failed");
        setBusy(false);
    }

    async function doP4(url) {
        if (!looksLikeBinUrl(url)) { showToast("P4 URL must be http(s) and end in .bin", "err"); return; }
        if (!confirm(`Flash P4 (main-core) firmware from this URL?\n\n${p4Text}`)) return;
        setBusy(true);
        await withToast(() => triggerOtaP4(url), "P4 OTA started — chunks streaming over HAP", "P4 OTA failed");
        setBusy(false);
    }

    return (
        <div class="page">
            <h2>Firmware update (OTA)</h2>
            <p class="muted">
                Both chips can be updated independently. Devices are preserved
                across OTA — the radio module keeps the network, and the ESP32
                pool reloads from NVS after reboot. Update the S3 first, then the P4,
                from the same release.
            </p>

            <ReleasesCard kind="dual" hub={{ chip: "s3" }} installed={d.fw_version}
                          chipLabel="S3 (net-core)" confirmText={s3Text}
                          onInstall={triggerOtaS3} busy={busy} setBusy={setBusy} target="s3" />
            <ReleasesCard kind="dual" hub={{ chip: "p4", revision: d.p4 && d.p4.revision }}
                          installed={d.p4 && d.p4.fw} chipLabel="P4 (main-core)" confirmText={p4Text}
                          onInstall={triggerOtaP4} busy={busy} setBusy={setBusy} target="p4" />

            <details class="card">
                <summary>Advanced: install from URLs</summary>
                <p class="muted">
                    For images that are not a published release. Use the <code>-ota.bin</code>{" "}
                    files; URLs must be reachable from the hub's LAN.
                </p>
                <UrlForm label="S3 firmware URL" busy={busy} onFlash={doS3}
                         placeholder="https://…/zhac-dualchip-s3-v2026….-ota.bin" />
                <UrlForm label="P4 firmware URL" busy={busy} onFlash={doP4}
                         placeholder="https://…/zhac-dualchip-p4-v2026….-ota.bin" />
            </details>

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
