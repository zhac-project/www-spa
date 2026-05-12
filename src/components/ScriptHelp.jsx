// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Inline Lua API reference shown inside the Scripts modal "Help" tab. Mirrors
// the most-used surface of docs/LUA_API.md so users don't need to open the
// full file. The full reference stays the source of truth.

export function ScriptHelp() {
    return (
        <div class="script-help">
            <p class="field-hint">
                Brief reference. Full doc: <code>docs/LUA_API.md</code>.
            </p>

            <h4>Lifecycle</h4>
            <ul>
                <li>Scripts live at <code>/scripts/&lt;name&gt;.lua</code>. Names ≤ 24 chars, <code>[a-z0-9_-]</code>, starts with a letter.</li>
                <li>Scripts run on <code>TaskLua</code> (single coroutine scheduler). Cooperative — use <code>zhac.sleep</code> to yield.</li>
                <li>The script runs through once at load to register triggers, then stays idle until events fire.</li>
                <li>Source size ≤ 4 KB.</li>
            </ul>

            <h4>Triggers (<code>zhac.on_*</code>)</h4>
            <pre class="dsl-snippet">{`zhac.on_attr_change(ieee_hex, key, fn)  -- fn(ieee, key, value)
zhac.on_cron("<expr>", fn)              -- sec min hour mday mon wday
zhac.on_mqtt("<topic>", fn)             -- fn(topic, payload)
zhac.on_boot(fn)                        -- once at boot
zhac.on_zcl_raw(fn)                     -- fn({ieee,nwk,ep,cluster,command,len,hex})`}</pre>
            <p class="field-hint">
                From a rule action <code>script.run "&lt;name&gt;"</code> passes an <code>ev</code> table to top-level code:
                <code>{" {value, key, ieee, cluster, attr_id, val_type, int_val, str_val}"}</code>.
            </p>

            <h4>API (<code>zhac.*</code>)</h4>
            <pre class="dsl-snippet">{`zhac.log([level,] msg)                  -- level "I"/"W"/"E"; default INFO
zhac.millis()                    → int  -- monotonic ms since boot
zhac.sleep(ms)                          -- coroutine yield (must be in coroutine)
zhac.set_attr(ieee_hex, key, value)  → bool
zhac.get_attr(ieee_hex, key)    → int|string|bool|nil
zhac.publish(topic, payload [, qos [, retain]])
zhac.event(name)                        -- fires ON Event#<name> rules
zhac.telegram_settoken(token)           -- persist bot token on S3.
zhac.telegram_setchat(chat_id_str)     -- persist default chat id (string).
zhac.telegram_send(text [, chat [, parse_mode]]) -- async send; returns bool.`}</pre>

            <h4>Examples</h4>
            <p><b>Toggle a light from a button rule</b></p>
            <pre class="dsl-snippet">{`-- scripts/toggle_kitchen_light.lua
local cur = zhac.get_attr("0x00158D000A000003", "state")
zhac.set_attr("0x00158D000A000003", "state", not cur)`}</pre>

            <p><b>Cron: lights off at 22:00</b></p>
            <pre class="dsl-snippet">{`zhac.on_cron("0 0 22 * * *", function()
    zhac.set_attr("0x00158D...A000003", "state", false)
    zhac.log("I", "good night")
end)`}</pre>

            <p><b>Hot temperature → MQTT alert</b></p>
            <pre class="dsl-snippet">{`zhac.on_attr_change("0x00158D...A000004", "temperature", function(ieee, key, v)
    if v > 2500 then zhac.publish("home/alert", "hot") end
end)`}</pre>

            <p><b>Boot logger</b></p>
            <pre class="dsl-snippet">{`zhac.on_boot(function()
    zhac.log("I", "scripts up at " .. zhac.millis() .. "ms")
end)`}</pre>

            <p><b>Telegram alert when temperature crosses threshold</b></p>
            <pre class="dsl-snippet">{`zhac.telegram_settoken("1234567890:AAH...")
zhac.telegram_setchat("1234567890")
zhac.on_attr_change("0x00158D...", "temperature", function(_, _, v)
    if v > 2500 then zhac.telegram_send("hot: " .. v) end
end)`}</pre>

            <h4>Limits / gotchas</h4>
            <ul>
                <li>Source ≤ 4 KB</li>
                <li><code>zhac.sleep</code> only inside a coroutine</li>
                <li>No <code>os</code>, <code>io</code>, <code>package</code> (sandbox). <code>string</code>, <code>table</code>, <code>math</code> available.</li>
                <li><code>script.run</code> returns immediately; queue-full requests are dropped with a warning.</li>
            </ul>
        </div>
    );
}
