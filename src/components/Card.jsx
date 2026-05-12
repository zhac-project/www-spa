// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// A labelled card. `title` renders in the small-caps header style used
// across the info and settings pages.
export function Card({ title, children, className = "" }) {
    return (
        <div class={"card " + className}>
            {title && <h3>{title}</h3>}
            {children}
        </div>
    );
}
