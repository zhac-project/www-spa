// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// CM6 linter adapter that forwards the editor's doc to the P4 Lua
// parser via the `script.check` WS command. Returns an empty
// diagnostic list on clean parse; on failure, marks the start of the
// offending line with an error squiggle + hover tooltip.
//
// Debounced by CM6's linter (delay option) so we only call the P4
// parser after the user pauses typing.
import { linter } from "@codemirror/lint";
import { call } from "../ws/client.js";

function diagnosticsForError(doc, err, line) {
    // CM6 lines are 1-based; clamp to document length just in case.
    const n = Math.max(1, Math.min(doc.lines, line || 1));
    const l = doc.line(n);
    return [{
        from: l.from,
        to:   l.to,
        severity: "error",
        message:  err || "parse error",
    }];
}

export const zhacLinter = linter(async view => {
    const src = view.state.doc.toString();
    if (!src.trim()) return [];
    let r;
    try {
        r = await call("script.check", { name: "check", src });
    } catch (_) {
        // Transport failure — don't spam squiggles; just skip this pass.
        return [];
    }
    if (!r || r.ok) return [];
    return diagnosticsForError(view.state.doc, r.err, r.line);
}, { delay: 600 });
