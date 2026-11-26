// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings › Sound: the hub's speaker. GET /api/sound has the volume (and its cap), mute and the list of built-in
// sounds; the hub checks every change and its 400 {"error"} text is shown as-is. A firmware built without audio
// has no /api/sound: the 404 hides the card. The REST calls: src/sound.js.
import { useEffect, useRef, useState } from "preact/hooks";
import { withToast, showToast } from "../stores/ui.js";
import { Card } from "../components/Card.jsx";
import { Badge } from "../components/Badge.jsx";
import { ToggleRow } from "../components/ToggleRow.jsx";
import { loadSound, saveSound, playSound, stopSound } from "../sound.js";

export function SoundCard() {
    const [s, setS]       = useState(null);   // the GET body, as src/sound.js maps it
    const [vol, setVol]   = useState(0);      // the slider, ahead of the save while it is dragged
    const [gone, setGone] = useState(false);  // 404: no audio in this firmware
    const [loadErr, setLoadErr] = useState("");
    const hub     = useRef(null);   // the hub's last state (a timer's closure would hold an older one)
    const latest  = useRef(0);      // the newest save: an older save's answer, or its reload, is dropped
    const picked  = useRef(null);   // a volume moved to and not sent yet: no answer moves the slider off it
    const timer   = useRef(0);      // the wait before that volume is sent
    const keyDown = useRef(false);  // a key is down on the slider: its repeats are still to come

    function adopt(d) {
        hub.current = d;
        setS(d);
        if (picked.current === null) setVol(d.volume);
    }
    useEffect(() => {
        loadSound().then(adopt).catch(e => {
            if (e.status === 404) setGone(true); else setLoadErr(e.message);
        });
        return () => {   // the card goes away with a volume not sent yet: send it now
            clearTimeout(timer.current);
            if (picked.current !== null) saveSound({ volume: picked.current }).catch(() => {});
        };
    }, []);
    if (gone) return null;

    async function save(patch, okMsg) {
        const me = ++latest.current;
        const newest = () => me === latest.current;   // else a newer save is out, and its answer decides
        try {
            const d = await saveSound(patch);
            if (!newest()) return;
            if (okMsg) showToast(okMsg, "ok");
            adopt(d);
        } catch (e) {
            if (!newest()) return;
            showToast(`Failed: ${e.message}`, "err");
            // Refused: the hub's state again, for the slider and the switch (the checkbox flipped on the click, and
            // setting the same state back would not render). If the hub cannot be read, its last state, as a new object.
            loadSound().then((d) => newest() && adopt(d)).catch(() => newest() && adopt({ ...hub.current }));
        }
    }
    // A key moves the slider a step at a time and a held one repeats: the volume is sent once no key is down and
    // 300 ms have passed since the last change. A drag changes it when it is let go.
    function pick(v, changed) {
        setVol(v);
        picked.current = v;
        clearTimeout(timer.current);
        if (!changed) return;   // still dragging
        timer.current = setTimeout(function send() {
            if (keyDown.current) { timer.current = setTimeout(send, 300); return; }
            picked.current = null;
            save({ volume: v }, "Volume saved");
        }, 300);
    }
    const play = (name) => withToast(() => playSound(name), null, "Failed");
    const stop = () => withToast(stopSound, null, "Failed");

    if (s == null) return <Card title="Sound">{loadErr ? <p class="error-text">{loadErr}</p> : "…"}</Card>;
    if (!s.present) return (
        <Card title="Sound">
            <p class="empty-text">No speaker found on this board</p>
            {s.error && <p class="error-text">{s.error}</p>}
        </Card>
    );

    const pct = s.max > 0 ? Math.min(100, Math.round(vol * 100 / s.max)) : 0;
    return (
        <Card title="Sound">
            <div class="light-row-head"><label for="sound-volume">Volume</label><b>{vol}</b></div>
            <input id="sound-volume" class="light-range" type="range" min="0" max={s.max} step="1" value={vol}
                   style={`background:linear-gradient(90deg,var(--blue) 0 ${pct}%,var(--border) ${pct}% 100%)`}
                   onInput={(e) => pick(Number(e.currentTarget.value), false)}
                   onChange={(e) => pick(Number(e.currentTarget.value), true)}
                   onKeyDown={() => { keyDown.current = true; }}
                   onKeyUp={() => { keyDown.current = false; }}
                   onBlur={() => { keyDown.current = false; }} />
            <ToggleRow label="Mute" checked={s.muted} onChange={(v) => save({ muted: v })} />
            <p class="field-hint">Urgent sounds (alarm, siren, fire, co) still play</p>
            {s.error && <p class="error-text">{s.error}</p>}
            {s.sounds.map(x => (
                <div key={x.name} style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <code>{x.name}</code>
                    {x.loop && <Badge kind="off">loop</Badge>}
                    {x.urgent && <Badge kind="warn">urgent</Badge>}
                    <button type="button" class="small" style="margin-left:auto" aria-label={`Play ${x.name}`}
                            onClick={() => play(x.name)}>▶</button>
                </div>
            ))}
            <div class="btn-strip" style="margin-top:8px">
                <button type="button" class="small" onClick={stop}>■ Stop</button>
            </div>
        </Card>
    );
}
