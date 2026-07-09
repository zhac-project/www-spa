// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// WebSocket transport: single long-lived connection, req/rsp correlation by id,
// and a plain event dispatcher for server-initiated messages. Auto-reconnects.
import { ui } from "../stores/ui.js";

let ws = null;
let seq = 1;
let reconnectTimer = null;
const pending = new Map();                // id -> { resolve, reject, cmd, sentAt }
const eventHandlers = new Map();          // event name -> [fn, ...]
const openHandlers = [];                  // fired every time the socket opens
const REQUEST_TIMEOUT_MS = 15000;         // belt-and-braces — reject stale requests

function wsUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // F18 (FINDINGS.md): the token no longer rides the URL query string (it
    // leaked into proxy / httpd access logs). The socket opens unauthenticated
    // and we authenticate with a first `auth` message — see the 'open' handler.
    return `${proto}://${location.host}/ws`;
}

function rejectAll(err) {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
}

function connect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    try { ws = new WebSocket(wsUrl()); }
    catch (e) {
        ui.value = { ...ui.value, connected: false };
        reconnectTimer = setTimeout(connect, 1000);
        return;
    }

    ws.addEventListener("open", () => {
        ui.value = { ...ui.value, connected: true };
        // F18: authenticate first (token in a frame, not the URL). Sent before
        // any openHandler command so the server marks this socket authed before
        // it processes them (WS messages are delivered in order).
        let token = null;
        try { token = localStorage.getItem("zhac_token"); } catch (_) {}
        if (token) {
            // The auth frame MUST carry an `id`: the firmware's on_ws_rx routes
            // only id-bearing frames to the envelope dispatcher (where the auth
            // handler lives); an id-less frame falls to the deprecated legacy
            // path and never authenticates, so the socket stays unauthed and
            // every real command is rejected. The `{id:"auth",ok:true}` reply
            // has no pending entry, so the message handler ignores it.
            try { ws.send(JSON.stringify({ id: "auth", cmd: "auth", args: { token } })); } catch (_) {}
        }
        for (const fn of openHandlers) { try { fn(); } catch (_) {} }
    });

    ws.addEventListener("close", () => {
        ui.value = { ...ui.value, connected: false };
        rejectAll(new Error("websocket closed"));
        reconnectTimer = setTimeout(connect, 1000);
    });

    ws.addEventListener("error", () => {
        // No-op — 'close' will fire next and drive reconnect.
    });

    ws.addEventListener("message", (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }

        // Server event: broadcast to handlers.
        if (msg.event) {
            const list = eventHandlers.get(msg.event);
            if (list) for (const fn of list) { try { fn(msg.data); } catch (_) {} }
            return;
        }

        // Response to a request.
        if (msg.id != null && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.ok) resolve(msg.data);
            else reject(new Error(msg.err || "request failed"));
        }
    });
}

connect();

// Fire a command; resolve with `data`, reject with Error(err).
export function call(cmd, args = {}) {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            reject(new Error("not connected"));
            return;
        }
        const id = seq++;
        const entry = { resolve, reject, cmd, sentAt: Date.now() };
        pending.set(id, entry);
        try { ws.send(JSON.stringify({ id, cmd, args })); }
        catch (e) { pending.delete(id); reject(e); return; }
        setTimeout(() => {
            if (pending.get(id) === entry) {
                pending.delete(id);
                reject(new Error("request timed out: " + cmd));
            }
        }, REQUEST_TIMEOUT_MS);
    });
}

// Subscribe to a server event. Returns an unsubscribe fn.
export function on(event, fn) {
    if (!eventHandlers.has(event)) eventHandlers.set(event, []);
    eventHandlers.get(event).push(fn);
    return () => {
        const arr = eventHandlers.get(event);
        if (!arr) return;
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
    };
}

// Run fn every time the socket opens (first connect + every reconnect).
// Returns an unsubscribe fn — symmetric with `on()` so page-level effects
// can register/teardown cleanly without leaking into `openHandlers`.
export function onOpen(fn) {
    openHandlers.push(fn);
    if (ws && ws.readyState === WebSocket.OPEN) { try { fn(); } catch (_) {} }
    return () => {
        const i = openHandlers.indexOf(fn);
        if (i >= 0) openHandlers.splice(i, 1);
    };
}
