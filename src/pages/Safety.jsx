// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Safety: the hub's alarm profiles (spec 2026-11-24 safety profiles). The hub owns them: their states, delays and
// outputs, and the checks on the config. This page shows each profile's state (alarm.get, then the alarm.changed
// push), sends arm, disarm and silence, edits the config the hub checks on alarm.config.set (a refusal is shown as
// the hub words it), and saves the shortcuts as ordinary rules. Words, templates and rule text: src/alarm.js.
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { call, on, onOpen } from "../ws/client.js";
import { devices, deviceDetails, loadDetails, sameIeee } from "../stores/devices.js";
import { createRule } from "../stores/rules.js";
import { showToast, withToast } from "../stores/ui.js";
import { isLocal } from "../utils.js";
import { Card } from "../components/Card.jsx";
import { ALARM_IEEE, STATES, CLASSES, ROLES, WD_MODES, WD_LEVELS, stateLabel, stateKind, countdownLabel, leftNow,
         fmtLeft, classLabel, isSensor, suits, outputKind, newOutput, withValue, proposeId, templatesFor, newProfile,
         running, notGuarding, configToSend, settable, ruleRef, valueChoices, reactionRule, buttonRule, profilesDiffer, afterGet } from "../alarm.js";

const rowOf = (ieee) => devices.value.find((d) => sameIeee(d.ieee, ieee));
const nameOf = (ieee) => { const d = rowOf(ieee); return (d && (d.name || d.friendly)) || ieee; };
const exposesOf = (ieee) => { const d = rowOf(ieee); return (d && deviceDetails.value[d.ieee]?.exposes) || []; };
const others = () => devices.value.filter((d) => !isLocal(d));   // not the hub's own Alarm and Hub I/O
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const SAVE_OFF = "Save is off while an alarm is running: disarm it or wait until it ends.";

// alarm.config.set with the hub's config as it is now, changed by `change`. `change` puts this tab's copy of one
// part in place (the edited profile, or the whole keypads list) and the rest goes back as the hub has it, so a
// change made elsewhere to another profile stays. `codes` as configToSend takes them.
async function saveConfig(change, codes = null) {
    const { config } = await call("alarm.get");
    await call("alarm.config.set", { config: configToSend(change(config), codes) });
}

// One icon per class, drawn as the light card draws its bulb: the app has no icon set.
const ICONS = {
    intrusion: ["M10 2.5l6 2.2v4.6c0 3.7-2.4 6.5-6 8.2-3.6-1.7-6-4.5-6-8.2V4.7z"],
    fire: ["M10 2.5c.5 3 4.5 4.5 4.5 9a4.5 4.5 0 0 1-9 0c0-1.7.8-3.1 2-4.1.2 1.3.9 2.1 1.8 2.4-.5-2.6-.3-5.2.7-7.3z"],
    water: ["M10 2.6c2.7 3.3 5 6 5 8.9a5 5 0 0 1-10 0c0-2.9 2.3-5.6 5-8.9z"],
    gas: ["M3 7.5h8.5a2.25 2.25 0 1 0-2.25-2.25", "M3 11h11.5a2.25 2.25 0 1 1-2.25 2.25", "M3 14.5h5"],
    other: ["M3.5 10a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0", "M10 10h.01"],
};
const ClassIcon = ({ cls }) => (
    <svg class="safety-icon" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {(ICONS[cls] || ICONS.other).map((d) => <path key={d} d={d} />)}
    </svg>
);

export function SafetyPage() {
    const [st, setSt] = useState(null);      // alarm.get / alarm.changed without the config; `at`: when it came, `push`: pushes seen
    const [cfg, setCfg] = useState(null);    // the hub's config, as alarm.get last gave it
    const [err, setErr] = useState("");
    const [ready, setReady] = useState(false);   // device exposes read: the pickers need them
    const [edit, setEdit] = useState(null);  // {p, isNew, key}: the profile in the editor, as edited so far
    const [busy, setBusy] = useState(false);

    const pushes = useRef(0);   // alarm.changed pushes seen; a get that crosses one keeps its status (afterGet)
    async function load() {
        const seen = pushes.current;
        try {
            const reply = await call("alarm.get");
            setSt((cur) => afterGet(cur, reply, seen, Date.now()));
            setCfg(reply.config);
            setErr("");
        } catch (e) { setErr(e.message); }
    }
    const cfgNow = useRef(null);   // for the push handler, registered once
    cfgNow.current = cfg;
    useEffect(() => onOpen(load), []);   // and again after each reconnect
    useEffect(() => on("alarm.changed", (s) => {
        if (!s || !s.profiles) return;
        setSt({ ...s, at: Date.now(), push: ++pushes.current });
        // Profiles added, deleted or moved in another tab: the config again. An open editor keeps its draft.
        if (cfgNow.current && profilesDiffer(cfgNow.current, s)) load();
    }), []);
    useEffect(() => { loadDetails().finally(() => setReady(true)); }, []);

    async function disarmAll() {
        setBusy(true);
        try { await call("alarm.disarm", {}); load(); } catch (e) { setErr(e.message); }
        setBusy(false);
    }
    const opener = useRef(null);   // the Edit or Add button that opened the editor: focus goes back to it
    const addButton = useRef(null);
    const open = (p, isNew, from) => { opener.current = from; setEdit({ p, isNew, key: Date.now() }); };
    // After the commit that closes the editor, so the button is enabled again.
    useLayoutEffect(() => { if (!edit && opener.current?.isConnected) opener.current.focus(); }, [!edit]);

    if (err === "unknown cmd") {
        return <div class="page"><p class="empty-text">This hub's firmware has no alarm panel. Update it on the OTA page.</p></div>;
    }
    const profiles = cfg?.profiles || [];
    return (
        <div class="page safety-page">
            <div class="toolbar">
                <h2>Safety</h2>
                <span class="toolbar-spacer" />
                <button class="primary" disabled={!st || busy} onClick={disarmAll}>Disarm</button>
                <AddMenu button={addButton} cfg={cfg} disabled={!cfg || !!edit} onPick={(t, from) => open(newProfile(t, cfg), true, from)} />
            </div>
            <p class="field-hint" style="margin: -4px 0 12px">Disarm switches off the intrusion profiles and silences any
                other alarm. A flood or fire profile stays armed.</p>
            {err && <p class="error-text">{err}</p>}
            {cfg && (
                <div class="safety-grid">
                    {/* While the editor is open, Edit and Add are off: its Save or Cancel closes it first. */}
                    {profiles.map((p) => (
                        <ProfileCard key={p.id} p={p} s={(st?.profiles || []).find((x) => x.id === p.id)} at={st?.at}
                                     warn={notGuarding(p, st)} editing={edit?.isNew === false && edit.p.id === p.id}
                                     locked={!!edit} reload={load} onEdit={(from) => open(p, false, from)} />
                    ))}
                </div>
            )}
            {cfg && !ready && <p class="field-hint">Reading what your devices can do…</p>}
            {cfg && ready && edit && (
                <ProfileEditor key={edit.key} edit={edit} setEdit={setEdit} profiles={profiles} st={st} saved={load}
                               deleted={() => { opener.current = addButton.current; }} />
            )}
            {cfg && ready && (
                <div class="cards">
                    <KeypadsCard cfg={cfg} st={st} saved={load} />
                    <ShortcutsCard profiles={profiles} />
                </div>
            )}
        </div>
    );
}

// "+ Add profile": the templates as a menu (the menu button pattern). It opens with focus on its first item; the
// arrow keys, Home and End move between the items; Escape, or the button again, closes it and gives focus back to
// the button. A click elsewhere or Tab closes it and leaves focus where it went; a click on the menu's padding
// or separator changes nothing; a pick opens the editor, which takes focus (`onPick` gets the button, which the
// editor gives focus back to).
function AddMenu({ cfg, disabled, onPick, button }) {
    const [open, setOpen] = useState(false);
    const wrap = useRef(null);
    const items = () => [...(wrap.current?.querySelectorAll("[role=menuitem]") || [])];
    useLayoutEffect(() => {   // in the frame the menu appears: no click can come before its focus and listener
        if (!open) return;
        items()[0]?.focus();
        const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("pointerdown", away);
        return () => document.removeEventListener("pointerdown", away);
    }, [open]);
    function keys(e) {
        if (!open) return;
        if (e.key === "Tab") { setOpen(false); return; }
        const list = items(), i = list.indexOf(document.activeElement);
        const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
        if (e.key === "Escape") { setOpen(false); button.current?.focus(); }
        else if (to !== undefined) list[(to + list.length) % list.length]?.focus();
        else return;
        e.preventDefault();
    }
    return (
        <div class="safety-menu-wrap" ref={wrap} onKeyDown={keys}>
            <button ref={button} class="safety-add" aria-haspopup="menu" aria-expanded={open} disabled={disabled}
                    onClick={() => { setOpen(!open); button.current?.focus(); }}>
                + Add profile
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7.5l5 5 5-5" /></svg>
            </button>
            {open && (
                <div class="safety-menu" role="menu" aria-label="Profile templates"
                     onMouseDown={(e) => { if (!e.target.closest("[role=menuitem]")) e.preventDefault(); }}>
                    {templatesFor(cfg).map((t) => (
                        <Fragment key={t.key}>
                            {t.key === "custom" && <div class="safety-menu-sep" role="separator" />}
                            <button role="menuitem" tabindex={-1} onClick={() => { setOpen(false); onPick(t, button.current); }}>
                                <ClassIcon cls={t.profile.class} />{t.label}<span class="muted">{classLabel(t.profile.class)}</span>
                            </button>
                        </Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}

// A profile: its state, the countdown, what set it off, and Arm / Silence / Disarm.
function ProfileCard({ p, s, at, warn, editing, locked, onEdit, reload }) {
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(null);   // the hub did not arm: these doors or windows are open
    const [err, setErr] = useState("");
    const state = s?.state;   // none until the profile's status is there
    const counting = s?.left != null;
    // A refusal or an error is about the state it came in: a new state (from here or elsewhere) clears both, before
    // the new state is painted.
    useLayoutEffect(() => { setOpen(null); setErr(""); }, [state]);
    useEffect(() => {
        if (!counting) return;
        setNow(Date.now());
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [counting, at]);

    async function send(cmd, args = {}) {
        setBusy(true); setErr("");
        try {
            const r = await call(cmd, { id: p.id, ...args });
            setOpen(r && r.armed === false ? r.open || [] : null);
            reload();   // the push follows; this covers a missed one
        } catch (e) { setErr(e.message); }
        setBusy(false);
    }
    const arm = (force) => send("alarm.arm", force ? { force: true } : {});

    return (
        <Card className={`alarm-card safety-card${state === "triggered" ? " triggered" : ""}${editing ? " editing" : ""}`}>
            <div class="safety-card-head">
                <ClassIcon cls={p.class} />
                <strong class="safety-name">{p.name}</strong>
                <span class="toolbar-spacer" />
                {state && <span class={`badge badge-${stateKind(state)} alarm-state`} role="status">{stateLabel(state)}</span>}
            </div>
            <p class="muted">{classLabel(p.class)} · {count((p.sensors || []).length, "sensor")} · {count((p.outputs || []).length, "output")}</p>
            <table class="kv-table"><tbody>
                {s?.since > 0 && <tr><th>Since</th><td>{new Date(s.since * 1000).toLocaleString()}</td></tr>}
                {counting && <tr><th>{countdownLabel(state)}</th><td><strong class="safety-count">{fmtLeft(leftNow(s.left, at, now))}</strong></td></tr>}
                {s?.cause && <tr><th>Set off by</th><td>{s.sensor || nameOf(s.cause)}</td></tr>}
                {s?.bypassed?.length > 0 && <tr><th>Not guarded until disarm</th><td>{s.bypassed.map(nameOf).join(", ")}</td></tr>}
            </tbody></table>
            {warn && <p class="alarm-refusal"><strong>Not guarding.</strong> Arm it to watch its sensors.</p>}
            {err && <p class="error-text" role="alert">{err}</p>}
            <div class="btn-strip">
                {state === "disarmed" && <button disabled={busy} aria-label={`Arm: ${p.name}`} onClick={() => arm(false)}>Arm</button>}
                {(state === "pending" || state === "triggered") && <button disabled={busy} aria-label={`Silence: ${p.name}`} onClick={() => send("alarm.silence")}>Silence</button>}
                {state && state !== "disarmed" && <button disabled={busy} aria-label={`Disarm: ${p.name}`} onClick={() => send("alarm.disarm")}>Disarm</button>}
                <span class="toolbar-spacer" />
                <button disabled={locked} aria-label={`Edit: ${p.name}`} onClick={(e) => onEdit(e.currentTarget)}>Edit</button>
            </div>
            {open && (
                <div class="alarm-refusal" role="alert">
                    <p><strong>Not armed.</strong> {open.length === 1 ? "This door or window is" : "These doors or windows are"} open:{" "}
                        {open.map((o) => o.name || nameOf(o.ieee)).join(", ")}.</p>
                    <div class="btn-strip">
                        <button class="danger small" disabled={busy} aria-label={`Arm anyway: ${p.name}`} onClick={() => arm(true)}>Arm anyway</button>
                        <button class="small" onClick={() => setOpen(null)}>Cancel</button>
                    </div>
                    <p class="field-hint">Arming anyway leaves {open.length === 1 ? "it" : "them"} unguarded until the next disarm.</p>
                </div>
            )}
        </Card>
    );
}

// A device list as a select that adds the picked one; it shows the placeholder again after each pick.
function AddPicker({ label, list, onPick }) {
    return (
        <label style="max-width: 360px">{label}
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

// One profile as edited. The id and the class can be set until the first save; after it they are shown.
function ProfileEditor({ edit, setEdit, profiles, st, saved, deleted }) {
    const { p, isNew } = edit;
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [idTyped, setIdTyped] = useState(false);   // an id typed by hand stays; until then the name proposes one
    const box = useRef(null);
    const first = useRef(null);
    // In view, with focus on its first field, in the frame it appears: the Edit or Add that opened it is off now.
    useLayoutEffect(() => { box.current?.scrollIntoView({ block: "start" }); first.current?.focus({ preventScroll: true }); }, []);

    const put = (patch) => { setErr(""); setEdit({ ...edit, p: { ...p, ...patch } }); };   // an edit answers the refusal
    const list = (k) => p[k] || [];
    const setRow = (k, i, row) => put({ [k]: list(k).map((x, j) => (j === i ? row : x)) });
    const editRow = (k, i, patch) => setRow(k, i, { ...list(k)[i], ...patch });
    const drop = (k, i) => put({ [k]: list(k).filter((_, j) => j !== i) });
    const add = (k, row) => put({ [k]: [...list(k), row] });
    const unused = (k, fits) => others().filter((d) => !list(k).some((x) => sameIeee(x.ieee, d.ieee)) && fits(exposesOf(d.ieee)));
    // "" stays text, so the hub refuses an empty field instead of taking its default for it.
    const num = (k) => (e) => put({ [k]: e.currentTarget.value === "" ? "" : Number(e.currentTarget.value) });
    const intrusion = p.class === "intrusion";
    const off = running(st);
    // The sensors this class is for first; any sensor can go into any profile.
    const sensorChoices = unused("sensors", isSensor).sort((a, b) => suits(p.class, exposesOf(b.ieee)) - suits(p.class, exposesOf(a.ieee)));

    // A refused Save or Delete leaves focus on the body (its button was off while the request was out): back to
    // that button once it is on again. A Delete takes the Edit button that opened the editor away: the page is told.
    const back = useRef(null), saveButton = useRef(null), deleteButton = useRef(null);
    useLayoutEffect(() => { if (!busy && back.current) { back.current.focus(); back.current = null; } }, [busy]);
    async function write(change, done, from) {
        setBusy(true); setErr("");
        try { await saveConfig(change); }
        catch (e) { setErr(e.message); back.current = from.current; setBusy(false); return; }
        showToast(done, "ok");
        if (from === deleteButton) deleted();
        setEdit(null);
        saved();
    }
    // In its place; a new one (or one deleted elsewhere meanwhile) at the end.
    const save = () => write((c) => {
        const all = c.profiles || [];
        const kept = !isNew && all.some((x) => x.id === p.id);
        return { ...c, profiles: kept ? all.map((x) => (x.id === p.id ? p : x)) : [...all, p] };
    }, `Saved: ${p.name}`, saveButton);
    const remove = () => confirm(`Delete the profile ${p.name}?\n\nRules that name ${p.id} stop working.`) &&
        write((c) => ({ ...c, profiles: (c.profiles || []).filter((x) => x.id !== p.id) }), `Deleted: ${p.name}`, deleteButton);

    return (
        <div class="card alarm-card alarm-wide safety-editor" ref={box}>
            <h3>{isNew ? "New profile" : "Edit profile"}: {p.name}</h3>
            {/* While a save is out its fields are off: what is typed then would be lost with the editor that closes on success. */}
            <fieldset class="safety-set" disabled={busy}>
                <div class="safety-fields">
                    <label>Name<input ref={first} type="text" value={p.name}
                                      onInput={(e) => { const name = e.currentTarget.value; put(isNew && !idTyped ? { name, id: proposeId(name, profiles) } : { name }); }} /></label>
                    {isNew
                        ? <label>Id<input type="text" class="mono" value={p.id} spellcheck={false} autocomplete="off"
                                          onInput={(e) => { setIdTyped(true); put({ id: e.currentTarget.value }); }} /></label>
                        : <div class="safety-fixed"><span>Id</span><span class="safety-fixed-val mono">{p.id}</span></div>}
                    {isNew
                        ? <label>Class
                              <select value={p.class} onChange={(e) => put({ class: e.currentTarget.value, role: "" })}>
                                  {CLASSES.map((c) => <option key={c} value={c}>{classLabel(c)}</option>)}
                              </select>
                          </label>
                        : <div class="safety-fixed"><span>Class</span><span class="safety-fixed-val"><ClassIcon cls={p.class} />{classLabel(p.class)}</span></div>}
                    <label>Keypad button
                        <select value={intrusion ? p.role || "" : ""} disabled={!intrusion} onChange={(e) => put({ role: e.currentTarget.value })}>
                            {ROLES.map((r) => <option key={r} value={r}>{r || "none"}</option>)}
                        </select>
                    </label>
                </div>
                <p class="field-hint">The id and the class are fixed once the profile is saved: rules, MQTT and Home Assistant
                    refer to the id. A keypad button is for intrusion profiles only.</p>

                <div class="safety-fields" style="margin-top: 10px">
                    <label>Arm delay, seconds<input type="number" min="0" max="300" value={p.arm_delay} onInput={num("arm_delay")} /></label>
                    <label>Trigger delay, seconds<input type="number" min="0" max="300" value={p.trigger_delay} onInput={num("trigger_delay")} /></label>
                    <label>Alarm time, seconds<input type="number" min="10" max="1800" value={p.siren_time} onInput={num("siren_time")} /></label>
                </div>
                <p class="field-hint">The arm delay is the time before the profile is armed. The trigger delay is the time to
                    disarm after a delayed sensor goes off. When the alarm time ends the outputs stop and the profile stays armed.</p>

                <p style="margin-top: 14px"><Check label="Notify when it is armed or disarmed" checked={p.notify_arm} onChange={(v) => put({ notify_arm: v })} /></p>
                <p class="field-hint">An alarm always notifies: a push to the ZHAC app when the hub is linked to ZHAC Cloud, and
                    a Telegram message when the hub's bot is set up.</p>

                <h4>Sensors</h4>
                {list("sensors").map((s, i) => (
                    <div key={s.ieee} class="alarm-row">
                        <span class="alarm-name">{nameOf(s.ieee)}</span>
                        <Check label="delayed" checked={s.entry} onChange={(v) => editRow("sensors", i, { entry: v })} />
                        <button class="danger small" onClick={() => drop("sensors", i)}>Remove</button>
                    </div>
                ))}
                {list("sensors").length === 0 && <p class="empty-text">No sensors yet.</p>}
                <AddPicker label="Add a sensor" list={sensorChoices} onPick={(d) => add("sensors", { ieee: d.ieee, entry: false })} />
                <p class="field-hint">A delayed sensor starts the trigger delay, which gives time to disarm (a front door); any
                    other sets the alarm off at once. An open door or window stops arming. A leak, smoke or gas sensor that is
                    still active sets the alarm off once the profile is armed.</p>

                <h4>Outputs</h4>
                {list("outputs").map((o, i) => {
                    const ex = exposesOf(o.ieee);
                    const tone = ex.find((e) => e.name === "melody") || ex.find((e) => e.name === "ringtone");
                    const vol = ex.find((e) => e.name === "volume");
                    return (
                        <div key={o.ieee} class="alarm-row">
                            <span class="alarm-name">{nameOf(o.ieee)}</span>
                            <Pick label="Signal" value={o.kind} values={["warning", "alarm", "state"]}
                                  onChange={(k) => setRow("outputs", i, newOutput(o.ieee, k, p.class))} />
                            {o.kind === "warning" && <>
                                <Pick label="Mode" value={o.mode} values={WD_MODES} onChange={(v) => editRow("outputs", i, { mode: v })} />
                                <Pick label="Level" value={o.level} values={WD_LEVELS} onChange={(v) => editRow("outputs", i, { level: v })} />
                                <Check label="strobe" checked={o.strobe} onChange={(v) => editRow("outputs", i, { strobe: v })} />
                            </>}
                            {o.kind === "alarm" && tone && <Tone label="Melody" expose={tone} value={o.melody} onChange={(v) => editRow("outputs", i, { melody: v })} />}
                            {o.kind === "alarm" && vol && <Tone label="Volume" expose={vol} value={o.volume} onChange={(v) => editRow("outputs", i, { volume: v })} />}
                            {o.kind === "state" && <>
                                <Pick label="Set to" value={o.value} values={["on", "off"]} onChange={(v) => setRow("outputs", i, withValue(o, v))} />
                                <Check label="leave it so" checked={o.keep} onChange={(v) => editRow("outputs", i, { keep: v })} />
                            </>}
                            <button class="danger small" onClick={() => drop("outputs", i)}>Remove</button>
                        </div>
                    );
                })}
                {list("outputs").length === 0 && <p class="empty-text">No outputs yet.</p>}
                <AddPicker label="Add an output" list={unused("outputs", (ex) => outputKind(ex) !== "")}
                           onPick={(d) => add("outputs", newOutput(d.ieee, outputKind(exposesOf(d.ieee)), p.class))} />
                <p class="field-hint">Signal <code>warning</code>: a Zigbee (IAS) siren, with its mode, level and strobe.
                    <code> alarm</code>: a Tuya siren, with its melody and volume. <code>state</code>: a switch, a plug or a
                    valve, set on or off. The outputs act in this order for the alarm time, and stop when it ends or on
                    disarm. One that is left so is set once and never switched back: a valve closed by a leak stays closed
                    until you open it.</p>
            </fieldset>

            {err && <p class="error-text" role="alert">{err}</p>}
            {off && <p class="field-hint">{SAVE_OFF}</p>}
            <div class="btn-strip" style="margin-top: 16px">
                <button ref={saveButton} class="primary" disabled={busy || off} onClick={save}>Save</button>
                <button disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
                <span class="toolbar-spacer" />
                {!isNew && <button ref={deleteButton} class="danger" disabled={busy || off} onClick={remove}>Delete profile</button>}
            </div>
        </div>
    );
}

function KeypadsCard({ cfg, st, saved }) {
    const [pads, setPads] = useState(null);    // null: the hub's keypads; a list once edited here
    const [codes, setCodes] = useState(null);  // null: keep the stored codes; a list replaces them
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    const list = pads || cfg.keypads || [];
    const edit = (i, patch) => setPads(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const n = cfg.codes_count || 0;
    const off = running(st);
    useLayoutEffect(() => setErr(""), [pads, codes]);   // an edit answers the refusal; a refusal itself changes neither

    async function save() {
        setBusy(true); setErr("");
        try {
            await saveConfig((c) => (pads ? { ...c, keypads: pads } : c), codes);
            setPads(null); setCodes(null);
            showToast("Keypads and codes saved", "ok");
            saved();
        } catch (e) { setErr(e.message); }
        setBusy(false);
    }

    return (
        <Card title="Keypads and codes" className="alarm-card">
            <h4>Keypads and key fobs</h4>
            {list.map((k, i) => (
                <div key={k.ieee} class="alarm-row">
                    <span class="alarm-name">{nameOf(k.ieee)}</span>
                    <Check label="trusted: disarms without a code" checked={k.trusted} onChange={(v) => edit(i, { trusted: v })} />
                    <button class="danger small" onClick={() => setPads(list.filter((_, j) => j !== i))}>Remove</button>
                </div>
            ))}
            {list.length === 0 && <p class="empty-text">No keypads yet.</p>}
            <AddPicker label="Add a keypad" list={others().filter((d) => !list.some((x) => sameIeee(x.ieee, d.ieee)))}
                       onPick={(d) => setPads([...list, { ieee: d.ieee, trusted: false }])} />
            <p class="field-hint">A keypad's arm buttons arm the intrusion profile set for that button (away, home,
                night); no code is asked. To disarm, a keypad needs one of the codes below, unless it is trusted (a key
                fob). Its disarm also silences a sounding flood or fire profile. Its panic, emergency and fire buttons set
                the alarm off even when disarmed.</p>

            <h4>Codes</h4>
            <p>{n ? `${n} code${n === 1 ? "" : "s"} set.` : "No codes set: only a trusted keypad can disarm."} The hub never shows them.</p>
            {codes == null
                ? <div class="btn-strip"><button class="small" onClick={() => setCodes([""])}>Replace the codes…</button></div>
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

            {err && <p class="error-text" role="alert">{err}</p>}
            {off && <p class="field-hint">{SAVE_OFF}</p>}
            <div class="btn-strip" style="margin-top: 16px"><button class="primary" disabled={busy || off} onClick={save}>Save</button></div>
        </Card>
    );
}

function ShortcutsCard({ profiles }) {
    // The Alarm device by its current name (or its address), as the rules must name it.
    const alarm = ruleRef(rowOf(ALARM_IEEE) || { ieee: ALARM_IEEE }, devices.value);
    return (
        <Card title="Rule shortcuts" className="alarm-card">
            <p class="field-hint">Each makes an ordinary rule: change or delete it on the Rules page.</p>
            <div class="safety-two">
                <div><ReactionForm alarm={alarm} profiles={profiles} /></div>
                <div><ButtonForm alarm={alarm} profiles={profiles} /></div>
            </div>
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

// A profile by its name; the rule names it by its id. `none` labels "".
function ProfilePicker({ value, profiles, none, onChange }) {
    return (
        <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
            <option value="">{none}</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
    );
}

function ReactionForm({ alarm, profiles }) {
    const [f, setF] = useState({ profile: "", state: "triggered", ieee: "", key: "", value: "" });
    const set = (patch) => setF({ ...f, ...patch });
    const profile = profiles.some((p) => p.id === f.profile) ? f.profile : "";   // none again once it is deleted
    const targets = devices.value.filter((d) => !sameIeee(d.ieee, ALARM_IEEE) && settable(exposesOf(d.ieee)).length);
    const keys = settable(exposesOf(f.ieee));
    const expose = keys.find((e) => e.name === f.key);
    const dev = rowOf(f.ieee);
    const rule = dev && reactionRule({ alarm, profile, state: f.state, device: ruleRef(dev, devices.value), key: f.key, value: f.value.trim() });
    return (
        <>
            <h4>Add a reaction</h4>
            <label>When the profile<ProfilePicker value={profile} profiles={profiles} none="— choose —" onChange={(v) => set({ profile: v })} /></label>
            <label>becomes
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

// Profile "" is all of them, which a button can only disarm (alarm_state).
function ButtonForm({ alarm, profiles }) {
    const [f, setF] = useState({ ieee: "", action: "", profile: profiles[0]?.id || "", target: "armed" });
    const set = (patch) => setF({ ...f, ...patch });
    // A profile deleted since it was picked: the form's first choice again ("" stays all of them).
    const profile = f.profile === "" || profiles.some((p) => p.id === f.profile) ? f.profile : profiles[0]?.id || "";
    const all = profile === "";
    const target = all ? "disarmed" : f.target;
    const buttons = others().filter((d) => exposesOf(d.ieee).some((e) => e.name === "action"));
    const actionExpose = exposesOf(f.ieee).find((e) => e.name === "action");
    const dev = rowOf(f.ieee);
    const rule = dev && buttonRule({ button: ruleRef(dev, devices.value), action: f.action.trim(), alarm, profile, target });
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
            <label>set the profile<ProfilePicker value={profile} profiles={profiles} none="all of them" onChange={(v) => set({ profile: v })} /></label>
            <label>to
                <select value={target} onChange={(e) => set({ target: e.currentTarget.value })}>
                    {(all ? ["disarmed"] : ["armed", "disarmed"]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
            </label>
            {target === "disarmed" && <p class="field-hint">Anyone who can press the button can then disarm: no code is
                asked.{all && " All of them: the intrusion profiles are disarmed and any other alarm is silenced."}</p>}
            {target === "armed" && <p class="field-hint">The button does not arm while a door or window is open.</p>}
            <RulePreview rule={rule} />
            <div class="btn-strip"><button class="primary small" disabled={!rule} onClick={() => saveRule(rule)}>Save rule</button></div>
        </>
    );
}
