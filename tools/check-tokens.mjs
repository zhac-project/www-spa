// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Tier A token contract for www-spa. Plain node, no test framework: this repo
// has no harness and a CSS remap does not justify introducing one.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SRC_DIR = join(HERE, '../src');
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

// Extract a single brace-balanced rule block starting at the `{` that follows
// `selectorStart`. Returns the block INCLUDING both braces, or null if the
// selector wasn't found, or the braces never balance (e.g. a truncated file).
// This is what makes the dark-block and :root probes below scoped to the
// actual rule body instead of "everything from here to EOF".
const extractBlock = (src, selectorStart) => {
  if (selectorStart < 0) return null;
  const braceStart = src.indexOf('{', selectorStart);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return null;
};

// Light `:root { ... }`. Matched with a regex requiring `{` directly (modulo
// whitespace) after `:root`, so it can't also match
// `:root[data-theme="dark"] { ... }` (which has `[` right after `:root`).
const lightMatch = /:root\s*\{/.exec(SRC);
const lightBlock = lightMatch ? extractBlock(SRC, lightMatch.index) : null;
if (!lightBlock) {
  fail.push('no :root { } block (or its braces do not balance)');
} else {
  const missing = REQUIRED.filter((t) => !declares(lightBlock, t));
  if (missing.length) fail.push(`missing tokens: ${missing.join(', ')}`);
}

// A media query here would double-drive the theme and fight ui.js's mirroring,
// breaking the explicit "light" override.
if (/@media[^{]*prefers-color-scheme/.test(SRC)) {
  fail.push('prefers-color-scheme block present — theming must stay data-theme only');
}

const darkAt = SRC.indexOf(':root[data-theme="dark"]');
if (darkAt < 0) {
  fail.push('no :root[data-theme="dark"] block');
} else {
  const darkBlock = extractBlock(SRC, darkAt);
  if (!darkBlock) {
    fail.push('dark block braces do not balance');
  } else {
    for (const t of ['--bg', '--card-bg', '--text', '--border', '--surface', '--blue']) {
      if (!declares(darkBlock, t)) fail.push(`${t} not overridden in the dark block`);
    }
  }
}

// Tier A ships zero font bytes.
if (/@font-face|fontsource/i.test(SRC)) fail.push('font files present — Tier A is system-stack only');

// Custom-property values are unvalidated token streams at declaration time,
// so a later `oklch()` line for the same property always wins the cascade
// regardless of browser support — the hex line above it is not a fallback.
// var() substitution is then all-or-nothing at computed-value time, so a
// browser that can't parse oklch() does NOT fall back to the hex value; the
// consuming property goes invalid (inherit/initial). Hex-only, always.
if (/oklch\(/.test(SRC)) {
  fail.push('oklch( present in styles.css — hex-only tokens, no cascade "fallback" (see review finding)');
}

// Every `var(--x)` reference anywhere under src/ (.css, .js, .jsx) must resolve
// to a `--x` declared somewhere in styles.css. This catches a typo'd token
// (e.g. `var(--text-x)`) that would otherwise ship silently — the probes above
// only ever check that tokens are *declared*, never that references resolve.
const declared = new Set();
for (const m of SRC.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1]);

const stripJsComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (['.css', '.js', '.jsx'].includes(extname(entry))) out.push(p);
  }
  return out;
};

const refFail = [];
for (const file of walk(SRC_DIR)) {
  const raw = readFileSync(file, 'utf8');
  const text = extname(file) === '.css'
    ? raw.replace(/\/\*[\s\S]*?\*\//g, '')
    : stripJsComments(raw);
  const re = /var\(\s*--([a-zA-Z0-9-]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (!declared.has(name)) {
      const line = text.slice(0, m.index).split('\n').length;
      refFail.push(`${relative(REPO_ROOT, file)}:${line}: var(--${name}) has no declaration in styles.css`);
    }
  }
}
if (refFail.length) fail.push(`unresolved token reference(s):\n    ${refFail.join('\n    ')}`);

if (fail.length) {
  console.error('token contract FAILED:');
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`token contract OK (${REQUIRED.length} tokens)`);
