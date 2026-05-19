# www-spa

Web UI for [ZHAC] — a Preact 10 + Vite 5 single-page app that talks
to the S3 firmware over a single WebSocket (`/ws`). Built artefact
is bundled into the S3 firmware's SPIFFS partition.

[ZHAC]: https://github.com/zhac-project/zhac-platform

## Features

- 9 pages: Devices, Device detail, Groups, Scripts, Rules,
  Settings, Logs, Metrics, Alerts.
- Shared WS client with request/reply + push-event handling.
- Built-in Lua editor (CodeMirror 6, lazy-loaded).
- Signals-based state (`@preact/signals`) — no Redux, no Context mess.
- Single-chunk editor bundle (manual `rollupOptions.manualChunks`)
  so embedded httpd's socket pool doesn't get exhausted on first
  editor open.

## Development

```bash
git clone https://github.com/zhac-project/www-spa.git
cd www-spa
npm ci
npm run dev          # Vite dev server on localhost:5173,
                     # proxies /ws → ws://localhost:8080
```

You need the S3 firmware running (or a WS stub) on `localhost:8080`
for the UI to have something to talk to.

## Build for flashing

```bash
npm run build        # output in dist/
```

The S3 firmware's SPIFFS partition is generated from `dist/`.

## Tree

```
www-spa/
├── src/
│   ├── pages/           (9 pages, 1 file per page)
│   ├── components/      (shared UI primitives)
│   ├── editor/          (CodeMirror theme, autocomplete, linter)
│   ├── stores/          (@preact/signals state containers)
│   ├── ws/              (WS client + envelope/reply matching)
│   ├── main.jsx
│   └── styles.css
├── public/
├── tools/
│   └── gen-zhac-completions.js  (parses docs/LUA_API.md → completions)
├── package.json
├── vite.config.js
└── index.html
```

## Protocol

WebSocket only — no REST (one exception: `POST /api/scripts/:name`
for Lua-script upload, which exceeds the httpd WS frame cap).
Request/reply envelope:
```
client → { id, cmd, args }
server → { id, ok, data }   (success)
server → { id, ok: false, err: { code, msg } }   (error)
```

Push events (no `id`): `device.added`, `device.updated`,
`device.removed`, `attr.bulk`, `alert.*`.

See [`docs/WS_API.md`](https://github.com/zhac-project/zhac-platform/src/branch/main/docs/WS_API.md)
in the platform repo for the full command list.

## Routing

Hash-based, no router library. URLs look like `#/devices`,
`#/device/<ieee>`, `#/settings`, etc. The `hashchange` listener in
`stores/ui.js` keeps the `ui.activePage` signal and the URL in sync, so
back/forward, manual hash edits, and bookmarks all replay the right
page. `navigate(page, { ieee })` updates `location.hash`; the
re-entrant hashchange path then commits the signal.

## Environment variables

| Variable        | Used by                       | Purpose                                                   |
|-----------------|-------------------------------|-----------------------------------------------------------|
| `ZHAC_LUA_DOC`  | `tools/gen-zhac-completions`  | Absolute path to `LUA_API.md`. Overrides auto-discovery.  |

If `LUA_API.md` cannot be located, the generator emits an empty
completions module and prints a warning instead of failing the build —
fresh checkouts without a sibling `zhac-docs/` clone still build.

## Content Security Policy

The SPA does NOT ship a `<meta http-equiv="Content-Security-Policy">`
because a meta-tag CSP cannot cover WebSocket (`connect-src` for the
`ws://` / `wss://` data path) on Chromium. CSP MUST be emitted by the S3
httpd as a response header on `/` and `/assets/*`. Recommended minimum
(applied in the S3 firmware's `esp_http_server` config):

```
Content-Security-Policy:
    default-src 'self';
    connect-src 'self' ws: wss:;
    script-src  'self';
    style-src   'self' 'unsafe-inline';
    img-src     'self' data:;
    base-uri    'none';
    frame-ancestors 'none';
```

`'unsafe-inline'` is required by CodeMirror 6's inline style injection
and cannot currently be tightened without forking CM. Everything user-
authored (rule names, Lua source, log messages) is rendered via JSX text
nodes — there is no `dangerouslySetInnerHTML` anywhere in `src/`.

## Open-source readiness (deferred)

- Dark theme (`prefers-color-scheme: dark`). The `:root` palette is
  light-only today; deferred because it requires re-vetting every
  Badge / Card / log-viewer colour pair against WCAG AA.
- i18n. All strings are hardcoded English. Deferred — wire-up requires
  picking an i18n approach and adding extraction tooling.

## License

GNU AGPL v3 or later. See `LICENSE`.

## Contributing

See `CONTRIBUTING.md`. All contributions require signing `CLA.md`.

## Versioning

Releases tagged `vYYYYMMDDVV`. See `zhac-platform` README for the
scheme.
