// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// node --test -- the Safety page in a real browser: headless Chrome over the DevTools protocol, the page from a Vite
// dev server, the hub from tools/demo-server.mjs. Keys and mouse clicks are real input events, because focus is what
// these tests are about. Skipped when there is no Chrome (CHROME_BIN names one).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHROME = process.env.CHROME_BIN ||
    ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].find((n) => spawnSync("which", [n]).status === 0);
const skip = CHROME ? false : "no Chrome (google-chrome, chromium) on PATH: set CHROME_BIN to run the browser tests";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");   // text as a RegExp source
const freePort = () => new Promise((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});
const lines = (child, stream, match) => new Promise((resolve, reject) => {   // the first line of `stream` that `match` finds
    let buf = "";
    child[stream].on("data", (d) => {
        buf += d;
        const m = buf.match(match);
        if (m) resolve(m);
    });
    child.on("exit", (code) => reject(new Error(`exited with ${code} before: ${buf.slice(-300)}`)));
});

// Runs in the page before its own scripts: holds back what a test asks for, so a reply or a save can be
// "out" for as long as the test wants. Real WebSocket traffic otherwise.
const HOOK = `(() => {
    const hook = window.__hook = { holdSave: false, heldSave: [], refuse: "", holdGet: false, getIds: new Set(), heldGet: [] };
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
        hook.ws = this;
        try {
            const m = JSON.parse(data);
            if (m.cmd === "alarm.get") hook.getIds.add(m.id);
            if (m.cmd === "alarm.config.set" && hook.holdSave) { hook.heldSave.push([this, data]); return; }
            if (m.cmd === "alarm.config.set" && hook.refuse) {   // the hub's refusal, as a reply
                setTimeout(() => hook.deliver({ id: m.id, ok: false, err: hook.refuse }));
                return;
            }
        } catch (_) {}
        return send.call(this, data);
    };
    const add = WebSocket.prototype.addEventListener;
    WebSocket.prototype.addEventListener = function (type, fn, opts) {
        if (type !== "message") return add.call(this, type, fn, opts);
        (this.__fns ||= []).push(fn);
        return add.call(this, type, (ev) => {
            try {
                const m = JSON.parse(ev.data);
                if (hook.holdGet && m.id != null && hook.getIds.delete(m.id)) { hook.heldGet.push(() => fn.call(this, ev)); return; }
            } catch (_) {}
            fn.call(this, ev);
        }, opts);
    };
    hook.deliver = (frame) => {   // a frame from the hub, to the page's own listeners
        const ev = new MessageEvent("message", { data: JSON.stringify(frame) });
        (hook.ws.__fns || []).forEach((fn) => fn.call(hook.ws, ev));
    };
    hook.push = (event, data) => hook.deliver({ event, data });
    hook.releaseSave = () => { for (const [ws, d] of hook.heldSave.splice(0)) send.call(ws, d); };
    hook.releaseGet = (n = 1e9) => { for (const f of hook.heldGet.splice(0, n)) f(); };
})();`;

let demo, vite, chrome, profileDir, cdp, session, base, seq = 0, loads = 0;
const waits = new Map();
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    waits.set(id, [resolve, reject]);
    cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

before(async () => {
    if (skip) return;
    const demoPort = await freePort();
    demo = spawn(process.execPath, ["tools/demo-server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(demoPort), DEMO_DOOR_OPEN: "1" } });   // the front door is open: Away and Home arm only when forced
    await lines(demo, "stdout", /demo hub/);
    vite = await createServer({
        root: ROOT, logLevel: "silent", clearScreen: false,
        server: { host: "127.0.0.1", port: 0, strictPort: false, proxy: {
            "/ws": { target: `ws://127.0.0.1:${demoPort}`, ws: true }, "/api": { target: `http://127.0.0.1:${demoPort}` } } },
    });
    await vite.listen();
    base = `http://127.0.0.1:${vite.httpServer.address().port}`;

    profileDir = mkdtempSync(join(tmpdir(), "zhac-chrome-"));
    chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
                            `--user-data-dir=${profileDir}`, "--window-size=1280,900", "about:blank"]);
    const [, wsUrl] = await lines(chrome, "stderr", /DevTools listening on (ws:\/\/\S+)/);
    cdp = new WebSocket(wsUrl);
    cdp.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        const w = m.id && waits.get(m.id);
        if (!w) return;
        waits.delete(m.id);
        if (m.error) w[1](new Error(m.error.message)); else w[0](m.result);
    });
    await new Promise((r) => cdp.addEventListener("open", r, { once: true }));
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    ({ sessionId: session } = await send("Target.attachToTarget", { targetId, flatten: true }));
    await send("Page.enable", {}, session);
    await send("Page.addScriptToEvaluateOnNewDocument", { source: HOOK }, session);
});

after(async () => {
    try { cdp?.close(); } catch { /* gone already */ }
    const gone = (child) => child && child.exitCode === null && new Promise((r) => { child.once("exit", r); child.kill(); });
    await Promise.all([gone(chrome), gone(demo), vite?.close()]);   // Chrome writes to its profile until it is gone
    if (profileDir) rmSync(profileDir, { recursive: true, force: true });
});

// ── what a test does in the page ───────────────────────────────────────────
async function ev(expression) {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
}
async function until(expression, what, ms = 8000) {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(40)) if (await ev(expression)) return;
    throw new Error(`timed out waiting for ${what}`);
}
const Q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const active = () => ev(`(() => { const a = document.activeElement; return a === document.body ? "<body>" : (a.getAttribute("aria-label") || a.value || a.textContent.trim().slice(0, 30)); })()`);
const text = (sel) => ev(`${Q(sel)}?.textContent.trim() ?? null`);
// The centre of an element, or a point `dx`, `dy` inside its corner.
const pointOf = (el, dx, dy) => ev(`(() => { const e = ${el}; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect();
    return ${dx === undefined ? "[r.left + r.width / 2, r.top + r.height / 2]" : `[r.left + ${dx}, r.top + ${dy}]`}; })()`);
const point = (sel, dx, dy) => pointOf(Q(sel), dx, dy);
async function clickAt([x, y]) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, session);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }, session);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }, session);
}
const click = async (sel) => clickAt(await point(sel));
const clickEl = async (el) => clickAt(await pointOf(el));
const KEYS = { Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9 };
async function key(k) {
    const p = { key: k, code: k, windowsVirtualKeyCode: KEYS[k] };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...p }, session);
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...p }, session);
}
const type = (sel, value) => ev(`(() => { const e = ${Q(sel)}; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event("input", { bubbles: true })); })()`);

// A button on a profile's card, found by what it says; its label is the subject of its own test.
const cardBtn = (name, label) => `[...(([...document.querySelectorAll(".safety-card")].find((c) => c.querySelector(".safety-name").textContent === ${JSON.stringify(name)}))
    ?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
const cardLabels = () => ev(`[...document.querySelectorAll(".safety-card button[aria-label]")].map((b) => b.getAttribute("aria-label"))`);
const SAVE = ".safety-editor .btn-strip .primary";
const CANCEL = ".safety-editor .btn-strip button:not(.primary):not(.danger)";
const NAME = ".safety-editor input[type=text]";   // the first: the name
// The editor's own fields, pickers and Remove buttons, not its Save and Cancel; how many of them can be used now.
const FIELDS = ".safety-editor input, .safety-editor select, .safety-editor .alarm-row button";
const usable = () => ev(`[...document.querySelectorAll(${JSON.stringify(FIELDS)})].filter((e) => !e.matches(":disabled")).length`);
async function open() {
    await send("Page.navigate", { url: `${base}/?load=${++loads}#/safety` }, session);   // a new document each time: the hook starts clean
    await until(`${Q(".safety-add")} && !${Q(".safety-add")}.disabled && ${cardBtn("Flood", "Edit")}`, "the Safety page");
}
const openMenu = async () => { await click(".safety-add"); await until(`${Q(".safety-menu")}`, "the menu"); };
const menuItems = () => ev(`[...document.querySelectorAll("[role=menuitem]")].map((e) => e.textContent.trim())`);

// ── M24: the editor gives focus back ───────────────────────────────────────
test("closing the editor returns focus to the Edit button that opened it", { skip, timeout: 40000 }, async () => {
    await open();
    await clickEl(cardBtn("Flood", "Edit"));
    await until(`${Q(".safety-editor")}`, "the editor");
    assert.equal(await active(), "Flood", "the editor takes focus on its first field (the name)");
    await click(CANCEL);
    await until(`!${Q(".safety-editor")}`, "the editor to close");
    assert.equal(await active(), "Edit: Flood");
});

test("closing the editor of a new profile returns focus to + Add profile", { skip, timeout: 40000 }, async () => {
    await open();
    await openMenu();
    await click("[role=menuitem]");   // the first template
    await until(`${Q(".safety-editor")}`, "the editor");
    await click(CANCEL);
    await until(`!${Q(".safety-editor")}`, "the editor to close");
    assert.match(await active(), /Add profile/);
});

// ── M25: a click on the menu's padding or separator leaves the keys working ─
test("after a click on the menu's padding, Escape closes the menu and gives focus to its button", { skip, timeout: 40000 }, async () => {
    await open();
    await openMenu();
    const spot = await point(".safety-menu", 125, 3);   // inside the 4 px padding above the first item
    assert.equal(await ev(`document.elementFromPoint(${spot[0]}, ${spot[1]}).className`), "safety-menu", "the spot is the menu's own padding");
    await clickAt(spot);
    await key("Escape");
    await until(`!${Q(".safety-menu")}`, "the menu to close");
    assert.match(await active(), /Add profile/);
});

test("after a click on the separator, the arrow keys still move between the items", { skip, timeout: 40000 }, async () => {
    await open();
    await openMenu();
    const first = (await menuItems())[0];
    const spot = await point(".safety-menu-sep");
    assert.equal(await ev(`document.elementFromPoint(${spot[0]}, ${spot[1]}).className`), "safety-menu-sep", "the spot is the separator");
    await clickAt(spot);
    assert.match(await active(), new RegExp(`^${esc(first)}`), "focus stays where it was");
    await key("ArrowDown");
    assert.doesNotMatch(await active(), new RegExp(`^${esc(first)}`), "ArrowDown moved on");
    assert.notEqual(await active(), "<body>");
    await key("Escape");
    await until(`!${Q(".safety-menu")}`, "the menu to close");
});

// ── M38, M39: a save is out, a save is refused ─────────────────────────────
test("while a save is out the editor's fields are off; success closes the editor", { skip, timeout: 40000 }, async () => {
    await open();
    await clickEl(cardBtn("Flood", "Edit"));
    await until(`${Q(".safety-editor")}`, "the editor");
    assert.ok(await usable() > 3, "fields to use before the save");
    await ev(`window.__hook.holdSave = true`);
    await click(SAVE);
    await until(`window.__hook.heldSave.length === 1`, "the save to go out");
    assert.equal(await usable(), 0, "every field, picker and Remove button is off while the save is out");
    await ev(`window.__hook.releaseSave()`);
    await until(`!${Q(".safety-editor")}`, "the editor to close");
});

test("a refused save enables the fields again", { skip, timeout: 40000 }, async () => {
    await open();
    await openMenu();
    await click("[role=menuitem]");   // a new profile; its id is typed over with one that is taken
    await until(`${Q(".safety-editor")}`, "the editor");
    await type(".safety-editor input.mono", "flood");
    const before = await usable();
    assert.ok(before > 3);
    await ev(`window.__hook.holdSave = true`);
    await click(SAVE);
    await until(`window.__hook.heldSave.length === 1`, "the save to go out");
    assert.equal(await usable(), 0);
    await ev(`window.__hook.holdSave = false; window.__hook.releaseSave()`);
    await until(`${Q(".safety-editor .error-text")}`, "the refusal");
    assert.match(await text(".safety-editor .error-text"), /id flood is taken/, "shown as the hub words it");
    assert.equal(await usable(), before, "the fields are on again, the editor is still there");
    assert.equal(await active(), "Save", "focus is back on Save, which is enabled again");
    await click(CANCEL);
});

test("the editor's refusal clears as soon as the user edits again", { skip, timeout: 40000 }, async () => {
    await open();
    await openMenu();
    await click("[role=menuitem]");
    await until(`${Q(".safety-editor")}`, "the editor");
    await type(".safety-editor input.mono", "flood");
    await click(SAVE);
    await until(`${Q(".safety-editor .error-text")}`, "the refusal");
    await type(NAME, "Garage");
    await until(`!${Q(".safety-editor .error-text")}`, "the refusal to clear");
    await click(SAVE);   // refused again, then cleared by a pick, not a key
    await until(`${Q(".safety-editor .error-text")}`, "the refusal again");
    await ev(`(() => { const s = ${Q(".safety-editor select")}; s.value = "gas"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await until(`!${Q(".safety-editor .error-text")}`, "the refusal to clear on a pick");
    await click(CANCEL);
});

test("the keypads card's refusal clears as soon as the user edits again", { skip, timeout: 40000 }, async () => {
    await open();
    const card = `[...document.querySelectorAll(".card")].find((c) => c.textContent.includes("Keypads and codes"))`;
    await clickEl(`${card}.querySelector(".btn-strip button")`);   // Replace the codes…
    await until(`${card}.querySelector("input.alarm-code")`, "a code field");
    await ev(`window.__hook.refuse = "codes: nope"`);
    await clickEl(`${card}.querySelector(".btn-strip .primary")`);
    await until(`${card}.querySelector(".error-text")`, "the refusal");
    assert.equal(await ev(`${card}.querySelector(".error-text").textContent`), "codes: nope");
    await ev(`(() => { const i = ${card}.querySelector("input.alarm-code"); i.value = "1234"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await until(`!${card}.querySelector(".error-text")`, "the refusal to clear");
});

// ── a Delete takes its opener away: focus goes to + Add profile ────────────
test("after a Delete, focus goes to + Add profile", { skip, timeout: 40000 }, async () => {
    await open();
    await ev(`window.confirm = () => true`);   // the page asks before it deletes
    await openMenu();
    await click("[role=menuitem]");   // a new profile from the first template, saved and then deleted
    await until(`${Q(".safety-editor")}`, "the editor");
    const name = await ev(`${Q(NAME)}.value`);
    await click(SAVE);
    await until(`!${Q(".safety-editor")} && ${cardBtn(name, "Edit")}`, "the new profile's card");
    await clickEl(cardBtn(name, "Edit"));
    await until(`${Q(".safety-editor")}`, "the editor");
    await click(".safety-editor .btn-strip .danger");   // Delete profile
    await until(`!${Q(".safety-editor")} && !${cardBtn(name, "Edit")}`, "the editor to close and its card to go");
    assert.match(await active(), /Add profile/);
});

// ── M37: a button's label holds its visible text, then the profile's name ──
test("every profile button's label holds its visible text as one phrase, then the profile's name", { skip, timeout: 40000 }, async () => {
    await open();
    await clickEl(cardBtn("Away", "Arm"));   // the open front door: the hub refuses, the card offers Arm anyway
    await until(`${cardBtn("Away", "Arm anyway")}`, "Arm anyway");
    await ev(`window.__hook.push("alarm.changed", ${JSON.stringify({ state: "disarmed", profiles: [
        ...["away", "home", "night", "flood", "fire"].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1),
            class: id === "flood" ? "water" : id === "fire" ? "fire" : "intrusion", state: id === "flood" ? "triggered" : id === "fire" ? "armed" : "disarmed",
            since: 0, bypassed: [], ...(id === "flood" ? { left: 20 } : {}) }))] })})`);   // Flood sounds: Silence and Disarm
    await until(`${cardBtn("Flood", "Silence")}`, "Silence");
    const labels = await cardLabels();
    for (const label of ["Arm: Away", "Arm anyway: Away", "Silence: Flood", "Disarm: Flood", "Edit: Flood", "Disarm: Fire"])
        assert.ok(labels.includes(label), `${label} is among ${JSON.stringify(labels)}`);
    // Every label: the button's own text, a colon, the profile's name.
    const odd = await ev(`[...document.querySelectorAll(".safety-card")].flatMap((c) => [...c.querySelectorAll("button[aria-label]")]
        .filter((b) => b.getAttribute("aria-label") !== b.textContent.trim() + ": " + c.querySelector(".safety-name").textContent)
        .map((b) => b.getAttribute("aria-label")))`);
    assert.deepEqual(odd, []);
});

// ── the menu closes on Tab ─────────────────────────────────────────────────
test("Tab closes the menu and leaves focus where it goes, not back on the button", { skip, timeout: 40000 }, async () => {
    await open();
    await openMenu();
    await key("Tab");
    await until(`!${Q(".safety-menu")}`, "the menu to close");
    const now = await active();
    assert.notEqual(now, "<body>", "focus went on to the next control");
    assert.doesNotMatch(now, /Add profile/, "Escape gives focus back to the button; Tab does not");
});

// ── S3 (M27): a late alarm.get reply does not roll back a newer push ───────
test("a get reply that crosses a push does not roll the profile's state back", { skip, timeout: 40000 }, async () => {
    await open();
    const badge = (name) => `[...document.querySelectorAll(".safety-card")].find((c) => c.querySelector(".safety-name").textContent === ${JSON.stringify(name)})?.querySelector(".alarm-state")?.textContent`;
    assert.equal(await ev(badge("Fire")), "Disarmed");
    await ev(`window.__hook.holdGet = true`);
    await clickEl(cardBtn("Fire", "Arm"));   // its push (Armed) comes, then its reply, then a get that is held
    await until(`${badge("Fire")} === "Armed" && window.__hook.heldGet.length === 1`, "Fire to be armed and the get to be held");
    await clickEl(cardBtn("Fire", "Disarm"));   // a second push (Disarmed), a second get, held too
    await until(`${badge("Fire")} === "Disarmed" && window.__hook.heldGet.length === 2`, "Fire to be disarmed and the second get to be held");
    await ev(`window.__hook.releaseGet(1)`);   // the first get's reply: the state as it was before the disarm
    await sleep(300);
    assert.equal(await ev(badge("Fire")), "Disarmed", "the older reply does not bring Armed back");
    await ev(`window.__hook.releaseGet()`);
    await sleep(300);
    assert.equal(await ev(badge("Fire")), "Disarmed");
});
