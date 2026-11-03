// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The MQTT card's checks (review 2026-10-24 HS-13). The hub decides; these only shape what the page
// sends and what it warns about.

// mqtt:// or ws:// with user[:password]@ before the host: the user name and password go in clear. Same
// rule as the hub's mqtt_cleartext_credentials (zhac-components zap_tls_policy.h).
export function cleartextCredentials(url) {
    const m = /^(mqtt|ws):\/\/([^/?#]*)/.exec(String(url || ""));
    return !!m && m[2].includes("@");
}

export function isTlsUrl(url) {
    return /^(mqtts|wss):\/\//.test(String(url || ""));
}

// A SHA-256 fingerprint as `openssl x509 -noout -fingerprint -sha256` prints it (its whole line, or the
// AB:CD:... part, or bare hex) -> 64 lower-case hex digits; "" -> "" (no pin); anything else -> null.
export function normalizePin(s) {
    let t = String(s ?? "").trim();
    if (t === "") return "";
    if (t.includes("=")) t = t.slice(t.lastIndexOf("=") + 1);
    t = t.replace(/[:\s]/g, "").toLowerCase();
    return /^[0-9a-f]{64}$/.test(t) ? t : null;
}

// What Save sends. The status reports the broker URL without its user name and password; the hub keeps
// the stored ones when it gets that address back (zhac-components mqtt_gw_url.h), and a save of the same
// address reconnects. The pin goes only to a hub that reports one (wired, single-chip), and only when it
// changed.
export function brokerPatch(d, url, root, pinInput) {
    const patch = { broker_url: url, mqtt_root_topic: root };
    if (d.mqtt_tls_pin !== undefined) {
        const pin = normalizePin(pinInput);
        if (pin !== null && pin !== (d.mqtt_tls_pin || "")) patch.mqtt_tls_pin = pin;
    }
    return patch;
}
