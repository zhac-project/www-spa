# ONBOARDING — www-spa

You are an AI agent arriving on **www-spa**, ZHAC's Preact 10 + Vite 5
single-page app. This repo builds the Web UI that's bundled into the
S3 firmware's SPIFFS partition. Read top-to-bottom before coding.

---

## 1. Platform context

**ZHAC** = dual-chip ESP32 Zigbee Home Automation Controller.

- **ESP32-P4** runs Zigbee coordination (`zhac-main-core`).
- **ESP32-S3** runs WiFi / REST / WS / MQTT (`zhac-net-core`).
- They talk over SPI using the custom **HAP** binary protocol.
- This SPA speaks **WebSocket only** (`/ws`) to the S3 gateway. There
  is no REST client in the SPA — REST endpoints exist server-side
  (for external integrations) but the SPA doesn't use them.

### Repo split

Tag `v2026042301` (2026-04-23) baseline. 7 repos:
`zhac-platform`, `embedded-zhc`, `zhac-components`, `zhac-main-core`,
`zhac-net-core`, **`www-spa`** *(this)*, `zhac-docs`.

This repo is additionally **nested as a submodule inside
`zhac-net-core/`** so a standalone S3 checkout can still build the
SPIFFS image.

---

## 2. What this repo owns

- Preact 10 + `@preact/signals` SPA, ~2 490 LOC across 36 files.
- Single WebSocket connection (`/ws`). Envelope:
  `{id, cmd, args}` → `{id, ok, data|err}` + server-push events
  (no `id`).
- 9 pages, one file per page.
- CodeMirror 6 editor for Lua/DSL editing with zhac-aware
  autocompletion (generated from `docs/LUA_API.md` at build time).

### Layout

```
www-spa/
├── src/
│   ├── app.jsx                  (top-level router + WS lifecycle)
│   ├── main.jsx                 (entry)
│   ├── pages/                   (one file per page)
│   │   ├── Devices.jsx          (device list)
│   │   ├── DeviceDetail.jsx     (single device — States / Options / Settings tabs)
│   │   ├── Groups.jsx           (device groups)
│   │   ├── Rules.jsx            (rules DSL editor)
│   │   ├── Scripts.jsx          (Lua scripts editor)
│   │   ├── Logs.jsx             (log ring stream)
│   │   ├── Diag.jsx             (metrics, HAP stats)
│   │   ├── Info.jsx             (system info — polls bootstrapStatus every 5 s)
│   │   └── Settings.jsx         (WiFi, MQTT, system)
│   ├── components/              (shared UI primitives)
│   ├── editor/                  (CodeMirror theme, autocomplete, linter)
│   ├── stores/                  (@preact/signals state containers)
│   ├── ws/                      (WS client + id↔reply matching)
│   ├── utils.js
│   └── styles.css
├── public/
├── tools/
│   └── gen-zhac-completions.js  (parses docs/LUA_API.md → completions)
├── index.html
├── package.json
└── vite.config.js               (manualChunks, codemirror lazy-load)
```

### Dependencies (from `package.json`)

Runtime: `preact@^10.24`, `@preact/signals@^1.3`,
`codemirror@^6` + CM autocomplete/commands/language/legacy-modes/
lint/state/view.

Dev: `@preact/preset-vite@^2.9`, `vite@^5.4`.

Build: `npm run prebuild` auto-runs `gen:completions`, then
`vite build` → `dist/`.

---

## 3. Building

```bash
cd www-spa
npm install
npm run build             # → dist/ (prebuild regenerates completions)
npm run dev               # local dev server (proxies /ws to S3 if configured)
```

`dist/` is consumed by `zhac-net-core`'s SPIFFS partition generator
(`spiffs_create_partition_image` points at `../../../www-spa/dist`).
Rebuild the SPA **before** telling the user to reflash S3 after any
UI change.

---

## 4. WS envelope (the only wire contract)

### Request/response

```js
// Send
ws.send({ id: 42, cmd: "device.list", args: {} });

// Receive (success)
{ id: 42, ok: true, data: [ ... ] }

// Receive (error)
{ id: 42, ok: false, err: "permission denied" }
```

The `ws/` client matches replies by `id`. Don't reuse an `id` before
its reply comes back.

### Push events (no `id`)

- `device.added` / `device.updated` / `device.removed`
- `attr.bulk` — batched attribute updates
- `alert.*` — system alerts

Stores subscribe via `/ws` handler; components read via signals.

Full dispatch surface: 35 entries, documented in
`zhac-docs/WS_API.md`. Every entry maps to an `api_*` handler in
`zhac-net-core/main/api_handlers.cpp`.

---

## 5. Key patterns

### Optimistic UI (critical)

`AttrBoolRow` and `AttrEnumRow` use a local override so the toggle
visually flips **before** the server echo arrives:

```jsx
const [localV, setLocalV] = useState(null);
useEffect(() => { setLocalV(null); }, [v]);  // reset when server value changes
const shown = localV !== null ? localV : !!v;
```

Without this, Tuya LED drivers (which don't emit reports on
command-driven state changes) would leave the UI stale for several
seconds. P4 also writes an optimistic shadow entry server-side, so
**both ends cooperate**.

### Page ↔ signals ↔ WS

State lives in `stores/*.js` as `@preact/signals`. Pages import
signals and render; WS push handlers mutate signals. Don't thread
props through; signals handle reactivity.

### DeviceDetail composition

- **Manufacturer row** reads `d.manufacturer` (not `d.vendor`).
- **Converter row** composes `${d.vendor}/${d.model}` (server emits
  `vendor` + `model`, not `converter`).
- **Hard remove** checkbox lives next to the Remove button on
  DeviceDetail — **not** on the device list (`Devices.jsx` has no
  checkbox).
- Exposes with `category === "Config"` render on the Options tab;
  default (or missing) category renders on States.

### Bootstrap polling

`Info.jsx` uses `useEffect` + `setInterval(bootstrapStatus, 5000)`.
Don't add polling elsewhere — everything else is push-driven.

---

## 6. Completions pipeline

`tools/gen-zhac-completions.js` parses `docs/LUA_API.md` (the Lua API
reference) and emits a JSON completion bundle consumed by
CodeMirror's autocomplete in `src/editor/zhac-completions.js`.

Re-runs automatically via `prebuild`. If you edit the Lua API docs
and your editor completions seem stale, run `npm run gen:completions`.

Note: the current version of `gen-zhac-completions.js` expects a
copy of `docs/LUA_API.md` **inside** the SPA tree (or adjacent).
When cloned standalone from GitHub, this repo has no `docs/` sibling
— set up a symlink or adjust the parser to point at a sibling clone
of `zhac-docs`.

---

## 7. Conventions

- **No TypeScript** yet — JSX + JSDoc where helpful.
- **`@preact/signals` for state**. No Redux, no MobX, no React
  context gymnastics.
- **Lazy-load CodeMirror** (see `vite.config.js` `manualChunks`) — it
  would otherwise dominate the bundle.
- **WS-only**. Don't `fetch()` the S3 — if a REST endpoint is needed
  from the UI, add it as a WS command.
- **Send `args:{}` explicitly**, not `undefined`. The server parser
  expects the field.
- **Don't block the render tree on WS roundtrips.** Use optimistic
  state or show a spinner; never `await` inside render.
- **Tab routing via ExposeCategory.** States tab = `State`
  (default). Options tab = `Config`. Settings tab = device admin
  (rename, remove, bindings).

---

## 8. User preferences (persistent)

- **User builds firmware and flashes themselves.** Your SPA build
  outputs `dist/`; the user handles `idf.py build` and flashing.
- **Early-dev stance.** Breaking UI changes are fine. No i18n
  scaffolding, no feature flags, no A/B shims.
- **Prefer terse components.** The SPA is deliberately ~2 500 LOC.
  Each new page should be one file.

---

## 9. Gotchas

- **Browser cache.** S3 serves SPIFFS files with weak caching; after
  reflashing, users often need a hard reload. Bump the `version` in
  `package.json` if you want Vite to rebust chunk hashes, but the
  root `index.html` ETag is usually the fastest fix.
- **Polling drift.** If you add another `setInterval`, remove it in
  the cleanup — Preact's `useEffect` cleanup is the standard
  pattern, and orphaned intervals eat S3 CPU.
- **Signals outside React.** Don't create signals inside render —
  they must live at module scope in `stores/`.
- **WS reconnect storms.** The WS client backs off exponentially;
  don't reset on every render.
- **Hard-remove is gated by a separate flag.** The UI sets
  `hard: true` when the checkbox is ticked on DeviceDetail; the
  server clears NVS + shadow + adapter cache only on hard.
- **CodeMirror editor state is expensive to recreate.** Rebuild the
  editor only when the document ID changes, not on every re-render.

---

## 10. Licensing

- **AGPL-3.0-or-later** for this SPA.
- Every file starts with:
  ```
  // SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
  // SPDX-License-Identifier: AGPL-3.0-or-later
  ```
- `LICENSE` points to `LICENSES/AGPL-3.0-or-later.txt`.
- CLA via `CLA.md` — Apache ICLA v2.2 + §4 relicensing grant. Sign
  by adding yourself to `CONTRIBUTORS.md` in your first PR (covers
  all 7 ZHAC repos).

Third-party licences for npm deps are captured automatically in the
build artefact; don't hand-maintain.

---

## 11. Where to go next

- **WS API**: `zhac-docs/WS_API.md` (ground truth for every
  `cmd` the SPA can send).
- **REST API** (for external integrations): `zhac-docs/REST_API.md`.
- **Rules DSL**: `zhac-docs/RULES_DSL.md`.
- **Lua API**: `zhac-docs/LUA_API.md` (source of autocompletion).
- **S3 handlers**: `zhac-net-core/main/api_handlers.{h,cpp}` — every
  WS `cmd` lands in one of these functions.

---

*Tag on first split: `v2026042301` · 2026-04-23.*
*License: AGPL-3.0-or-later · Maintainer: Evgenij Cjura.*
