import { test } from "node:test";
import assert from "node:assert/strict";
import { lqiBand, displayName, mergeLinks, buildTree, layout, scanAge, scanErrorText } from "../src/netmap.js";

const C = "0x00124B0000000001", RA = "0xA1", RB = "0xB2", E1 = "0x11", E2 = "0x22", X = "0x99";
const map = {
    ts: 1760300000, duration_ms: 8400, truncated: false,
    nodes: [
        { ieee: C,  nwk: 0,   type: "coordinator", name: "Hub",          model: "",       known: true,  failed: false },
        { ieee: RA, nwk: 10,  type: "router",      name: "Kitchen plug", model: "TS011F", known: true,  failed: false },
        { ieee: RB, nwk: 11,  type: "router",      name: "",             model: "TS0001", known: true,  failed: true  },
        { ieee: E1, nwk: 12,  type: "end_device",  name: "Door",         model: "",       known: true,  failed: false },
        { ieee: E2, nwk: 13,  type: "end_device",  name: "",             model: "",       known: false, failed: false },
        { ieee: X,  nwk: 14,  type: "end_device",  name: "Orphan",       model: "",       known: true,  failed: false },
    ],
    links: [
        { src: C,  dst: RA, lqi: 212, rel: "child",   depth: 1 },
        { src: RA, dst: C,  lqi: 198, rel: "parent",  depth: 0 },
        { src: C,  dst: RB, lqi: 70,  rel: "sibling", depth: 1 },
        { src: RA, dst: E1, lqi: 168, rel: "child",   depth: 2 },
        { src: RA, dst: E2, lqi: 61,  rel: "child",   depth: 2 },
        { src: RB, dst: X,  lqi: 120, rel: "none",    depth: 2 },
    ],
    not_seen: [],
};

test("LQI bands at their edges", () => {
    assert.equal(lqiBand(255), "good");
    assert.equal(lqiBand(150), "good");
    assert.equal(lqiBand(149), "fair");
    assert.equal(lqiBand(80), "fair");
    assert.equal(lqiBand(79), "poor");
    assert.equal(lqiBand(0), "poor");
    assert.equal(lqiBand(null), "none");
});

test("display name falls back to model, then the IEEE tail", () => {
    assert.equal(displayName(map.nodes[1]), "Kitchen plug");
    assert.equal(displayName(map.nodes[2]), "TS0001");
    assert.equal(displayName({ ieee: "0x00124B002A1CA3F1", name: "", model: "" }), "…2A1CA3F1");
});

test("links merge per pair, oriented from the end nearer the coordinator", () => {
    const edges = mergeLinks(map);
    assert.equal(edges.length, 5);
    const ca = edges.find((e) => e.b === RA);
    assert.deepEqual([ca.a, ca.ab, ca.ba, ca.tree, ca.label, ca.band], [C, 212, 198, true, "212 / 198", "good"]);
    const cb = edges.find((e) => e.b === RB);
    assert.deepEqual([cb.a, cb.tree, cb.label, cb.band], [C, false, "70", "poor"]);
    const rx = edges.find((e) => e.b === X);
    assert.equal(rx.a, RB);   // router before end device when no parent/child record says
});

test("tree: parent/child records first, best link as the fallback", () => {
    const root = buildTree(map);
    assert.equal(root.ieee, C);
    assert.deepEqual(root.children.map((c) => c.ieee), [RA, RB]);   // RB placed by its best link to the root
    const ra = root.children[0];
    assert.equal(ra.lqi, 212);
    assert.deepEqual(ra.children.map((c) => c.ieee), [E1, E2]);
    const rb = root.children[1];
    assert.equal(rb.failed, true);
    assert.deepEqual(rb.children.map((c) => c.ieee), [X]);
});

test("tree and layout for a coordinator alone", () => {
    const solo = { ts: 0, duration_ms: 3, truncated: false, nodes: [map.nodes[0]], links: [], not_seen: [] };
    const root = buildTree(solo);
    assert.equal(root.children.length, 0);
    const pos = layout(solo.nodes, mergeLinks(solo), { width: 880, height: 580 });
    assert.ok(Number.isFinite(pos[C].x) && Number.isFinite(pos[C].y));
});

test("layout settles inside the box with finite positions", () => {
    const pos = layout(map.nodes, mergeLinks(map), { width: 880, height: 580 });
    for (const n of map.nodes) {
        const p = pos[n.ieee];
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), n.ieee);
        assert.ok(p.x >= 0 && p.x <= 880 && p.y >= 0 && p.y <= 580, n.ieee);
    }
    assert.deepEqual(layout(map.nodes, mergeLinks(map)), pos);   // deterministic
});

test("scan age: hub time when its clock is set, else since the page got the map", () => {
    assert.deepEqual(scanAge(1000, 0, 1060 * 1000), { sec: 60, clockSet: true });
    assert.deepEqual(scanAge(0, 5000, 65000), { sec: 60, clockSet: false });
});

test("scan errors read as sentences", () => {
    assert.equal(scanErrorText("busy"), "A scan is already running");
    assert.equal(scanErrorText("not_ready"), "The Zigbee network is not up yet");
    assert.equal(scanErrorText("oom"), "The hub ran out of memory for the map");
    assert.equal(scanErrorText("something"), "Scan failed: something");
});

test("lqi null: no number at all reads as a dash, one number stands alone", () => {
    const m = {
        nodes: [{ ieee: "0x1", type: "coordinator" }, { ieee: "0x2", type: "router" }, { ieee: "0x3", type: "router" }],
        links: [
            { src: "0x1", dst: "0x2", lqi: null, rel: "none" },
            { src: "0x1", dst: "0x3", lqi: null, rel: "none" },
            { src: "0x3", dst: "0x1", lqi: 200, rel: "none" },
        ],
    };
    const edges = mergeLinks(m);
    const none = edges.find((e) => e.b === "0x2");
    assert.deepEqual([none.label, none.band], ["—", "none"]);
    const one = edges.find((e) => e.b === "0x3");
    assert.deepEqual([one.label, one.band], ["200", "good"]);
});
