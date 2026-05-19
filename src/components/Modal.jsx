// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Generic modal. Caller drives open/close via `open` prop; `onClose` fires
// on backdrop click or Escape.
//
// Accessibility (WCAG 2.1 + ARIA APG dialog pattern):
//   - role="dialog" + aria-modal="true" + aria-labelledby → title <h3>.
//   - Focus moves into the dialog on open; trigger element is restored on
//     close.
//   - Tab / Shift-Tab cycle inside `.modal-box`; nothing outside the box
//     is reachable by keyboard while the modal is open.
import { useEffect, useRef } from "preact/hooks";

let modalSeq = 0;

const FOCUSABLE_SEL =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SEL))
        .filter(el => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

export function Modal({ open, title, children, onClose, footer }) {
    const boxRef = useRef(null);
    const triggerRef = useRef(null);
    const titleIdRef = useRef(null);
    if (titleIdRef.current == null) titleIdRef.current = `modal-title-${++modalSeq}`;

    useEffect(() => {
        if (!open) return;
        // Remember which element triggered the open so we can return focus
        // when the modal closes. Activates AT (screen reader) parity with
        // native dialog elements.
        triggerRef.current = document.activeElement;

        // Move initial focus into the dialog. Prefer the first focusable
        // child; fall back to the box itself (which is tabIndex=-1 so it
        // can receive programmatic focus without joining the tab order).
        const items = focusableIn(boxRef.current);
        if (items.length > 0) items[0].focus();
        else boxRef.current?.focus();

        function onKey(e) {
            if (e.key === "Escape") { onClose?.(); return; }
            if (e.key !== "Tab") return;
            const list = focusableIn(boxRef.current);
            if (list.length === 0) {
                e.preventDefault();
                boxRef.current?.focus();
                return;
            }
            const first = list[0];
            const last  = list[list.length - 1];
            const active = document.activeElement;
            // Trap: cycle wrap-around. Modern browsers don't naturally do
            // this — Tab from the last item leaks back to the page chrome
            // (browser URL bar, then background content).
            if (e.shiftKey) {
                if (active === first || !boxRef.current?.contains(active)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (active === last || !boxRef.current?.contains(active)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }

        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            // Restore focus to the trigger element if it's still in the DOM.
            const t = triggerRef.current;
            if (t && typeof t.focus === "function" && document.contains(t)) {
                try { t.focus(); } catch (_) {}
            }
            triggerRef.current = null;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div class="modal"
             onClick={(e) => { if (e.target.classList.contains("modal")) onClose?.(); }}>
            <div class="modal-box"
                 ref={boxRef}
                 role="dialog"
                 aria-modal="true"
                 aria-labelledby={title ? titleIdRef.current : undefined}
                 tabIndex={-1}>
                {title && <h3 id={titleIdRef.current}>{title}</h3>}
                <div class="modal-body">{children}</div>
                <div class="modal-footer">
                    {footer ?? <button onClick={onClose}>Close</button>}
                </div>
            </div>
        </div>
    );
}
