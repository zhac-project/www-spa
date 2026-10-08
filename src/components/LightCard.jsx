// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// The States tab's light card: power, brightness in %, Colour/White, the system
// colour picker and presets, colour temperature in kelvin, and the raw values.
// Ranges show their figure on input and send once on change (release); a held arrow
// key fires a change per repeat, so key-driven commits wait for 250 ms of quiet.
// Picks made while a switch-on is in flight wait for it (powerGate).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { setDeviceAttr } from "../stores/devices.js";
import { showToast } from "../stores/ui.js";
import {
    PRESETS, pickable, isOn, modeOf, rawKeys, pctFromRaw, rawFromPct, kelvinRange, kelvinFromMired,
    miredFromKelvin, kelvinLabel, whiteName, colourName, writesFor, heldHex, powerGate, kelvinCss, inkFor,
} from "../light.js";

const fail = (err) => showToast("Set failed: " + err.message, "err");
// pctFromRaw() turns a missing report into 1 %: only call it for a value that arrived.
const arrived = (v) => v != null && Number.isFinite(Number(v));

export function LightCard({ ieee, channel, attrs }) {
    const k = channel.keys;
    const reportedMode = attrs[k.colorMode];
    const reportedHex = k.colorHex ? attrs[k.colorHex] : undefined;
    const reportedState = k.state ? attrs[k.state] : undefined;
    const reportedBri = k.brightness ? attrs[k.brightness] : undefined;
    const reportedCt = k.colorTemp ? attrs[k.colorTemp] : undefined;

    const [mode, setMode] = useState(modeOf(reportedMode));
    useEffect(() => setMode(modeOf(reportedMode)), [reportedMode, ieee]);
    const [pending, setPending] = useState(null);           // {hex, from} until the hub reports
    useEffect(() => {
        if (!pending) return undefined;
        const t = setTimeout(() => setPending(null), 6000);
        return () => clearTimeout(t);
    }, [pending]);
    const [power, setPower] = useState(null);
    useEffect(() => setPower(null), [reportedState]);
    const [bri, setBri] = useState(null);                    // % while dragging / until reported
    useEffect(() => setBri(null), [reportedBri]);
    const [kel, setKel] = useState(null);                    // K while dragging / until reported
    useEffect(() => setKel(null), [reportedCt]);
    const keyed = useRef(false);                             // the card was last driven by a key (keydown sets, pointerdown clears)
    const due = useRef({});                                  // rail id -> {t, run}: the key-driven commit still waiting
    const fire = (id) => { const d = due.current[id]; delete due.current[id]; if (d) { clearTimeout(d.t); d.run(); } };
    useEffect(() => () => Object.keys(due.current).forEach(fire), []);   // leaving the page still sends what is waiting
    function settle(id, run) {                               // pointer release: now; key press or repeat: 250 ms after the last one
        const d = due.current[id];
        if (d) { clearTimeout(d.t); delete due.current[id]; }          // a newer value replaces the waiting one
        if (keyed.current) due.current[id] = { t: setTimeout(() => fire(id), 250), run };
        else run();
    }

    const on = power ?? (k.state ? isOn(reportedState) : true);
    const pct = bri ?? pctFromRaw(reportedBri, channel.bri.max);
    const haveBri = bri != null || arrived(reportedBri);      // else the figure is "—", not 1 %
    const briText = haveBri ? `${pct} %` : "—";
    const hex = heldHex(pending, reportedHex);
    // The kelvin rail steps 100 K, the label's unit (no label jump after a report, no repeated mired). Its ends round out to
    // whole hundreds so the grid reaches both ends of the light's range; miredFromKelvin clamps the overshoot to it.
    const kr = kelvinRange(channel.ct);
    const reportedK = kelvinFromMired(reportedCt);
    const kelvin = kel ?? (reportedK ?? kr.min);
    const haveK = kel != null || reportedK != null;           // else "—"; the slider still rests at kr.min
    const both = !!k.colorHex && !!k.colorTemp;
    const showColour = !!k.colorHex && (!both || mode === "colour");
    const showWhite = !!k.colorTemp && (!both || mode === "white");
    const tint = showWhite ? (haveK ? whiteName(kelvin) : "") : hex ? colourName(hex) : "";
    const status = on ? ["On", k.brightness ? briText : null, tint || null].filter(Boolean).join(" · ") : "Off";

    const gate = useMemo(powerGate, [ieee]);                 // this light's switch-on in flight
    async function send(key, value) {
        try {
            await gate(writesFor(channel, attrs, key, value), k.state, (wk, wv) => {
                if (wk === k.state) setPower(wv);
                return setDeviceAttr(ieee, wk, wv);
            });
            return true;
        } catch (err) { setPower(null); fail(err); return false; }
    }
    function togglePower(e) {
        const next = e.currentTarget.checked;
        setPower(next);
        send(k.state, next);
    }
    // False when refused: black is no colour, so nothing is sent (power included).
    function pickHex(value) {
        const h = String(value).toLowerCase();
        if (!pickable(h)) {
            if (h === "#000000") showToast("Black is not a colour: switch the light off instead", "err");
            return false;
        }
        setPending({ hex: h, from: reportedHex });
        setMode("colour");
        send(k.colorHex, h).then((ok) => { if (!ok) setPending(null); });
        return true;
    }
    function commitBri(e) {
        const p = Number(e.currentTarget.value);
        setBri(p);
        settle("bri", async () => {
            if (!(await send(k.brightness, rawFromPct(p, channel.bri.min, channel.bri.max)))) setBri(null);
        });
    }
    function commitKelvin(e) {
        const kv = Number(e.currentTarget.value);
        setKel(kv);
        setMode("white");
        settle("kel", async () => {
            if (!(await send(k.colorTemp, miredFromKelvin(kv, channel.ct)))) setKel(null);
        });
    }

    const raw = rawKeys(channel, attrs);
    const lit = on && (showWhite || !!hex);                   // a colour, or a white tinted by its kelvin, glows
    const glow = lit ? (showWhite ? kelvinCss(kelvin) : hex) : "var(--surface-soft)";
    return (
        <section class="light-card" aria-label={channel.title}
                 onKeyDown={() => { keyed.current = true; }} onPointerDown={() => { keyed.current = false; }}>
            <div class="light-head">
                <span class="light-icon" aria-hidden="true" style={`background:${glow};box-shadow:${on ? `0 0 18px 2px ${glow}` : "none"}${lit ? `;color:${inkFor(glow)}` : ""}`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></svg>
                </span>
                <div class="light-title">
                    <h4>{channel.title}</h4>
                    <div class="light-status">{status}</div>
                </div>
                {k.state && (
                    <label class="light-power">
                        <span class="toggle">
                            <input type="checkbox" checked={on} onChange={togglePower} aria-label={`Power, ${channel.title}`} />
                            <span class="toggle-slider"></span>
                        </span>
                        <span>Power</span>
                    </label>
                )}
            </div>

            {k.brightness && (
                <div class="light-row">
                    <div class="light-row-head"><label for={`lc-bri-${ieee}${channel.suffix}`}>Brightness</label><b>{briText}</b></div>
                    <input id={`lc-bri-${ieee}${channel.suffix}`} class="light-range" type="range" min="1" max="100" step="1"
                           value={pct} aria-valuetext={haveBri ? briText : "Not reported"}
                           style={`background:linear-gradient(90deg,var(--blue) 0 ${pct}%,var(--border) ${pct}% 100%)`}
                           onInput={(e) => setBri(Number(e.currentTarget.value))} onChange={commitBri} />
                </div>
            )}

            {both && (
                <div class="light-modes" role="group" aria-label="Light mode">
                    <button type="button" aria-pressed={mode === "colour"} onClick={() => setMode("colour")}>Colour</button>
                    <button type="button" aria-pressed={mode === "white"} onClick={() => setMode("white")}>White</button>
                </div>
            )}

            {showColour && (
                <div class="light-colour">
                    <div class="light-pick">
                        <label class="light-picker">
                            <input type="color" value={hex ?? "#ffffff"}
                                   onChange={(e) => { if (!pickHex(e.currentTarget.value)) e.currentTarget.value = hex ?? "#ffffff"; }}
                                   aria-label={`Pick a colour, ${channel.title}`} />
                            <span>Pick a colour</span>
                        </label>
                        <span class="light-hex">{hex ? <>{colourName(hex)} · <code>{hex.toUpperCase()}</code></> : "Not reported"}</span>
                    </div>
                    <div class="light-presets" role="group" aria-label="Colour presets">
                        {PRESETS.map((p) => (
                            <button key={p.hex} type="button" class="light-preset" style={`background:${p.hex}`}
                                    aria-label={p.name} title={p.name} aria-pressed={hex === p.hex}
                                    onClick={() => pickHex(p.hex)} />
                        ))}
                    </div>
                </div>
            )}

            {showWhite && (
                <div class="light-row">
                    <div class="light-row-head"><label for={`lc-ct-${ieee}${channel.suffix}`}>Colour temperature</label><b>{haveK ? `${kelvinLabel(kelvin)} · ${whiteName(kelvin)}` : "—"}</b></div>
                    <input id={`lc-ct-${ieee}${channel.suffix}`} class="light-range light-range-ct" type="range"
                           min={Math.floor(kr.min / 100) * 100} max={Math.ceil(kr.max / 100) * 100} step="100" value={kelvin}
                           aria-valuetext={haveK ? `${kelvinLabel(kelvin)}, ${whiteName(kelvin)}` : "Not reported"}
                           onInput={(e) => setKel(Number(e.currentTarget.value))} onChange={commitKelvin} />
                    <div class="light-ends"><span>Warm</span><span>Cool</span></div>
                </div>
            )}

            {raw.length > 0 && (
                <details class="light-raw">
                    <summary>Raw values</summary>
                    <dl>{raw.map((key) => <div key={key}><dt>{key}</dt> <dd>{String(attrs[key])}</dd></div>)}</dl>
                </details>
            )}
        </section>
    );
}
