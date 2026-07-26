// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Tier A token contract for www-spa. Plain node, no test framework: this repo
// has no harness and a CSS remap does not justify introducing one.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// Strip comments so a token named only inside a comment can never satisfy a probe.
const SRC = readFileSync(join(HERE, '../src/styles.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const REQUIRED = [
  '--font-sans', '--font-mono',
  '--text-2xs', '--text-xs', '--text-sm', '--text-base', '--text-md',
  '--text-lg', '--text-xl', '--text-2xl', '--text-3xl',
  '--weight-regular', '--weight-medium', '--weight-semibold', '--weight-bold',
  '--radius-sm', '--radius-control', '--radius-input', '--radius-card',
  '--radius-card-lg', '--radius-pill',
  '--shadow-1', '--shadow-2', '--shadow-3', '--color-focus',
];

const fail = [];
const declares = (src, t) => new RegExp(`^\\s*${t}\\s*:`, 'm').test(src);

const missing = REQUIRED.filter((t) => !declares(SRC, t));
if (missing.length) fail.push(`missing tokens: ${missing.join(', ')}`);

// A media query here would double-drive the theme and fight ui.js's mirroring,
// breaking the explicit "light" override.
if (/@media[^{]*prefers-color-scheme/.test(SRC)) {
  fail.push('prefers-color-scheme block present — theming must stay data-theme only');
}

const darkAt = SRC.indexOf(':root[data-theme="dark"]');
if (darkAt < 0) fail.push('no :root[data-theme="dark"] block');
else {
  const dark = SRC.slice(darkAt);
  for (const t of ['--bg', '--card-bg', '--text', '--border', '--surface', '--blue']) {
    if (!declares(dark, t)) fail.push(`${t} not overridden in the dark block`);
  }
}

// Tier A ships zero font bytes.
if (/@font-face|fontsource/i.test(SRC)) fail.push('font files present — Tier A is system-stack only');

if (fail.length) {
  console.error('token contract FAILED:');
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`token contract OK (${REQUIRED.length} tokens)`);
