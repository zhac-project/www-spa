// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Inline DSL reference shown inside the Rules modal "Help" tab. Mirrors
// the most-used surface of docs/RULES_DSL.md so users don't need to
// open the full file. The full reference stays the source of truth.

export function RuleHelp() {
    return (
        <div class="rule-help">
            <p class="field-hint">
                Brief reference. Full doc: <code>docs/RULES_DSL.md</code>.
            </p>

            <h4>Syntax</h4>
            <pre class="dsl-snippet">ON &lt;trigger&gt; DO &lt;action&gt; [; &lt;action&gt; ...] ENDON</pre>
            <p class="field-hint">Up to 4 actions per rule, separated by <code>;</code>.</p>

            <h4>Triggers</h4>
            <p><b>Device attribute change</b> — fires when a device reports a value:</p>
            <pre class="dsl-snippet">{`ON <device>#<attr>[<op><value>] DO ... ENDON`}</pre>
            <p class="field-hint">Operators: <code>=</code> <code>!=</code> <code>&lt;</code> <code>&gt;</code> <code>&lt;=</code> <code>&gt;=</code>; omit for "any change".</p>
            <pre class="dsl-snippet">{`ON kitchen switch#action=single DO zigbee.set "kitchen light" state 1 ENDON
ON 0x001234567890ABCD#temperature>2500 DO publish home/alert hot ENDON
ON door sensor#contact DO event motion ENDON`}</pre>

            <p><b>Wildcard</b> — match every attribute on a device (route to a Lua script):</p>
            <pre class="dsl-snippet">{`ON kitchen_motion DO script.run "kitchen_motion" ENDON`}</pre>

            <p><b>System / Time / Event / Timer / MQTT:</b></p>
            <pre class="dsl-snippet">{`ON System#Boot           DO ... ENDON
ON Time#Cron=0 0 22 * * *  DO ... ENDON     // sec min hour mday mon wday
ON Event#motion_detected DO ... ENDON
ON Rules#Timer=0         DO ... ENDON     // index 0–7
ON Mqtt#home/alarm       DO ... ENDON`}</pre>

            <h4>Actions</h4>
            <pre class="dsl-snippet">{`zigbee.set "<device>" <key> <int>      // set attribute by name
zigbee.toggle "<device>" <key>         // flip binary attr (0↔1)
publish <topic> <payload>              // MQTT publish
event <name>                           // fire internal event
timer <index> <ms>                     // start countdown
log <message>                          // serial log (INFO)
script.run "<name>"                    // run /scripts/<name>.lua`}</pre>

            <h4>Examples</h4>
            <p><b>Motion → light on for 5 minutes</b></p>
            <pre class="dsl-snippet">{`ON motion sensor#occupancy=1 DO zigbee.set "hallway light" state 1 ; timer 0 300000 ENDON
ON Rules#Timer=0 DO zigbee.set "hallway light" state 0 ENDON`}</pre>

            <p><b>Door open → MQTT alert + log</b></p>
            <pre class="dsl-snippet">ON front door#contact=0 DO publish home/door opened ; log door opened ENDON</pre>

            <p><b>Toggle binary attr (single-rule, no script needed)</b></p>
            <pre class="dsl-snippet">ON kitchen switch#action=single DO zigbee.toggle "kitchen light" state ENDON</pre>
            <p class="field-hint">Only works for binary attrs (0/1). For non-binary attrs, use a Lua script instead:</p>
            <pre class="dsl-snippet">{`ON kitchen switch#action=single DO script.run "toggle_kitchen_light" ENDON
// scripts/toggle_kitchen_light.lua:
//   local cur = zhac.get_attr("0x...", "brightness")
//   zhac.set_attr("0x...", "brightness", cur == 0 and 128 or 0)`}</pre>

            <h4>Limits</h4>
            <ul class="dsl-limits">
                <li>Actions per rule: 4</li>
                <li>Device ref: 63 chars</li>
                <li>Attribute key: 31 chars</li>
                <li>Cron expression: 63 chars</li>
                <li>Event name: 31 chars</li>
                <li>Timer indices: 0–7</li>
                <li>Rule source length: 499 bytes</li>
            </ul>
        </div>
    );
}
