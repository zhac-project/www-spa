// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal inline spinner for loading states. CSS handles the animation.
export function Spinner({ label = "Loading…" }) {
    return (
        <span class="spinner-wrap">
            <span class="spinner" />
            <span class="spinner-label">{label}</span>
        </span>
    );
}
