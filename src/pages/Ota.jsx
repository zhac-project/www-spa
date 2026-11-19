// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// OTA page — offers the published firmware versions that fit this hub and
// installs the chosen one; a URL form stays under "Advanced" for images that
// are not on GitHub (a local build, a test image).
//
// The browser reads GitHub Releases (releases.js) and hands the hub ONE
// download URL, exactly as the URL form does; the hub itself never talks to
// GitHub's API. The hub writes only its inactive firmware slot: the Zigbee
// network, devices, rules and scripts live in partitions of their own.
//
// `ota.update` answers at once; the hub downloads the image and restarts into
// it. Its ota.* push events (target "self") drive the progress bar, and the
// WebSocket reconnects once the hub is back.

import { useEffect, useState } from "preact/hooks";
import { triggerOtaSelf, otaProgress } from "../stores/ota.js";
import { status, hubKind, chipName } from "../stores/status.js";
import { showToast, withToast } from "../stores/ui.js";
import { Card } from "../components/Card.jsx";
import { fmtBytes } from "../utils.js";
import { LINKS } from "../links.js";
import { fetchReleases, chipToken, compareBuild, tagOrder } from "../releases.js";

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

// A wired hub installs an older release only when asked to (firmware review
// 2026-10-24 HS-10); the confirm says what that can cost.
const OLDER_RISK = "may lack fixes and may not read everything this version saved; if devices are " +
                   "missing afterwards, update again.";
const OLDER_TEXT = `\n\nThis is an older release than the one installed. It ${OLDER_RISK}`;
const OLDER_URL_TEXT = `\n\nIf this is an older release than the one installed, it ${OLDER_RISK}`;   // its version is unknown here

// Published versions that fit one chip, with an Install button each.
// `hub` = { chip, revision }; `installed` = the version the chip reports.
function ReleasesCard({ hub, installed, chipLabel, confirmText, onInstall, busy, setBusy, target }) {
    const [st, setSt] = useState({ loading: true, rels: [], err: "" });
    useEffect(() => {
        let alive = true;
        setSt({ loading: true, rels: [], err: "" });
        fetchReleases(hub)
            .then(rels => alive && setSt({ loading: false, rels, err: "" }))
            .catch(e => alive && setSt({ loading: false, rels: [], err: e.message || "failed" }));
        return () => { alive = false; };
    }, [hub.chip, hub.revision]);

    async function install(rel, asset, older) {
        if (!confirm(`Install ${rel.tag} on the ${chipLabel}?\n\n${confirmText}${older ? OLDER_TEXT : ""}`)) return;
        setBusy(true);
        await withToast(() => onInstall(asset.url, older), `Update to ${rel.tag} started`, "Update failed");
        setBusy(false);
    }

    const devBuild = !!installed && tagOrder(installed) == null;
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
                    <a href={RELEASES} target="_blank" rel="noopener">releases page</a>{" "}
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
                                                onClick={() => install(rel, asset, rel8n === "older")}>
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

// The hub refuses an older version unless "Allow an older version" is ticked.
function UrlForm({ label, placeholder, busy, onFlash }) {
    const [url, setUrl] = useState("");
    const [older, setOlder] = useState(false);
    return (
        <>
            <label class="field">
                <span>{label}</span>
                <input type="url" placeholder={placeholder} value={url}
                       onInput={e => setUrl(e.currentTarget.value)} disabled={busy} />
            </label>
            <label class="field">
                <span><input type="checkbox" checked={older} disabled={busy}
                             onChange={e => setOlder(e.currentTarget.checked)} /> Allow an older version</span>
            </label>
            <div class="btn-strip">
                <button onClick={() => onFlash(url.trim(), older)} disabled={busy || !url.trim()}>Install from URL</button>
            </div>
        </>
    );
}

export function OtaPage() {
    if (!hubKind(status.value)) return <div class="page" />;   // until the first status lands
    return <HubOta />;
}

function HubOta() {
    const d = status.value || {};
    const [busy, setBusy] = useState(false);
    const chip = chipName(d);
    const confirmText = "The hub downloads the image, reboots into it and comes back in " +
                        "about a minute. Devices, rules and scripts are kept.";

    async function doFlash(u, older) {
        if (!looksLikeBinUrl(u)) {
            showToast("URL must be http(s) and end in .bin", "err");
            return;
        }
        if (!confirm(`Update the ${chip} firmware from this URL?\n\n${confirmText}${older ? OLDER_URL_TEXT : ""}`)) return;
        setBusy(true);
        await withToast(() => triggerOtaSelf(u, older), "Update started", "Update failed");
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
                    storage, web server and Zigbee radio have stayed healthy for five minutes in
                    a row. If that does not happen within ten minutes, or the hub restarts before
                    then, it goes back to the previous version by itself. Wait for the trial to
                    end before starting another update.</p>
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
            <ReleasesCard hub={{ chip: chipToken(d.target), revision: d.revision }}
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
