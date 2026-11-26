// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// A labelled on/off switch row (moved out of Settings.jsx so the Sound card can use it too).
export function ToggleRow({ label, checked, onChange, disabled = false, style = "" }) {
    return (
        <div style={`display:flex;align-items:center;gap:10px;margin-bottom:8px${disabled ? ";opacity:.55" : ""}${style}`}>
            <label class="toggle">
                <input type="checkbox" aria-label={label} checked={checked} disabled={disabled}
                       onChange={(e) => onChange(e.currentTarget.checked)} />
                <span class="toggle-slider" />
            </label>
            <span style="font-size:var(--text-sm)">{label}</span>
        </div>
    );
}
