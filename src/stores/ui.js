// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";

// Global UI state. Kept tiny — page-specific state lives in each page.
// connected       — WS socket state (drives the header dot)
// activePage      — current route key ('info', 'devices', ...)
// currentDeviceIeee — non-null when viewing a device detail page
// toast           — { msg, type } or null; auto-dismissed by Toast component
export const ui = signal({
    connected: false,
    activePage: "info",
    currentDeviceIeee: null,
    toast: null,
});

export function navigate(page, params = {}) {
    ui.value = {
        ...ui.value,
        activePage: page,
        currentDeviceIeee: params.ieee ?? null,
    };
}

export function showToast(msg, type = "ok") {
    ui.value = { ...ui.value, toast: { msg, type, ts: Date.now() } };
}

export function clearToast() {
    if (ui.value.toast) ui.value = { ...ui.value, toast: null };
}

// Run an async action, toast success/failure. `okMsg` null ⇒ no toast on
// success (silent OK); `errPrefix` prepends the thrown error message.
// Returns the resolved value (or undefined on failure) so callers can
// chain off a successful result without writing a second try.
export async function withToast(fn, okMsg, errPrefix) {
    try {
        const r = await fn();
        if (okMsg) showToast(okMsg, "ok");
        return r;
    } catch (e) {
        showToast(`${errPrefix}: ${e.message}`, "err");
        return undefined;
    }
}
