// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { signal } from "@preact/signals";
import { call } from "../ws/client.js";

// Ring buffer of log lines. Hard-cap at LOG_CAP to keep memory bounded.
// LogEntry: { ts, level, tag, msg, src }
export const LOG_CAP = 1000;
export const logs = signal([]);

// "paused" blocks the poll in pages/Logs.jsx from refreshing.
export const paused = signal(false);

// Level filter: "" means "all", else one of 'D','I','W','E','V'.
export const levelFilter = signal("");

// Parse classic ring-buffer line format used by `/api/logs` today.
// Fall back to {msg: raw} if it doesn't match. We tolerate both
// structured `{ts, level, tag, msg}` and plain strings.
const LINE_RE = /^(\d+)\s+([DIWEV])\s+\((\d+)\)\s+([^:]+):\s*(.*)$/;

export async function bootstrapLogs() {
    try {
        const data = await call("logs.get");
        const raw = Array.isArray(data) ? data : (data?.logs || []);
        const parsed = raw.map((x) => {
            if (typeof x === "string") {
                const m = x.match(LINE_RE);
                if (m) return { ts: Number(m[1]), level: m[2], tag: m[4].trim(), msg: m[5], src: "s3" };
                return { ts: Date.now(), level: "I", tag: "", msg: x, src: "s3" };
            }
            return {
                ts:    x.ts ?? Date.now(),
                level: x.level ?? "I",
                tag:   x.tag ?? "",
                msg:   x.msg ?? "",
                src:   x.src ?? "s3",
            };
        });
        // Replace wholesale on bootstrap so server snapshot wins.
        logs.value = parsed.slice(-LOG_CAP);
    } catch (_) { /* socket down; bootstrap will retry on reconnect */ }
}

export function clearLogs() { logs.value = []; }
export function togglePause() { paused.value = !paused.value; }
export function setLevelFilter(lvl) { levelFilter.value = lvl || ""; }

// log.entry event subscription removed — live streaming caused
// server-side lock/alloc pressure. Logs page now polls via
// `bootstrapLogs()` on a 5 s interval (see pages/Logs.jsx).
