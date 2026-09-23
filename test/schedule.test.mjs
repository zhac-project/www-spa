import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEDULE_DAYS, PERIODS, isScheduleKey, parseDay, formatDay, validateDay } from "../src/schedule.js";

const DAY = "06:00/20.0 08:00/15.0 17:00/21.0 22:00/15.0";

test("seven days, Monday first, each a firmware key", () => {
    assert.equal(SCHEDULE_DAYS.length, 7);
    assert.equal(SCHEDULE_DAYS[0].key, "schedule_monday");
    assert.equal(SCHEDULE_DAYS[6].key, "schedule_sunday");
    assert.ok(isScheduleKey("schedule_wednesday"));
    assert.ok(!isScheduleKey("schedule_mode"));
    assert.ok(!isScheduleKey("program"));
});

test("a reported day becomes four editable rows and back", () => {
    const rows = parseDay(DAY);
    assert.equal(rows.length, PERIODS);
    assert.deepEqual(rows[0], { time: "06:00", temp: 20 });
    assert.deepEqual(rows[3], { time: "22:00", temp: 15 });
    assert.equal(formatDay(rows), DAY);
});

test("short or empty days pad with blank rows; blanks are left out on save", () => {
    const rows = parseDay("06:00/21 22:00/17");
    assert.equal(rows.length, PERIODS);
    assert.deepEqual(rows[2], { time: "", temp: "" });
    assert.equal(formatDay(rows), "06:00/21.0 22:00/17.0");
    assert.deepEqual(parseDay(undefined), parseDay(""));
    assert.equal(parseDay("").filter(r => r.time).length, 0);
});

test("text that is not a schedule is not parsed", () => {
    assert.equal(parseDay("garbage"), null);
    assert.equal(parseDay("06:00/20 08:00/15 11:00/15 17:00/21 22:00/15"), null);
});

test("half degrees keep their decimal", () => {
    assert.equal(formatDay([{ time: "07:30", temp: 20.5 }]), "07:30/20.5");
});

test("validation catches what the thermostat would refuse", () => {
    const ok = parseDay(DAY);
    assert.equal(validateDay(ok), null);
    assert.match(validateDay(parseDay("")), /at least one/);
    assert.match(validateDay([{ time: "08:00", temp: 20 }, { time: "06:00", temp: 18 }]), /go up/);
    assert.match(validateDay([{ time: "06:00", temp: 4.5 }]), /5.30/);
    assert.match(validateDay([{ time: "06:00", temp: 31 }]), /5.30/);
    assert.match(validateDay([{ time: "06:00", temp: 20.3 }]), /0\.5/);
    assert.match(validateDay([{ time: "", temp: 20 }]), /start time/);
    assert.match(validateDay([{ time: "06:00", temp: "" }]), /temperature/);
});
