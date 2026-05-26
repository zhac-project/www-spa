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

// Sentinel returned by `withToast` on success — explicit Symbol so callers
// can use `if (ok === SUCCESS) close()` and stay correct when the wrapped
// function legitimately resolves to a falsy value (null / false / 0 /
// `{ok: false}` from a server that opts to encode failures in the body).
export const SUCCESS = Symbol("withToast.success");

// ---------------------------------------------------------------------------
// Hash routing — minimal, no library.
//
// URL shape:
//   #/info
//   #/devices
//   #/device/<ieee>
//   #/groups, #/rules, #/scripts, #/log, #/diag, #/ota, #/settings
//
// `navigate(page, { ieee })` writes the corresponding hash; the
// `hashchange` listener drives `ui.activePage` so back/forward, manual
// edits, and bookmarks all replay the right page. We bypass the hash write
// when the new state already matches (avoids history-spam on re-clicks).
// ---------------------------------------------------------------------------
const VALID_PAGES = new Set([
    "info", "devices", "device", "groups", "rules",
    "scripts", "log", "diag", "ota", "settings",
]);

function buildHash(page, ieee) {
    if (page === "device" && ieee) return "#/device/" + encodeURIComponent(ieee);
    return "#/" + page;
}

function parseHash(hash) {
    if (!hash) return { page: "info", ieee: null };
    // Tolerate both `#/foo` and bare `#foo` for forgiving manual edits.
    let h = hash;
    if (h.startsWith("#")) h = h.slice(1);
    if (h.startsWith("/")) h = h.slice(1);
    if (!h) return { page: "info", ieee: null };
    const parts = h.split("/").filter(Boolean);
    const page = parts[0];
    if (!VALID_PAGES.has(page)) return { page: "info", ieee: null };
    if (page === "device") {
        const ieee = parts[1] ? decodeURIComponent(parts[1]) : null;
        return { page, ieee };
    }
    return { page, ieee: null };
}

function applyHash(hash, { writeHash = false } = {}) {
    const { page, ieee } = parseHash(hash);
    const cur = ui.value;
    if (cur.activePage === page && cur.currentDeviceIeee === ieee) return;
    ui.value = { ...cur, activePage: page, currentDeviceIeee: ieee };
    if (writeHash && typeof location !== "undefined") {
        const want = buildHash(page, ieee);
        if (location.hash !== want) location.hash = want;
    }
}

if (typeof window !== "undefined") {
    // Initial parse — runs on module load (before App mounts), so the
    // first render already shows the correct page.
    applyHash(location.hash || "");
    window.addEventListener("hashchange", () => applyHash(location.hash || ""));
}

export function navigate(page, params = {}) {
    const ieee = params.ieee ?? null;
    if (typeof location !== "undefined") {
        const want = buildHash(page, ieee);
        if (location.hash !== want) {
            // Setting `location.hash` fires `hashchange`, which will route
            // through `applyHash` and update the signal. Single source of
            // truth — same path as a back-button event.
            location.hash = want;
            return;
        }
    }
    // SSR / no-window fallback (also: same-target re-click).
    ui.value = {
        ...ui.value,
        activePage: page,
        currentDeviceIeee: ieee,
    };
}

export function hrefFor(page, params = {}) {
    return buildHash(page, params.ieee ?? null);
}

// ── Theme (light / dark / system) ────────────────────────────────────────
// Persisted in localStorage under key "theme". Three modes:
//   "system" — follow OS prefers-color-scheme (default for fresh installs)
//   "light"  — force light
//   "dark"   — force dark
// Applied by mutating <html data-theme="..."> which the CSS switches on.
// An inline script in index.html applies the saved choice BEFORE CSS
// loads so there's no light-on-dark flash on a dark-mode browser.

const THEME_KEY = "theme";

function readSavedTheme() {
    try {
        const v = localStorage.getItem(THEME_KEY);
        return v === "light" || v === "dark" || v === "system" ? v : "system";
    } catch { return "system"; }
}

export const themeMode = signal(readSavedTheme());

function resolveEffectiveTheme(mode) {
    if (mode === "light" || mode === "dark") return mode;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
    const effective = resolveEffectiveTheme(themeMode.value);
    document.documentElement.dataset.theme = effective;
}

export function setTheme(mode) {
    const v = (mode === "light" || mode === "dark" || mode === "system") ? mode : "system";
    try { localStorage.setItem(THEME_KEY, v); } catch {}
    themeMode.value = v;
}

// React to runtime theme changes (user picks a new mode).
themeMode.subscribe(applyTheme);

// React to OS-level pref changes (only meaningful when mode === "system").
try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (themeMode.value === "system") applyTheme();
    });
} catch {
    // older Safari may not support addEventListener on MediaQueryList — fall
    // back gracefully. The effective theme is still applied at boot via the
    // inline script + the subscribe() call above.
}

export function showToast(msg, type = "ok") {
    ui.value = { ...ui.value, toast: { msg, type, ts: Date.now() } };
}

export function clearToast() {
    if (ui.value.toast) ui.value = { ...ui.value, toast: null };
}

// Run an async action, toast success/failure. `okMsg` null ⇒ no toast on
// success (silent OK); `errPrefix` prepends the thrown error message.
// Returns the `SUCCESS` sentinel on success, `undefined` on caught failure.
// Callers should branch on `=== SUCCESS` so a server that resolves to a
// falsy value (null / false / `{ok:false}`) still routes as success.
export async function withToast(fn, okMsg, errPrefix) {
    try {
        await fn();
        if (okMsg) showToast(okMsg, "ok");
        return SUCCESS;
    } catch (e) {
        showToast(`${errPrefix}: ${e.message}`, "err");
        return undefined;
    }
}
