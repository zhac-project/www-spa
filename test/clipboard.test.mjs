// node --test -- copyText's secure-context and textarea-fallback branches,
// using fake window/navigator/document globals (there is no DOM in node).
// navigator needs defineProperty: recent Node ships its own read-only
// `navigator` global (getter, no setter) that plain assignment can't touch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyText } from "../src/utils/clipboard.js";

function setGlobal(name, value) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function clearGlobals() {
    delete globalThis.window;
    delete globalThis.navigator;
    delete globalThis.document;
}

function fakeTextarea() {
    return { value: "", style: {}, focus() {}, select() {} };
}

test("secure context: writes via navigator.clipboard.writeText", async (t) => {
    t.after(clearGlobals);
    let written = null;
    setGlobal("window", { isSecureContext: true });
    setGlobal("navigator", { clipboard: { writeText: async (s) => { written = s; } } });
    setGlobal("document", { createElement() { throw new Error("must not fall back"); } });

    const ok = await copyText("hello");
    assert.equal(ok, true);
    assert.equal(written, "hello");
});

test("insecure context (plain http): falls back to textarea + execCommand", async (t) => {
    t.after(clearGlobals);
    const body = { appended: [], appendChild(el) { this.appended.push(el); }, removeChild(el) { this.appended.pop(); } };
    let copiedValue = null;
    setGlobal("window", { isSecureContext: false });
    setGlobal("navigator", {}); // no .clipboard, like a plain-HTTP origin
    setGlobal("document", {
        createElement(tag) { assert.equal(tag, "textarea"); return fakeTextarea(); },
        body,
        execCommand(cmd) { assert.equal(cmd, "copy"); copiedValue = "copy-ran"; return true; },
    });

    const ok = await copyText("world");
    assert.equal(ok, true);
    assert.equal(copiedValue, "copy-ran");
    assert.deepEqual(body.appended, [], "textarea removed again after copy");
});

test("navigator.clipboard.writeText rejecting also falls back", async (t) => {
    t.after(clearGlobals);
    setGlobal("window", { isSecureContext: true });
    setGlobal("navigator", { clipboard: { writeText: async () => { throw new Error("denied"); } } });
    setGlobal("document", {
        createElement() { return fakeTextarea(); },
        body: { appendChild() {}, removeChild() {} },
        execCommand() { return true; },
    });

    assert.equal(await copyText("x"), true);
});

test("never throws: resolves false when nothing is available", async (t) => {
    t.after(clearGlobals);
    clearGlobals(); // plain node: no window/navigator/document at all
    assert.equal(await copyText("x"), false);

    setGlobal("window", { isSecureContext: false });
    setGlobal("navigator", {});
    setGlobal("document", { createElement() { throw new Error("boom"); } });
    assert.equal(await copyText("x"), false);
});
