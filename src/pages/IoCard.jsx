// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings › I/O: the hub's user-configurable GPIO pins. GET /api/io returns the
// allowed pins and the saved table; PUT /api/io replaces the whole table. The
// firmware validates everything and its 400 {"error"} text is shown as-is.
import { useEffect, useState } from "preact/hooks";
import { showToast } from "../stores/ui.js";
import { Card } from "../components/Card.jsx";

const MODES = ["out", "pwm", "in", "adc", "strip"];

async function ioFetch(method, body) {
    let tok = "";
    try { tok = localStorage.getItem("zhac_token") || ""; } catch (_) {}
    const headers = { "X-Api-Key": tok, "Cache-Control": "no-store" };
    if (body) headers["Content-Type"] = "application/json";
    const r = await fetch("/api/io", { method, headers, cache: "no-store",
                                       body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        const e = new Error(data.error || ("HTTP " + r.status));
        e.status = r.status;
        throw e;
    }
    return data;
}

export function IoCard() {
    const [io, setIo]     = useState(null);   // GET body
    const [rows, setRows] = useState([]);
    const [gone, setGone] = useState(false);  // 404: older firmware
    const [loadErr, setLoadErr] = useState("");
    const [err, setErr]   = useState("");
    const [busy, setBusy] = useState(false);

    function adopt(data) { setIo(data); setRows((data.pins || []).map(p => ({ ...p }))); }
    useEffect(() => {
        ioFetch("GET").then(adopt).catch(e => {
            if (e.status === 404) setGone(true); else setLoadErr(e.message);
        });
    }, []);
    if (gone) return null;

    const upd = (i, patch) => setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
    const num = (i, k) => (e) => upd(i, { [k]: e.currentTarget.value === "" ? "" : Number(e.currentTarget.value) });

    function add() {
        const used = new Set(rows.map(r => r.gpio));
        const free = (io.allowed || []).find(g => !used.has(g));
        setRows([...rows, { gpio: free ?? "", mode: "out", name: "" }]);
    }

    async function save() {
        setBusy(true); setErr("");
        try {
            // value / err are runtime state, not config
            const pins = rows.map(({ value, err: _e, ...cfg }) => cfg);
            adopt(await ioFetch("PUT", { pins }));
            showToast("I/O saved", "ok");
        } catch (e) { setErr(e.message); }
        setBusy(false);
    }

    return (
        <Card title="I/O">
            {io == null ? (loadErr ? <p class="error-text">{loadErr}</p> : "…") : <>
                <p class="muted" style="margin-bottom:8px;font-size:var(--text-sm)">
                    Pins you configure here can be driven or read by rules and Lua scripts, and show up as
                    the "Hub I/O" device. Unconfigured pins are untouched. Saving replaces the whole table.
                </p>
                {rows.map((r, i) => {
                    const gpios = r.mode === "adc" ? (io.adc_pins || []) : (io.allowed || []);
                    return (
                        <div key={i} class="io-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px">
                            <label>GPIO
                                <select value={r.gpio} onChange={num(i, "gpio")}>
                                    {r.gpio === "" && <option value="">—</option>}
                                    {[...new Set([...gpios, r.gpio].filter(g => g !== ""))].map(g =>
                                        <option key={g} value={g}>{g}</option>)}
                                </select>
                            </label>
                            <label>Mode
                                <select value={r.mode} onChange={(e) => upd(i, { mode: e.currentTarget.value })}>
                                    {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </label>
                            <label>Name
                                <input type="text" value={r.name} maxLength={15} size={12}
                                       onInput={(e) => upd(i, { name: e.currentTarget.value })} />
                            </label>
                            <label><input type="checkbox" checked={!!r.invert}
                                          onChange={(e) => upd(i, { invert: e.currentTarget.checked })} /> invert</label>
                            {r.mode === "in" && (
                                <label>Pull
                                    <select value={r.pull || "none"} onChange={(e) => upd(i, { pull: e.currentTarget.value })}>
                                        <option value="none">none</option>
                                        <option value="up">up</option>
                                        <option value="down">down</option>
                                    </select>
                                </label>
                            )}
                            {(r.mode === "out" || r.mode === "pwm") && (
                                <label>Boot
                                    <select value={r.boot || "off"} onChange={(e) => upd(i, { boot: e.currentTarget.value })}>
                                        <option value="off">off</option>
                                        <option value="on">on</option>
                                        <option value="last">last</option>
                                    </select>
                                </label>
                            )}
                            {r.mode === "pwm" && (
                                <label>Freq (Hz)
                                    <input type="number" min="1" max="40000" style="width:90px"
                                           value={r.freq ?? 1000} onInput={num(i, "freq")} />
                                </label>
                            )}
                            {r.mode === "adc" && <>
                                <label>Interval (s)
                                    <input type="number" min="0" max="3600" style="width:80px"
                                           value={r.interval ?? 5} onInput={num(i, "interval")} />
                                </label>
                                <label>Delta ({io.adc_unit || "raw"})
                                    <input type="number" min="0" max="4095" style="width:80px"
                                           value={r.delta ?? 50} onInput={num(i, "delta")} />
                                </label>
                            </>}
                            {r.mode === "strip" && (
                                <label>LEDs
                                    <input type="number" min="1" max="1024" style="width:80px"
                                           value={r.leds ?? 30} onInput={num(i, "leds")} />
                                </label>
                            )}
                            <span class="muted" style="font-size:var(--text-sm)">
                                {r.value != null && <>value <code>{String(r.value)}</code> </>}
                                {r.err && <span class="error-text">{r.err}</span>}
                            </span>
                            <button class="danger small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
                        </div>
                    );
                })}
                {rows.length === 0 && <p class="empty-text">No pins configured.</p>}
                {err && <p class="error-text">{err}</p>}
                <div class="btn-strip" style="margin-top:8px">
                    <button class="small" onClick={add} disabled={rows.length >= (io.max || 16)}>Add pin</button>
                    <button class="primary small" onClick={save} disabled={busy}>Save</button>
                </div>
                <p class="field-hint">Up to {io.max} pins. ADC readings are in {io.adc_unit || "raw counts"}.
                    Mind 3.3 V logic and about 20 mA per pin; drive relays through a driver.</p>
            </>}
        </Card>
    );
}
