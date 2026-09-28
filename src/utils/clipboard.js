// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Clipboard write that also works over plain HTTP. The hub is commonly
// reached at a bare LAN IP (e.g. http://10.42.0.66), where the page is not a
// secure context and `navigator.clipboard` is unavailable -- the modern API
// throws or is simply undefined there. Falls back to the classic hidden
// <textarea> + document.execCommand("copy") trick, which works on any origin.
// Never throws: callers get a boolean back and show their own feedback.
export async function copyText(text) {
    try {
        if (typeof window !== "undefined" && window.isSecureContext &&
            typeof navigator !== "undefined" && navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) {
        // Fall through to the textarea fallback below.
    }
    try {
        if (typeof document === "undefined") return false;
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.left = "-1000px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return !!ok;
    } catch (_) {
        return false;
    }
}
