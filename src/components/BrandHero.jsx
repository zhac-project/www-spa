// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Brand block: the mark above the word. With `darkLogo` (the sign-in card) the
// dark theme swaps both for the dark logo, which carries the word (CSS on
// :root[data-theme="dark"]). The splash never takes the dark logo, so a dark
// page does not download the biggest image on every load. loading="lazy" keeps
// the hidden dark logo from being fetched on a light page; it must come before
// src (Preact sets props in order, and a src set first starts an eager fetch).
import markUrl from "../assets/brand/zhac-mark.png";
import darkLogoUrl from "../assets/brand/logo-dark.png";

export function BrandHero({ darkLogo = false }) {
    return (
        <div class={darkLogo ? "brand-hero brand-hero-swap" : "brand-hero"}>
            <img class="brand-hero-mark" src={markUrl} alt="" width="64" height="64" />
            <span class="brand brand-hero-word">ZHAC</span>
            {darkLogo && (
                <img class="brand-hero-dark" loading="lazy" src={darkLogoUrl} alt="ZHAC"
                     width="160" height="163" />
            )}
        </div>
    );
}
