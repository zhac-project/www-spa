// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings › Sound: the hub's speaker. GET /api/sound has the volume (and its cap), mute and the list of built-in
// sounds; the hub checks every change and its 400 {"error"} text is shown as-is. A firmware built without audio
// has no /api/sound: the 404 hides the card. The REST calls: src/sound.js.
import { useEffect, useState } from "preact/hooks";
import { withToast, SUCCESS } from "../stores/ui.js";
import { Card } from "../components/Card.jsx";
import { Badge } from "../components/Badge.jsx";
import { ToggleRow } from "../components/ToggleRow.jsx";
import { loadSound, saveSound, playSound, stopSound } from "../sound.js";

export function SoundCard() {
    const [s, setS]       = useState(null);   // the GET body, as src/sound.js maps it
    const [vol, setVol]   = useState(0);      // the slider, ahead of the save while it is dragged
    const [gone, setGone] = useState(false);  // 404: no audio in this firmware
    const [loadErr, setLoadErr] = useState("");

    function adopt(d) { setS(d); setVol(d.volume); }
    useEffect(() => {
        loadSound().then(adopt).catch(e => {
            if (e.status === 404) setGone(true); else setLoadErr(e.message);
        });
    }, []);
    if (gone) return null;

    async function save(patch, okMsg) {
        let d;
        const r = await withToast(async () => { d = await saveSound(patch); }, okMsg, "Failed");
        if (r === SUCCESS) adopt(d); else if (s) setVol(s.volume);   // refused: the slider goes back
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
                   onInput={(e) => setVol(Number(e.currentTarget.value))}
                   onChange={(e) => save({ volume: Number(e.currentTarget.value) }, "Volume saved")} />
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
