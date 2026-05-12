// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Mounted once in app.jsx. Watches the `ui.toast` signal and auto-dismisses.
import { useEffect } from "preact/hooks";
import { ui, clearToast } from "../stores/ui.js";

export function ToastHost() {
    const toast = ui.value.toast;
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(clearToast, 3000);
        return () => clearTimeout(t);
    }, [toast?.ts]);
    if (!toast) return null;
    return (
        <div class={"toast toast-" + (toast.type || "ok")}>{toast.msg}</div>
    );
}
