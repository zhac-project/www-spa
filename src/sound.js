// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings › Sound: the hub's /api/sound calls. The hub validates and caps the volume and owns the sound list;
// this only carries the words across. A failure is an Error with the hub's {"error"} text, or "HTTP <status>",
// and `.status` (a 404 is a firmware built without audio).

async function soundFetch(method, path, body) {
    let tok = "";
    try { tok = localStorage.getItem("zhac_token") || ""; } catch (_) {}
    const headers = { "X-Api-Key": tok, "Cache-Control": "no-store" };
    if (body) headers["Content-Type"] = "application/json";
    const r = await fetch(path, { method, headers, cache: "no-store", body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        const e = new Error(data.error || ("HTTP " + r.status));
        e.status = r.status;
        throw e;
    }
    return data;
}

// The GET and PUT body, as the card reads it: `max_volume` is `max`; the rest has its defaults.
const view = (d) => ({ present: d.present, volume: d.volume, max: d.max_volume, muted: d.muted, playing: d.playing,
                       error: d.error || "", sounds: d.sounds || [] });

export const loadSound = async () => view(await soundFetch("GET", "/api/sound"));
export const saveSound = async (patch) => view(await soundFetch("PUT", "/api/sound", patch));   // {volume?, muted?}
export const playSound = (name) => soundFetch("POST", "/api/sound/play", { name });
export const stopSound = () => soundFetch("POST", "/api/sound/stop");
