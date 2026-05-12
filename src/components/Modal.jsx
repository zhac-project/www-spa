// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Generic modal. Caller drives open/close via `open` prop; `onClose` fires
// on backdrop click or Escape.
import { useEffect } from "preact/hooks";

export function Modal({ open, title, children, onClose, footer }) {
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (e.key === "Escape") onClose?.(); };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div class="modal" onClick={(e) => { if (e.target.classList.contains("modal")) onClose?.(); }}>
            <div class="modal-box">
                {title && <h3>{title}</h3>}
                <div class="modal-body">{children}</div>
                <div class="modal-footer">
                    {footer ?? <button onClick={onClose}>Close</button>}
                </div>
            </div>
        </div>
    );
}
