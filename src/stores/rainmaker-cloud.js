// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// RainMaker CLOUD store — talks directly to Espressif's public API
// (api.rainmaker.espressif.com) over fetch, from the browser. Kept separate
// from stores/rainmaker.js on purpose: that store is thin WS wrappers to the
// ZHAC node (rainmaker.status, rainmaker.assoc.set, ...); this one never
// touches the node or the WS link — it's a straight browser-to-Espressif
// conversation. See design doc RAINMAKER_BRIDGE_DESIGN.md §10 "Onboarding
// v2 — one-click association from the web UI (Flow A)".
//
// CORS confirmed open 2026-07-22 (Access-Control-Allow-Origin: *,
// Authorization allowed, GET/PUT/POST permitted) on login2, user and
// user/nodes/mapping — a browser served off the S3 can call these directly,
// no proxy needed.
//
// Open items, unverified without a real RainMaker account (§10 "Open items
// to nail at build time" — none block writing the code, all handled
// defensively below with fallbacks, and diagnostic console logging of
// *field names only* — never values — so a real login's actual shape is
// visible in devtools without another code round-trip):
//   - which login2 response field is the usable bearer token (idtoken vs
//     accesstoken)
//   - which /v1/user field carries the user_id the node must publish
//   - what a real MFA/challenge response looks like

const RM_API = "https://api.rainmaker.espressif.com/v1";

async function parseJsonSafe(res) {
    try { return await res.json(); } catch (_) { return null; }
}

// Espressif error bodies vary by endpoint; try the common shapes before
// falling back to a generic message carrying the HTTP status.
function apiErrorMessage(body, status) {
    return (body && (body.description || body.message || body.error)) ||
        `RainMaker cloud request failed (${status})`;
}

async function rmFetch(url, opts) {
    try {
        return await fetch(url, opts);
    } catch (e) {
        throw new Error("Could not reach RainMaker cloud: " + e.message);
    }
}

// POST /v1/login2 — password auth. Returns the raw response body plus a
// best-guess `token` field (idtoken, falling back to accesstoken) for the
// Authorization header on the calls that follow — the caller can also read
// any other raw field it needs. Throws a clear, non-crashing error for
// non-2xx responses and for anything that looks like an MFA/challenge
// response (unsupported in Flow A v1 — see §10 "Not in scope").
export async function rmCloudLogin(userName, password) {
    const res = await rmFetch(`${RM_API}/login2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_name: userName, password }),
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) throw new Error(apiErrorMessage(body, res.status));

    if (body && body.challenge) {
        console.warn("[rainmaker-cloud] login2 returned a challenge field — MFA account, keys:",
            Object.keys(body));
        throw new Error("MFA accounts aren't supported yet — use the Advanced form below");
    }
    const token = (body && (body.idtoken || body.accesstoken)) || null;
    if (!token) {
        console.warn("[rainmaker-cloud] login2 succeeded but no idtoken/accesstoken field — keys:",
            Object.keys(body || {}));
        throw new Error("MFA accounts aren't supported yet — use the Advanced form below");
    }
    return { ...body, token };
}

// Best-effort decode of a JWT's payload segment to pull `custom:user_id`
// (Cognito custom attribute, RainMaker's own convention) or `sub` as a
// last-resort user_id source when /v1/user doesn't carry an obvious field.
// Not signature-verified — read-only convenience, never used for an auth
// decision, only to fill in a value we then hand back to our own node.
function decodeJwtUserId(token) {
    try {
        const parts = String(token).split(".");
        if (parts.length < 2) return null;
        let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder("utf-8").decode(bytes));
        return payload["custom:user_id"] || payload.sub || null;
    } catch (_) {
        return null;
    }
}

// GET /v1/user — resolve the user_id the node must publish via
// rainmaker.assoc.set (WS, stores/rainmaker.js). The Gate-3 evidence showed
// a `user_id` field shaped like "Google_mGaX…"; fall back to other
// plausible fields, then to decoding the idtoken JWT itself, before giving
// up with a clear error pointing at the Advanced fallback.
export async function rmCloudUser(token) {
    const res = await rmFetch(`${RM_API}/user`, {
        headers: { Authorization: token },
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) throw new Error(apiErrorMessage(body, res.status));

    console.info("[rainmaker-cloud] /v1/user response field names:", Object.keys(body || {}));
    const userId = (body && (body.user_id || body.super_admin || body.sub)) ||
        decodeJwtUserId(token);
    if (!userId) {
        console.warn("[rainmaker-cloud] no user_id-like field found — field names:",
            Object.keys(body || {}));
        throw new Error("Couldn't determine your RainMaker user ID — use the Advanced form below");
    }
    return { userId, raw: body };
}

// PUT /v1/user/nodes/mapping — link `nodeId` to the signed-in cloud account
// using the same secret just handed to the node over WS (rainmakerAssoc).
// No user_id in the body — the bearer token identifies the account
// (confirmed exact shape at Gate 3).
export async function rmCloudMap(nodeId, secret, token) {
    const res = await rmFetch(`${RM_API}/user/nodes/mapping`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ node_id: nodeId, secret_key: secret, operation: "add" }),
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) throw new Error(apiErrorMessage(body, res.status));
    return body;
}
