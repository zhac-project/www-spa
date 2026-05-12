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

WebSocket only — no REST. Request/reply envelope:
```
client → { id, cmd, args }
server → { id, ok, data }   (success)
server → { id, ok: false, err: { code, msg } }   (error)
```

Push events (no `id`): `device.added`, `device.updated`,
`device.removed`, `attr.bulk`, `alert.*`.

See [`docs/WS_API.md`](https://github.com/zhac-project/zhac-platform/src/branch/main/docs/WS_API.md)
in the platform repo for the full command list.

## License

GNU AGPL v3 or later. See `LICENSE`.

## Contributing

See `CONTRIBUTING.md`. All contributions require signing `CLA.md`.

## Versioning

Releases tagged `vYYYYMMDDVV`. See `zhac-platform` README for the
scheme.
