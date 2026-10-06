// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Brand block for the splash and the sign-in card. Light theme: the mark above
// the word. Dark theme: the dark logo, which carries the word, replaces both
// (CSS on :root[data-theme="dark"]). loading="lazy" keeps the hidden dark logo
// from being fetched at all on a light page — it is the biggest image. It must
// come before src: Preact sets props in order, and a src set first starts an
// eager fetch.
export function BrandHero() {
    return (
        <div class="brand-hero">
            <img class="brand-hero-mark" src="/zhac-mark.png" alt="" width="64" height="64" />
            <span class="brand brand-hero-word">ZHAC</span>
            <img class="brand-hero-dark" loading="lazy" src="/zhac-logo-dark.png" alt="ZHAC"
                 width="160" height="163" />
        </div>
    );
}
