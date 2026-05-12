// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Build a CM6 completion extension from the generated zhac-completions list.
// Fires after `zhac.` only — we don't want to shadow user-defined names.
import { autocompletion } from "@codemirror/autocomplete";
import { ZHAC_API } from "./zhac-completions.js";

const OPTIONS = ZHAC_API.map(e => ({
    label: e.label,
    type:  "function",
    detail: e.detail,
    info:   e.info,
    // Insert the name + `(` so the cursor lands inside the arglist.
    apply:  `${e.label}(`,
    boost:  1,
}));

export const zhacAutocomplete = autocompletion({
    activateOnTyping: true,
    override: [ctx => {
        // Match "zhac.", "zhac.s", "zhac.set_", etc.
        const word = ctx.matchBefore(/zhac\.[\w]*/);
        if (!word) return null;
        if (word.from === word.to && !ctx.explicit) return null;
        return { from: word.from, options: OPTIONS, filter: true };
    }],
});
