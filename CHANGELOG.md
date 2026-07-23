# Changelog

All notable changes to **www-spa** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to the `vYYYYMMDDVV` versioning scheme used
across the ZHAC platform.

## [Unreleased]

### Added

- **Device Groups tab: live membership list.** The Groups tab now loads and shows
  the device's tracked ZCL group membership as chips (each with a remove ×), via
  the dedicated `device.groups.list/add/remove` API (replacing the increment-1
  `device.attr.set` overload). Each add/remove returns the updated list. A
  "Refresh from device" button (`device.groups.refresh`, inc 2b) reads the
  device's actual ZCL group table and reconciles the displayed list to it.

### Changed

- **Sidebar "Groups" renamed to "Collections".** The synthetic gateway-fan-out
  feature (a named set of devices that one command is re-sent to) is now
  "Collections", freeing the precise term "Groups" for native ZCL group
  membership (the device Groups tab). UI label only — the `group.*` WS/REST API,
  routes, and `zhac_grp` NVS namespace are unchanged, so there is no migration
  and no API break.

### Added

- **Device page: dedicated Groups tab (native ZCL membership).** A new "Groups"
  tab on the device page adds / removes the device to a Zigbee group id (EP +
  group id → `setDeviceGroup`, sent over `device.attr.set` with cluster 0x0004,
  key group_add/group_remove). Lets a light obey a hardware zone-remote directly
  (MiBoxer FUT089Z zones = groups 101-108). The tab copy notes this is native ZCL
  membership on the device, distinct from the sidebar Collections page (gateway
  fan-out). Fire-and-forget with a toast; the membership list + "refresh from
  device" is a later increment.

- **Bind tab: Target picker.** The Add-binding form only collected source
  EP + cluster and sent no destination, which the firmware turned into a ZDO
  bind to IEEE `0x0` — a bind to nowhere. The form now has a Target select:
  "Coordinator (reporting)" (default — firmware substitutes its own IEEE +
  ep 1) or any other paired device + target EP for direct device→device
  bindings (remote → bulb without a rule). Requires the paired
  `zhac-main-core` coordinator-default fix for the coordinator option.

- **Groups: add-member control.** Each group card now has a device picker +
  Add button (devices not already members; `ep` defaults to 1, matching the
  command fan-out and the firmware member parser), with a client-side cap at
  the firmware's 16-member limit. Previously there was NO way to add a device
  to a group anywhere in the SPA — the create-modal hint pointed at the
  device Bind tab, which only manages ZDO cluster bindings; the hint text is
  corrected. Group mutations (create/delete/member add/remove) now re-pull
  `group.list` on success, so cards reflect changes without a manual Refresh
  (groups have no push-event wiring).

- **Password sign-in + first-boot setup card.** The login gate now asks for
  the admin password (exchanged for the API token via `POST /api/auth/login`;
  the token stays the wire credential in `localStorage.zhac_token`). A fresh
  device with no password (`auth_setup_required` on `/api/status`) gets a
  one-time "Set admin password" card instead of the serial-log token hunt.
  Settings gains an "Admin password" card (change password; rotates the API
  token, signing other browsers out). The raw-token paste remains as an
  "advanced" toggle on the login card and the existing Settings row.

- **Sign-in gate**: when the controller has API auth enabled (secure-by-default
  on fresh units) and this browser holds no valid token, the SPA now shows a
  full-screen login card instead of a blank shell. It probes the public
  `/api/status` for `auth_enabled`, validates any stored token against a gated
  endpoint (explicit 2xx, so a wrong URL or a network error fails closed), and
  starts the WebSocket only once past the gate. Pre-app "connecting…" and
  "can't reach the controller / retry" splashes replace the silent blank.
  Submitting a valid 32-char token stores it and reloads to re-handshake (same
  flow as Settings). To disable auth for development, log in with the serial
  token and turn Auth off under Settings — the device default stays secure. Dev:
  the Vite server now proxies `/api` (not just `/ws`) to `:8080` so the probe and
  REST work under `npm run dev`.
- **Device → Options tab**: per-device "Report throttle (ms)" field — a number
  input + Save that POSTs `device.options.set {ieee, throttle_ms}`. Caps the
  update flood from chatty Tuya-DP sensors (air-quality monitors). Presentation
  only — the throttle is enforced firmware-side (device_shadow). (#84)

### Fixed (Critical)

- **C-1** `onOpen` now returns an unsubscribe function symmetric with
  `on()`. Page-level effects that wire WS-open handlers can detach
  cleanly on unmount instead of growing the `openHandlers` array
  across navigation. (`src/ws/client.js`)
- **C-2** `createCrudStore` returns a `teardown()` that detaches its
  `added/updated/deleted` subscribers. Vite HMR re-execution or test
  re-imports no longer stack duplicate handlers that would double-
  apply each event. (`src/stores/crud.js`)
- **C-3** `PermitJoinStatus` polling is now a self-scheduling
  `setTimeout` chain instead of `setInterval`, so slow httpd round-
  trips can't stack concurrent inflight `zigbee.permit_join.status`
  calls. (`src/pages/Devices.jsx`)
- **C-4** Removed the 5-second `bootstrapStatus()` poll from
  `InfoPage`; the page now relies entirely on the existing
  `status.tick` push stream + the one-shot mount-time refresh. Halves
  Info-page httpd load and removes the race that made the 11/12 flip
  bug observable. (`src/pages/Info.jsx`)

### Fixed (High)

- **I-1** API bearer token in Settings is now masked by default with
  explicit "Show" and "Copy" controls (clipboard write + toast
  confirmation). Token no longer appears in DevTools / screenshots.
  (`src/pages/Settings.jsx`)
- **I-2** Removed the duplicate OTA card from Settings. The card now
  links to `OtaPage`, which is the single canonical trigger with URL
  validation, confirm dialog, and progress feedback.
  (`src/pages/Settings.jsx`)
- **I-3** `Modal` now traps keyboard focus inside `.modal-box`
  (Tab / Shift-Tab cycle), restores focus to the trigger element on
  close, and exposes `role="dialog"`, `aria-modal="true"`, and
  `aria-labelledby`. WCAG 2.1 + ARIA APG modal pattern compliant.
  (`src/components/Modal.jsx`)
- **I-4** Minimal hash routing. `navigate()` writes `location.hash`;
  a `hashchange` listener drives `ui.activePage`. URLs now reflect
  state (`#/devices`, `#/device/<ieee>`, …), back/forward works,
  bookmarks work, middle-click / cmd-click open in a new tab. No
  router library. (`src/stores/ui.js`, `src/app.jsx`,
  `src/pages/Devices.jsx`, `src/pages/DeviceDetail.jsx`)
- **I-9** Added a Preact `ErrorBoundary` wrapping `<main>`. A single
  thrown render error now surfaces as a recoverable error pane with
  a Retry button instead of white-screening the whole SPA.
  (`src/app.jsx`)

### Fixed (Medium / Low)

- **I-5** Documented the CSP requirement in `README.md` — meta CSP is
  intentionally NOT shipped because it cannot cover the WebSocket
  `connect-src`; CSP must be emitted as a response header by the S3
  httpd. Recommended header value included. Also added `description`
  and `theme-color` meta tags. (`index.html`, `README.md`)
- **I-6** `withToast` now returns a `SUCCESS` `Symbol` sentinel
  instead of overloading "value is not `undefined`". Callers in
  `Rules`, `Groups`, and `DeviceDetail` updated to branch on
  `=== SUCCESS`, so a server returning `null` / `false` /
  `{ok: false}` no longer trips a false-positive close.
  (`src/stores/ui.js`, `src/pages/Rules.jsx`,
  `src/pages/Groups.jsx`, `src/pages/DeviceDetail.jsx`)
- **I-7** `DeviceDetail` now cancels stale `getDevice(ieee)` inflight
  requests when `ieee` changes, and clears the previous detail
  synchronously so the old device's UI does not flash during the
  switch. (`src/pages/DeviceDetail.jsx`)
- **I-8** `LuaEditor` keymap and updateListener now read `onSave`,
  `onRun`, and `onInput` through refs so the CM6 instance always
  fires the current props, not the closure captured at mount.
  (`src/components/LuaEditor.jsx`)
- **I-10** `OptionsTab` now self-describes as a read-only reference
  view of `category: "config"` exposes and points users to the
  States tab for the write path, removing the impression of two
  inconsistent edit surfaces. (`src/pages/DeviceDetail.jsx`)
- **I-11** `writeScript` POST sends `Cache-Control: no-store` and
  `cache: "no-store"` as a belt-and-braces guard against a future
  service-worker caching the state-mutating endpoint.
  (`src/stores/scripts.js`)

### Changed (Open-source readiness)

- `gen-zhac-completions.js` now emits an empty completions module +
  warns when `LUA_API.md` is unavailable instead of failing the
  build. Fresh checkouts without a sibling `zhac-docs/` clone now
  build successfully (autocomplete will simply be empty).
  (`tools/gen-zhac-completions.js`)
- README expanded with hash-routing description, environment-
  variable table, CSP guidance, and a "deferred open-source
  readiness" section.

### Improved (Open-source readiness)

- **Dark theme.** The SPA now auto-switches between light and dark
  palettes based on the browser-reported `prefers-color-scheme`
  media query. No toggle UI is shipped — the OS / browser preference
  is the only driver. Every text / background pair was re-vetted for
  WCAG AA contrast (≥ 4.5:1 normal text, ≥ 3:1 large / UI text):
  main background, navigation, cards, modals, inputs, buttons,
  tables, badges, toasts, status pills, chips, toggle switches,
  spinner, log viewer, and CodeMirror Lua editor (chrome + syntax
  tokens). Every hard-coded colour previously baked into individual
  rules (`#fff`, `#f3f3f3`, `#6b7280`, `#eef1f5`, the Lua syntax
  hex literals, etc.) was promoted to a `:root` CSS variable so a
  single `@media (prefers-color-scheme: dark)` block re-tunes the
  whole UI. `<meta name="theme-color">` is now duplicated with
  `media="(prefers-color-scheme: ...)"` so the mobile address-bar
  tint also tracks the system preference. The CodeMirror theme
  dropped its hard-coded `{ dark: false }` flag and now flows
  through the same CSS variables. No layout or component logic
  changed; this is a pure colour-and-contrast sweep.
  (`src/styles.css`, `src/editor/lua-theme.js`, `index.html`)

### Deferred

- i18n. All strings are hardcoded English. Requires picking an i18n
  approach + extraction tooling before any string-touching work
  becomes meaningful.
