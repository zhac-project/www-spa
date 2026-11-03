// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { call } from "../ws/client.js";
import { createCrudStore } from "./crud.js";
import { hubKind } from "./status.js";

// ScriptMeta: { name, size, status? }
const store = createCrudStore({
    name: "script", listCmd: "script.list", listKey: "scripts", idKey: "name",
});
export const scripts          = store.sig;
export const bootstrapScripts = store.bootstrap;

export function readScript(name)           { return call("script.read",  { name }); }
export function deleteScript(name)         { return call("script.delete",{ name }); }
export function runScript(name, args = {}) { return call("script.run",   { name, args }); }
// Apply: restart the Lua engine so handlers use the saved text (firmware that reports remote_scripts).
export function reloadScripts()            { return call("script.reload"); }

// A script source as the raw body of a POST to the hub's REST routes.
async function postScript(path, src) {
    let token = null;
    try { token = localStorage.getItem("zhac_token"); } catch (_) {}
    // Cache-Control: no-store guards against a future service-worker
    // intercept caching a state-mutating POST. Browsers don't cache POST
    // by default; this is a belt-and-braces declaration for the day a SW
    // appears. `cache: "no-store"` on the request init covers the fetch
    // cache layer too.
    const headers = {
        "Content-Type":  "text/plain;charset=utf-8",
        "Cache-Control": "no-store",
    };
    if (token) headers["X-Api-Key"] = token;
    const r = await fetch(path, { method: "POST", headers, body: src ?? "", cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    return r;
}

// Saves go via HTTP POST instead of WS — the esp_http_server WebSocket
// path caps inbound frames at CONFIG_HTTPD_WS_RECEIVE_BUFFER (~4 KB
// default) and trips with `httpd_ws_recv_frame: WS Message too long`
// once a Lua script exceeds that. The REST endpoint handles up to
// HAP_SCRIPT_MAX_SRC bytes of raw body.
export async function writeScript(name, src) {
    const r = await postScript(`/api/scripts/${encodeURIComponent(name)}`, src);
    try { return await r.json(); } catch (_) { return { ok: true }; }
}

// The editor's syntax check: {ok, err, line}. A source too long for one
// WebSocket frame goes over REST, which only the wired and single-chip hubs
// have: the dual-chip S3 would save it as a script named "check", so there a
// long source is not checked as it is typed.
export async function checkScript(src) {
    try { return await call("script.check", { name: "check", src }); }
    catch (e) {
        const kind = hubKind();
        if (e.message !== "too_large" || (kind !== "wired" && kind !== "single")) throw e;
        return (await postScript("/api/scripts/check/check", src)).json();
    }
}
