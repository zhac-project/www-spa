// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { call } from "../ws/client.js";
import { createCrudStore } from "./crud.js";

// ScriptMeta: { name, size, status? }
const store = createCrudStore({
    name: "script", listCmd: "script.list", listKey: "scripts", idKey: "name",
});
export const scripts          = store.sig;
export const bootstrapScripts = store.bootstrap;

export function readScript(name)           { return call("script.read",  { name }); }
export function deleteScript(name)         { return call("script.delete",{ name }); }
export function runScript(name, args = {}) { return call("script.run",   { name, args }); }

// Saves go via HTTP POST instead of WS — the esp_http_server WebSocket
// path caps inbound frames at CONFIG_HTTPD_WS_RECEIVE_BUFFER (~4 KB
// default) and trips with `httpd_ws_recv_frame: WS Message too long`
// once a Lua script exceeds that. The REST endpoint handles up to
// HAP_SCRIPT_MAX_SRC bytes of raw body.
export async function writeScript(name, src) {
    let token = null;
    try { token = localStorage.getItem("zhac_token"); } catch (_) {}
    const headers = { "Content-Type": "text/plain;charset=utf-8" };
    if (token) headers["X-Api-Key"] = token;
    const r = await fetch(`/api/scripts/${encodeURIComponent(name)}`, {
        method: "POST", headers, body: src ?? "",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    try { return await r.json(); } catch (_) { return { ok: true }; }
}
