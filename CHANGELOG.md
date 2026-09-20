# Changelog

All notable changes to **www-spa** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to the `vYYYYMMDDVV` versioning scheme used
across the ZHAC platform.

## [Unreleased]

### Added

- **Restore preview.** Before a restore the confirm dialog says when and where the backup was
  made, what it holds (names, rules with how many enabled, scripts, collections), which saved
  names have no paired device here and will be skipped, and what a backup never contains
  (the Zigbee network, passwords, MQTT and Wi-Fi credentials). Pure logic unit-tested.
- **Settings → Time shows the router's time server** when the hub uses one (`ntp_dhcp_server`).
- **"Add a device" reads the hub's `known` flag** to tell a matched device from one the hub has
  no definition for, instead of guessing from the model name.

- **Numeric command inputs accept decimals** (`step="any"`), so a 21.5 °C setpoint can be
  typed and sent; the hub now writes it as a decimal instead of truncating or refusing it.

- **Recipes: a first rule without typing.** New Rule opens on a Recipe tab: choose what should
  happen (motion light with auto-off, light follows motion, button toggles a light, light on
  when a door opens, switch off at a time, leak closes the valve), pick the devices from lists
  limited to those that can do it (read from what each device exposes), set the minutes or
  time, read the rule as one sentence, press *Test the action now* to see the light react, and
  save. Recipes reference devices by address, so a rename does not break them; the list shows
  names in their place and flags a rule whose device the hub no longer has. The motion recipe
  uses the engine's timers and picks a free one. Pure logic is unit-tested (`npm test`).

- **"Add a device" replaces the permit-join box** on the Devices page. One button opens
  pairing for two minutes and shows a panel with the reset instructions, a countdown, and
  every device that appears while it is open, each with what the hub knows so far and one next
  step: *reading what it is…*, *ready — open it to name it*, *no definition for what it reports
  (ask for it with these two values)*, or, after a minute without answers, *press its button
  or move it closer and Retry*. Two minutes with nothing joined gives the reset-until-it-blinks
  step. A hub whose radio is down says so in the panel instead of listening in vain. Permit
  join with a chosen number of seconds stays under *Advanced*.

- **OTA page offers published versions.** The browser reads the project's GitHub releases,
  keeps the `-ota.bin` files that fit this hub (chip, and the P4's silicon family from the
  `rev1x` / `rev3x` name token), marks the installed one, and installs a chosen version with
  one confirmation. A hub whose network cannot reach GitHub gets a plain explanation, and the
  URL field lives on under *Advanced* for images that are not releases. Pure matching
  functions are unit-tested (`npm test`).

- **Set-up card knows when the hub stops accepting a password.** While open it shows the
  minutes left; once the hub's ten-minute first-claim window has passed it shows what to do
  (power-cycle, wait, try again) instead of a form that fails with "Setup failed (403)".

- **OTA page: trial and rollback notes** (wired build). While a new firmware is on trial the
  page says what the hub is checking and how long it can take; after a rollback it shows the
  hub's reason (`ota_rollback_reason`) instead of leaving the owner to guess why the version
  did not change.

### Added

- **A Time card in Settings**: whether the clock is set, the time server the hub asks, and,
  while the clock is unset, a button that hands over this device's time.
- **An offline hub gets the time from the browser.** When a hub reports `clock_set: false`,
  the web UI sends it the browser's clock (`time.set`, at most once a minute), so its schedules
  can run without internet access. If the hub cannot take it, the Rules page explains that
  `Time#Cron` rules and Lua cron handlers wait, with a "Use this device's time" button. The
  demo hub starts with an unset clock under `DEMO_CLOCK_UNSET=1`.
- **The UI adapts to the board it runs on.** On the wired Ethernet build, Settings shows an
  Ethernet card instead of Wi-Fi, and hides the cloud-uplink selector and the access-point
  toggle; Info shows one card for the one chip; the OTA page offers a single update field,
  or says plainly when the build cannot update itself yet. The dual-chip layout is unchanged.
- **Backup and restore** (Settings → Backup): device names, rules, Lua scripts and collections
  to one JSON file and back. Restore merges by name and never deletes; devices not paired on
  the hub are listed as skipped. It runs over the ordinary API, so it works on every ZHAC
  firmware. The Zigbee network (keys, PAN id) is not included — devices re-pair on a new
  radio, then a restore brings their names and automations back.
- **Templates in the Rules and Scripts editors** — seven single-rule starting points (motion
  light, door lamp, button toggle, nightly off, leak valve, over-temperature alert) and four
  Lua scripts (motion light with timeout, heating schedule, debounced leak alarm, power
  watchdog), from the automation cookbook. Every rule template passes the firmware's DSL
  parser.
- **Home Assistant discovery switch** in Settings → MQTT, with the discovery prefix. Shown
  only when the firmware supports it.
- **Radio-down warning.** When the hub reports its Zigbee radio is not running, the Devices
  page says so before anyone waits on permit join, and — when the radio crashed at start on
  an ESP32-P4 board — points to flashing the C6 radio firmware.
- **Web UI version on the Info page**, so bug reports say which UI build they came from.
- **First-run help.** An empty Devices page now walks through pairing a first device
  instead of one line of text, and the Info page has a Help card linking the getting-started
  guide, docs, supported devices, device requests, bug reports and the latest release.
- **Demo hub for UI work without hardware** — `npm run demo` serves the built UI with six
  realistic devices on :8080, and `npm run dev` proxies to it. `DEMO_KIND=dual` imitates the
  dual-chip build.

### Fixed

- **The in-app rule help showed button triggers the parser rejects.** Text values must be
  quoted — `#action="single"`, not `#action=single` (an unquoted word is read as a number).
- **The rule help's limits were wrong.** They now match the parser: device name 29, attribute
  key 27, event name and MQTT topic 63, and timer indices 1–8 (it said 0–7).

### Changed

- **Docs match the code again**: README lists the real pages and development flow, adds
  screenshots, and fixes links; CONTRIBUTING no longer claims a Vitest suite (there is none)
  or 2-space/single-quote style; ONBOARDING describes the three firmwares that serve the UI.
- **Visual identity remapped onto the Soft Utility design system.** The palette,
  type scale, radii, elevation tiers and focus ring now derive from shared design
  tokens instead of literals scattered through the stylesheet: 25 tokens
  introduced, 9 `font-family` / 55 `font-size` / 24 `border-radius` / 5
  `box-shadow` declarations converted, plus 17 inline literals in the JSX.
  The Lua editor, badge and OTA palettes were retuned off the old accent.

  This is the local tier of the design system — **tokens only**. www-spa keeps
  Preact, its own markup and the platform font stack; the component and widget
  layers stay a premium feature of the cloud and mobile clients. No web fonts,
  no framework change, no new dependencies. CSS grows 2.0 kB raw / 0.36 kB
  gzipped; total bundle +2.2 kB against a 7 MB SPIFFS partition.

  Dark mode continues to be driven solely by the `data-theme` attribute, so the
  Settings theme chooser and its explicit "light" override are unaffected.

  The type scale moved from `px` to `rem`, so the UI now scales with the
  browser's font-size setting rather than staying pinned to the OS default —
  an intended behaviour change carried over from the token remap.

### Fixed

- **Focus indicators were suppressed in three places** — `textarea:focus`, the
  shared form-input rule, and `.code-editor-input`, the last removing its outline
  unconditionally rather than only on focus, so the Lua editor had no focus
  indicator in any state. All three now render a 2 px `--color-focus` ring at
  2 px offset via `:focus-visible`.
- **Base font was hardcoded to Arial** rather than a platform stack, so the app
  never rendered in the system UI font on any platform.
- **Dark mode collapsed the OTA progress bar's in-progress and complete colours**
  to a single value, removing the colour signal that a firmware flash had
  finished — on a control where rebooting mid-flash is destructive. Light mode
  had always kept them distinct.

### Added

- **Global Groups tab: by-gid native ZCL membership.** A new top-level "Groups"
  nav tab (after Collections) lists native ZCL group membership fleet-wide, one
  card per group id with member device chips, sourced from the new `groups.all`
  gateway-mirror op (read-only; gids ascending; members carry ieee only).
  Add/remove reuse the existing per-device `device.groups.add/remove` API
  (ep 1); a "+ New group" control creates a group by joining its first device.
  Distinct from the per-device Groups tab (live single-device query) and from
  Collections (gateway fan-out) — this is the fleet-wide view of real ZCL
  groups (e.g. MiBoxer zone remotes).

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
