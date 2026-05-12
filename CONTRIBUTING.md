# Contributing to www-spa

ZHAC Web UI — Preact 10 + Vite 5 single-page app.

## License and CLA

Licensed under **AGPL-3.0-or-later**. All contributions require signing
`CLA.md`. See that file for terms; see `CONTRIBUTORS.md` for how to sign.

## Development

```bash
npm ci
npm run dev
```

Dev server at http://localhost:5173, `/ws` proxied to
`ws://localhost:8080`. You need an S3 firmware (or a stub)
listening on port 8080 for the UI to function.

## Build for production

```bash
npm run build    # → dist/ (consumed by zhac-net-core SPIFFS)
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

- 2-space indent, single quotes, `camelCase`.
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

```bash
npm test -- --run
```

Tests use Vitest + @testing-library/preact.

## Generated completion data

Lua autocomplete data is generated from `docs/LUA_API.md` (in the
`zhac-platform` repo) via `tools/gen-zhac-completions.js`. The
generated `src/editor/zhac-completions.js` is committed.

If the API reference changes in the platform repo, regenerate:

```bash
npm run gen:completions
```

A `prebuild` hook also runs this before every `npm run build`.

## Reporting bugs

Open an issue with:
- Browser + version
- S3 firmware version (from UI footer or `zhac status`)
- Minimal repro (URL path + action sequence)
- Network tab: the failing WS frame, if any
