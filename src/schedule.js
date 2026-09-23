// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Weekly thermostat schedule as the firmware reports it: one string per day,
// `schedule_<day>` = up to four "HH:MM/T.t" periods separated by single
// spaces (from that time on, hold that temperature). The firmware owns the
// wire format and checks every write; this module only turns the string into
// editable rows and back, and flags what the thermostat would refuse before
// a sleepy radiator valve is woken for nothing.

export const SCHEDULE_DAYS = [
    { key: "schedule_monday",    label: "Mon" },
    { key: "schedule_tuesday",   label: "Tue" },
    { key: "schedule_wednesday", label: "Wed" },
    { key: "schedule_thursday",  label: "Thu" },
    { key: "schedule_friday",    label: "Fri" },
    { key: "schedule_saturday",  label: "Sat" },
    { key: "schedule_sunday",    label: "Sun" },
];
export const WEEKDAYS = SCHEDULE_DAYS.slice(0, 5).map(d => d.key);
export const PERIODS = 4;
export const TEMP_MIN = 5, TEMP_MAX = 30, TEMP_STEP = 0.5;

export function isScheduleKey(k) {
    return SCHEDULE_DAYS.some(d => d.key === k);
}

const blank = () => ({ time: "", temp: "" });

// "06:00/20.0 08:00/15.0" → four rows, blanks after the last period.
// null when the text is not a schedule the editor can show.
export function parseDay(s) {
    const rows = [];
    for (const part of String(s ?? "").trim().split(/\s+/).filter(Boolean)) {
        const m = /^(\d{1,2}):(\d{2})\/(\d+(?:\.\d+)?)$/.exec(part);
        if (!m) return null;
        rows.push({ time: `${m[1].padStart(2, "0")}:${m[2]}`, temp: Number(m[3]) });
    }
    if (rows.length > PERIODS) return null;
    // A thermostat stores a short day padded with repeats of its last period
    // (and hubs before v2026092209 reported them as such): show them as the
    // empty rows they stand for, so the day saves as it was entered.
    const same = (a, b) => a.time === b.time && a.temp === b.temp;
    while (rows.length > 1 && same(rows[rows.length - 1], rows[rows.length - 2])) rows.pop();
    while (rows.length < PERIODS) rows.push(blank());
    return rows;
}

const filled = r => r.time !== "" || (r.temp !== "" && r.temp != null);

// Rows → the string the firmware takes; blank rows are left out.
export function formatDay(rows) {
    return rows.filter(filled)
               .map(r => `${r.time}/${Number(r.temp).toFixed(1)}`)
               .join(" ");
}

// The first thing the thermostat would refuse, in words; null when fine.
export function validateDay(rows) {
    const used = rows.filter(filled);
    if (!used.length) return "add at least one period";
    let prev = -1;
    for (const r of used) {
        if (!r.time) return "each period needs a start time";
        if (r.temp === "" || r.temp == null || Number.isNaN(Number(r.temp))) {
            return "each period needs a temperature";
        }
        const [h, m] = r.time.split(":").map(Number);
        const mins = h * 60 + m;
        if (mins <= prev) return "start times must go up through the day";
        prev = mins;
        const t = Number(r.temp);
        if (t < TEMP_MIN || t > TEMP_MAX) return `temperature must be ${TEMP_MIN}–${TEMP_MAX} °C`;
        if (Math.round(t / TEMP_STEP) * TEMP_STEP !== t) return `temperature steps are ${TEMP_STEP} °C`;
    }
    return null;
}
