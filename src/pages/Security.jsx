// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Security: the hub's alarm panel (spec 2026-11-24 security mode, stage 1). The hub owns the panel: its
// states, delays and sirens, and the checks on its config. This page shows the state (alarm.get, then the
// alarm.changed push), sends arm and disarm, edits the config the hub checks on alarm.config.set (its
// refusal is shown as is), and saves the shortcuts as ordinary rules. Words and rule text: src/alarm.js.
import { useEffect, useState } from "preact/hooks";
import { call, on, onOpen } from "../ws/client.js";
import { devices, deviceDetails, loadDetails, sameIeee } from "../stores/devices.js";
import { createRule } from "../stores/rules.js";
import { showToast, withToast, SUCCESS } from "../stores/ui.js";
import { isLocal } from "../utils.js";
import { Card } from "../components/Card.jsx";
import { ALARM_IEEE, MODES, STATES, SETTABLE, WD_MODES, WD_LEVELS, stateLabel, stateKind, countdownLabel, leftNow,
         fmtLeft, isSensor, newSensor, sirenKind, newSiren, configToSend, settable, ruleRef, valueChoices,
         reactionRule, buttonRule } from "../alarm.js";

const rowOf = (ieee) => devices.value.find((d) => sameIeee(d.ieee, ieee));
const nameOf = (ieee) => { const d = rowOf(ieee); return (d && (d.name || d.friendly)) || ieee; };
const exposesOf = (ieee) => { const d = rowOf(ieee); return (d && deviceDetails.value[d.ieee]?.exposes) || []; };
const others = () => devices.value.filter((d) => !isLocal(d));   // not the hub's own Alarm and Hub I/O

export function SecurityPage() {
    const [st, setSt] = useState(null);      // alarm.get / alarm.changed without the config; `at`: when it came
    const [cfg, setCfg] = useState(null);    // the config being edited
    const [err, setErr] = useState("");
    const [ready, setReady] = useState(false);   // device exposes read: the pickers need them

    // fresh: take the hub's config over an edit (after a save); otherwise only the first time.
    async function load(fresh) {
        try {
            const { config, ...s } = await call("alarm.get");
            setSt({ ...s, at: Date.now() });
            setCfg((c) => (fresh || !c ? config : c));
            setErr("");
        } catch (e) { setErr(e.message); }
    }
    useEffect(() => onOpen(() => load(false)), []);   // and again after each reconnect
    useEffect(() => on("alarm.changed", (s) => { if (s && s.state) setSt({ ...s, at: Date.now() }); }), []);
    useEffect(() => { loadDetails().finally(() => setReady(true)); }, []);

    if (err === "unknown cmd") {
        return <div class="page"><p class="empty-text">This hub's firmware has no alarm panel. Update it on the OTA page.</p></div>;
    }
    return (
        <div class="page">
            {err && <p class="error-text">{err}</p>}
            <div class="cards">
                {st && <StateCard st={st} reload={() => load(false)} />}
                {cfg && (ready ? <ConfigCard cfg={cfg} setCfg={setCfg} saved={() => load(true)} />
                               : <p class="field-hint">Reading what your devices can do…</p>)}
                {st && ready && <ShortcutsCard />}
            </div>
        </div>
    );
}

function StateCard({ st, reload }) {
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(null);   // {mode, list}: the hub did not arm, doors or windows are open
    const counting = st.left != null;
    useEffect(() => {
        if (!counting) return;
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [counting, st.at]);

    async function send(cmd, args) {
        setBusy(true);
        let r;
        const ok = await withToast(async () => { r = await call(cmd, args); }, null,
                                   cmd === "alarm.disarm" ? "Disarm failed" : "Not armed");
        setBusy(false);
        if (ok !== SUCCESS) return;
        setOpen(r && r.armed === false ? { mode: args.mode, list: r.open || [] } : null);
        reload();   // the push follows; this covers a missed one
    }
    const arm = (mode, force) => send("alarm.arm", force ? { mode, force: true } : { mode });

    return (
        <Card title="Alarm" className="alarm-card">
            <p><span class={`badge badge-${stateKind(st.state)} alarm-state`} role="status">{stateLabel(st)}</span></p>
            <table class="kv-table"><tbody>
                {st.since > 0 && <tr><th>Since</th><td>{new Date(st.since * 1000).toLocaleString()}</td></tr>}
                {counting && <tr><th>{countdownLabel(st.state)}</th><td><strong>{fmtLeft(leftNow(st.left, st.at, now))}</strong></td></tr>}
                {st.cause && <tr><th>Set off by</th><td>{st.sensor || nameOf(st.cause)}</td></tr>}
                {st.bypassed?.length > 0 && <tr><th>Not guarded until disarm</th><td>{st.bypassed.map(nameOf).join(", ")}</td></tr>}
            </tbody></table>
            <div class="btn-strip">
                {MODES.map((m) => <button key={m} disabled={busy} onClick={() => arm(m)}>Arm {m}</button>)}
                <button class="primary" disabled={busy} onClick={() => send("alarm.disarm", {})}>Disarm</button>
            </div>
            {open && (
                <div class="alarm-refusal" role="alert">
                    <p><strong>Not armed.</strong> {open.list.length === 1 ? "This door or window is" : "These doors or windows are"} open:{" "}
                        {open.list.map((o) => o.name || nameOf(o.ieee)).join(", ")}.</p>
                    <div class="btn-strip">
                        <button class="danger small" disabled={busy} onClick={() => arm(open.mode, true)}>Arm {open.mode} anyway</button>
                        <button class="small" onClick={() => setOpen(null)}>Cancel</button>
                    </div>
                    <p class="field-hint">Arming anyway leaves {open.list.length === 1 ? "it" : "them"} unguarded until the next disarm.</p>
                </div>
            )}
            <p class="field-hint">Arm home and arm night take effect at once; arm away waits for the exit delay.</p>
        </Card>
    );
}

// A device list as a select that adds the picked one; it shows the placeholder again after each pick.
function AddPicker({ label, list, onPick }) {
    return (
        <label>{label}
            <select value="" disabled={list.length === 0}
                    onChange={(e) => { const d = list.find((x) => x.ieee === e.currentTarget.value); if (d) onPick(d); }}>
                <option value="">{list.length ? "— choose —" : "— no device fits —"}</option>
                {list.map((d) => <option key={d.ieee} value={d.ieee}>{d.name || d.friendly || d.ieee}</option>)}
            </select>
        </label>
    );
}

const Pick = ({ label, value, values, onChange }) => (
    <label class="check-label">{label}
        <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
            {values.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
    </label>
);

// A Tuya siren's melody or volume as its expose names them: one of its values or a number in its range,
// sent as text. Empty: the siren's own.
function Tone({ label, expose: e, value, onChange }) {
    const set = (ev) => onChange(ev.currentTarget.value || undefined);
    return (
        <label class="check-label">{label}
            {e.type === "numeric"
                ? <input type="number" min={e.value_min} max={e.value_max} value={value ?? ""} style="width:80px" onInput={set} />
                : <select value={value ?? ""} onChange={set}>
                      <option value="">the siren's own</option>
                      {(e.values || []).map((v) => <option key={v} value={String(v)}>{String(v)}</option>)}
                  </select>}
        </label>
    );
}

const Check = ({ label, checked, onChange }) => (
    <label class="check-label"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.currentTarget.checked)} /> {label}</label>
);

function ConfigCard({ cfg, setCfg, saved }) {
    const [codes, setCodes] = useState(null);   // null: keep the stored codes; a list replaces them
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    const put = (patch) => setCfg({ ...cfg, ...patch });
    const list = (k) => cfg[k] || [];
    const setRow = (k, i, row) => put({ [k]: list(k).map((x, j) => (j === i ? row : x)) });
    const edit = (k, i, patch) => setRow(k, i, { ...list(k)[i], ...patch });
    const drop = (k, i) => put({ [k]: list(k).filter((_, j) => j !== i) });
    const add = (k, row) => put({ [k]: [...list(k), row] });
    const unused = (k, fits) => others().filter((d) => !list(k).some((x) => sameIeee(x.ieee, d.ieee)) && fits(exposesOf(d.ieee)));
    // "" stays text, so the hub refuses an empty field instead of taking its default for it.
    const num = (k) => (e) => put({ [k]: e.currentTarget.value === "" ? "" : Number(e.currentTarget.value) });
    const n = cfg.codes_count || 0;

    async function save() {
        setBusy(true); setErr("");
        try {
            await call("alarm.config.set", { config: configToSend(cfg, codes) });
            setCodes(null);
            showToast("Alarm settings saved", "ok");
            saved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    }

    return (
        <Card title="Alarm settings" className="alarm-card alarm-wide">
            <h4>Sensors</h4>
            {list("sensors").map((s, i) => (
                <div key={s.ieee} class="alarm-row">
                    <span class="alarm-name">{nameOf(s.ieee)}</span>
                    {MODES.map((m) => (
                        <Check key={m} label={m} checked={(s.modes || []).includes(m)}
                               onChange={(v) => edit("sensors", i, { modes: MODES.filter((x) => (x === m ? v : (s.modes || []).includes(x))) })} />
                    ))}
                    <Check label="entry delay" checked={s.entry} onChange={(v) => edit("sensors", i, { entry: v })} />
                    <button class="danger small" onClick={() => drop("sensors", i)}>Remove</button>
                </div>
            ))}
            {list("sensors").length === 0 && <p class="empty-text">No sensors yet.</p>}
            <AddPicker label="Add a sensor" list={unused("sensors", isSensor)}
                       onPick={(d) => add("sensors", newSensor(d.ieee, exposesOf(d.ieee)))} />
            <p class="field-hint">A sensor guards in the modes ticked. One with the entry delay gives time to disarm
                (a front door); any other sets the alarm off at once. Only an open door or window stops arming;
                motion and vibration do not.</p>

            <h4>Delays</h4>
            <label>Exit delay, seconds (arm away)<input type="number" min="0" max="300" value={cfg.exit_delay} onInput={num("exit_delay")} /></label>
            <label>Entry delay, seconds<input type="number" min="0" max="300" value={cfg.entry_delay} onInput={num("entry_delay")} /></label>
            <label>Siren time, seconds<input type="number" min="10" max="1800" value={cfg.siren_time} onInput={num("siren_time")} /></label>
            <p class="field-hint">When the siren time ends the sirens stop and the alarm goes back to the state it was armed in.</p>

            <h4>Sirens</h4>
            {list("sirens").map((s, i) => {
                const ex = exposesOf(s.ieee);
                const tone = ex.find((e) => e.name === "melody") || ex.find((e) => e.name === "ringtone");
                const vol = ex.find((e) => e.name === "volume");
                return (
                    <div key={s.ieee} class="alarm-row">
                        <span class="alarm-name">{nameOf(s.ieee)}</span>
                        <Pick label="Signal" value={s.kind} values={["warning", "alarm", "state"]}
                              onChange={(k) => setRow("sirens", i, newSiren(s.ieee, k))} />
                        {s.kind === "warning" && <>
                            <Pick label="Mode" value={s.mode} values={WD_MODES} onChange={(v) => edit("sirens", i, { mode: v })} />
                            <Pick label="Level" value={s.level} values={WD_LEVELS} onChange={(v) => edit("sirens", i, { level: v })} />
                            <Check label="strobe" checked={s.strobe} onChange={(v) => edit("sirens", i, { strobe: v })} />
                        </>}
                        {s.kind === "alarm" && tone && <Tone label="Melody" expose={tone} value={s.melody} onChange={(v) => edit("sirens", i, { melody: v })} />}
                        {s.kind === "alarm" && vol && <Tone label="Volume" expose={vol} value={s.volume} onChange={(v) => edit("sirens", i, { volume: v })} />}
                        <button class="danger small" onClick={() => drop("sirens", i)}>Remove</button>
                    </div>
                );
            })}
            {list("sirens").length === 0 && <p class="empty-text">No sirens yet.</p>}
            <AddPicker label="Add a siren" list={unused("sirens", (ex) => sirenKind(ex) !== "")}
                       onPick={(d) => add("sirens", newSiren(d.ieee, sirenKind(exposesOf(d.ieee))))} />
            <p class="field-hint">Signal <code>warning</code>: a Zigbee (IAS) siren, with its mode, level and strobe.
                <code> alarm</code>: a Tuya siren, with its melody and volume. <code>state</code>: a siren on a switch or
                plug. The sirens sound for the siren time, and stop on disarm.</p>

            <h4>Keypads and key fobs</h4>
            {list("keypads").map((k, i) => (
                <div key={k.ieee} class="alarm-row">
                    <span class="alarm-name">{nameOf(k.ieee)}</span>
                    <Check label="trusted: disarms without a code" checked={k.trusted} onChange={(v) => edit("keypads", i, { trusted: v })} />
                    <button class="danger small" onClick={() => drop("keypads", i)}>Remove</button>
                </div>
            ))}
            {list("keypads").length === 0 && <p class="empty-text">No keypads yet.</p>}
            <AddPicker label="Add a keypad" list={unused("keypads", () => true)} onPick={(d) => add("keypads", { ieee: d.ieee, trusted: false })} />
            <p class="field-hint">A keypad arms without a code. To disarm it needs one of the codes below, unless it
                is trusted (a key fob). Its panic, emergency and fire buttons set the alarm off even when disarmed.</p>

            <h4>Codes</h4>
            <p>{n ? `${n} code${n === 1 ? "" : "s"} set.` : "No codes set: only a trusted keypad can disarm."} The hub never shows them.</p>
            {codes == null
                ? <button class="small" onClick={() => setCodes([""])}>Replace the codes…</button>
                : <>
                    {codes.map((c, i) => (
                        <div key={i} class="alarm-row">
                            <input type="password" class="field-input alarm-code" inputmode="numeric" autocomplete="new-password" maxLength={8}
                                   placeholder="4–8 digits" aria-label={`New code ${i + 1}`} value={c}
                                   onInput={(e) => setCodes(codes.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
                            <button class="danger small" onClick={() => setCodes(codes.filter((_, j) => j !== i))}>Remove</button>
                        </div>
                    ))}
                    <div class="btn-strip">
                        <button class="small" onClick={() => setCodes([...codes, ""])}>Add a code</button>
                        <button class="small" onClick={() => setCodes(null)}>Keep the stored codes</button>
                    </div>
                    <p class="field-hint">Save replaces every stored code with these. Saved with none, the codes are
                        cleared and only a trusted keypad can disarm.</p>
                  </>}

            <h4>Notifications</h4>
            <Check label="Also notify when the alarm is armed or disarmed" checked={cfg.notify_arm}
                   onChange={(v) => put({ notify_arm: v })} />
            <p class="field-hint">An alarm always notifies: a push to the ZHAC app when the hub is linked to ZHAC
                Cloud, and a Telegram message when the hub's bot is set up.</p>

            {err && <p class="error-text">{err}</p>}
            <div class="btn-strip"><button class="primary" disabled={busy} onClick={save}>Save</button></div>
        </Card>
    );
}

function ShortcutsCard() {
    // The Alarm device by its current name (or its address), as the rules must name it.
    const alarm = ruleRef(rowOf(ALARM_IEEE) || { ieee: ALARM_IEEE });
    return (
        <Card title="Rule shortcuts" className="alarm-card">
            <p class="field-hint">Each makes an ordinary rule: change or delete it on the Rules page.</p>
            <ReactionForm alarm={alarm} />
            <ButtonForm alarm={alarm} />
        </Card>
    );
}

async function saveRule(rule) {
    await withToast(() => createRule(rule), `Saved: ${rule.name}`, "Save failed");
}

function RulePreview({ rule }) {
    return rule ? <div class="recipe-preview"><pre class="dsl-preview">{rule.dsl}</pre></div> : null;
}

function DevicePicker({ value, list, onChange }) {
    return (
        <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
            <option value="">— choose —</option>
            {list.map((d) => <option key={d.ieee} value={d.ieee}>{d.name || d.friendly || d.ieee}</option>)}
        </select>
    );
}

function ReactionForm({ alarm }) {
    const [f, setF] = useState({ state: "triggered", ieee: "", key: "", value: "" });
    const set = (patch) => setF({ ...f, ...patch });
    const targets = devices.value.filter((d) => !sameIeee(d.ieee, ALARM_IEEE) && settable(exposesOf(d.ieee)).length);
    const keys = settable(exposesOf(f.ieee));
    const expose = keys.find((e) => e.name === f.key);
    const dev = rowOf(f.ieee);
    const rule = dev && reactionRule({ alarm, state: f.state, device: ruleRef(dev), key: f.key, value: f.value.trim() });
    return (
        <>
            <h4>Add a reaction</h4>
            <label>When the alarm becomes
                <select value={f.state} onChange={(e) => set({ state: e.currentTarget.value })}>
                    {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
            </label>
            <label>set the device<DevicePicker value={f.ieee} list={targets} onChange={(v) => set({ ieee: v, key: "", value: "" })} /></label>
            {f.ieee && (
                <label>key
                    <select value={f.key} onChange={(e) => set({ key: e.currentTarget.value, value: "" })}>
                        <option value="">— choose —</option>
                        {keys.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
                    </select>
                </label>
            )}
            {expose && (
                <label>to
                    <input type="text" list="alarm-reaction-values" value={f.value} spellcheck={false}
                           placeholder={expose.type === "numeric" ? "a number" : ""} onInput={(e) => set({ value: e.currentTarget.value })} />
                    <datalist id="alarm-reaction-values">{valueChoices(expose).map((v) => <option key={v} value={v} />)}</datalist>
                </label>
            )}
            <RulePreview rule={rule} />
            <div class="btn-strip"><button class="primary small" disabled={!rule} onClick={() => saveRule(rule)}>Save rule</button></div>
        </>
    );
}

function ButtonForm({ alarm }) {
    const [f, setF] = useState({ ieee: "", action: "", target: "armed_away" });
    const set = (patch) => setF({ ...f, ...patch });
    const buttons = others().filter((d) => exposesOf(d.ieee).some((e) => e.name === "action"));
    const actionExpose = exposesOf(f.ieee).find((e) => e.name === "action");
    const dev = rowOf(f.ieee);
    const rule = dev && buttonRule({ button: ruleRef(dev), action: f.action.trim(), alarm, target: f.target });
    return (
        <>
            <h4>Arm with a button</h4>
            <label>When the button<DevicePicker value={f.ieee} list={buttons} onChange={(v) => set({ ieee: v, action: "" })} /></label>
            {f.ieee && (
                <label>sends the action
                    <input type="text" list="alarm-button-actions" value={f.action} spellcheck={false}
                           onInput={(e) => set({ action: e.currentTarget.value })} />
                    <datalist id="alarm-button-actions">{valueChoices(actionExpose).map((v) => <option key={v} value={v} />)}</datalist>
                </label>
            )}
            <label>set the alarm to
                <select value={f.target} onChange={(e) => set({ target: e.currentTarget.value })}>
                    {SETTABLE.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
            </label>
            {f.target === "disarmed" && <p class="field-hint">Anyone who can press the button can then disarm: no code is asked.</p>}
            {f.target !== "disarmed" && <p class="field-hint">The button does not arm while a door or window is open.</p>}
            <RulePreview rule={rule} />
            <div class="btn-strip"><button class="primary small" disabled={!rule} onClick={() => saveRule(rule)}>Save rule</button></div>
        </>
    );
}
