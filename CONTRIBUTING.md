# Contributing to www-spa

ZHAC Web UI — Preact 10 + Vite 8 single-page app, served by every ZHAC firmware
(dual-chip S3, single-chip S3, wired P4/S31).

## License and CLA

Licensed under **AGPL-3.0-or-later**. All contributions require signing
`CLA.md`. See that file for terms; see `CONTRIBUTORS.md` for how to sign.

## Development

```bash
npm ci
npm run dev
```

Dev server at http://localhost:5173, `/ws` and `/api` proxied to
`localhost:8080`. No hardware? Run the demo hub there — it answers the
same commands as a wired hub, with six realistic devices:

```bash
npm run demo     # terminal 1: fake hub on :8080
npm run dev      # terminal 2: hot-reload UI on :5173
```

With real firmware instead, point the proxy at your hub's address in
`vite.config.js`.

## Build for production

```bash
npm run build    # → dist/ (packed into the firmware's SPIFFS partition)
```

## SPDX headers for new files

JavaScript / JSX / CSS:
```js
// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
```

HTML:
```html
<!--
SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
SPDX-License-Identifier: AGPL-3.0-or-later
-->
```

## Code style

- 4-space indent, double quotes, `camelCase` — match the file you are in.
- Prefer `@preact/signals` over `useState` / `useReducer`.
- No Redux, no Context-API for cross-cutting state — signals handle it.
- Components in `src/components/` should be stateless where possible.
- Pages in `src/pages/` own their own signal graph.
- Shared WS helpers live in `src/ws/`.

## Bundle size — important

The embedded S3 httpd has a bounded socket pool. Splitting the app
into many small chunks triggered an ENFILE storm during first editor
load — fixed by bundling all CodeMirror + `src/editor/` into a single
`cm-editor` chunk (see `vite.config.js` `manualChunks`).

Rule: **don't create many tiny code-split chunks**. If you add a new
heavy dependency that warrants lazy-loading, bundle it with
semantically-related modules so one open = one HTTP round-trip.

## Testing

There is no automated test suite. What runs today:

- `npm run build` runs `tools/check-tokens.mjs` first and fails on any
  design token that does not resolve.
- Check UI changes by hand against the demo hub (`npm run demo`), in
  light and dark theme and at phone width.
- Anything that talks to a new firmware command also needs a run on real
  hardware before release — the demo hub only proves the UI side.

## Generated completion data

Lua autocomplete data is generated from `LUA_API.md` (in the
`zhac-docs` repo) via `tools/gen-zhac-completions.js`. The
generated `src/editor/zhac-completions.js` is committed.

If the API reference changes in the platform repo, regenerate:

```bash
npm run gen:completions
```

A `prebuild` hook also runs this before every `npm run build`.

## Reporting bugs

Use the [bug report form](https://github.com/zhac-project/zhac-platform/issues/new?template=bug.yml).
Useful extras for UI bugs:
- Browser + version
- Firmware and web UI version (Info page)
- Minimal repro (URL path + action sequence)
- Network tab: the failing WS frame, if any
