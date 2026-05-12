// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Status pill — kind ∈ {ok, warn, err}. Matches the legacy .badge classes
// so the colour swatches stay identical.
export function Badge({ kind = "ok", children }) {
    return <span class={"badge badge-" + kind}>{children}</span>;
}
