// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Starting points for the Rules and Scripts editors, from the automation
// cookbook (zhac-docs AUTOMATION_EXAMPLES.md). CAPITALISED words are
// placeholders for your own devices: device names in rules (single words —
// rename devices like hall_light), IEEE addresses in Lua (Info tab).
// Every rule template is checked by the real DSL parser (see CHANGELOG).

export const RULE_TEMPLATES = [
    { name: "Light on with motion",
      dsl: "ON MOTION_SENSOR#occupancy=1 DO zigbee.set LIGHT state 1 ENDON" },
    { name: "Light follows motion (on and off)",
      dsl: "ON MOTION_SENSOR#occupancy DO zigbee.set LIGHT state %value% ENDON" },
    { name: "Lamp on when the door opens",
      dsl: "ON DOOR_SENSOR#contact=0 DO zigbee.set LAMP state 1 ENDON" },
    { name: "Button toggles a light",
      dsl: "ON BUTTON#action=\"single\" DO zigbee.toggle LIGHT state ENDON" },
    { name: "Lights off at 22:30",
      dsl: "ON Time#Cron=0 30 22 * * * DO zigbee.set LIGHT state 0 ENDON" },
    { name: "Water leak: close the valve and alert",
      dsl: "ON LEAK_SENSOR#water_leak=1 DO zigbee.set WATER_VALVE state 0 ; publish home/alert water_leak ENDON" },
    { name: "Too hot: MQTT alert above 28 °C",
      dsl: "ON TEMP_SENSOR#temperature>2800 DO publish home/alert too_hot ENDON" },
];

export const SCRIPT_TEMPLATES = [
    { name: "motion_light",
      title: "Motion light that turns off after 30 s",
      src: `-- The light stays on while there is motion and goes off 30 s after the last.
local MOTION = "0xMOTION_SENSOR_IEEE"   -- Devices -> the sensor -> Info -> IEEE
local LIGHT  = "0xLIGHT_IEEE"
local gen    = 0                        -- bumped on every motion

zhac.on_attr_change(MOTION, "occupancy", function(_, _, occupied)
    if occupied then
        gen = gen + 1
        local mine = gen
        zhac.set_attr(LIGHT, "state", true)
        zhac.sleep(30000)                -- yields; other events keep running
        if mine == gen then              -- no newer motion arrived
            zhac.set_attr(LIGHT, "state", false)
        end
    end
end)
` },
    { name: "heating_schedule",
      title: "Radiator valve: warm by day, cool at night",
      src: `-- Setpoints at fixed times. Cron is 6 fields: sec min hour day month weekday.
local VALVE = "0xVALVE_IEEE"            -- Devices -> the valve -> Info -> IEEE

zhac.on_cron("0 0 6 * * *", function()
    zhac.set_attr(VALVE, "current_heating_setpoint", 21)
end)

zhac.on_cron("0 30 22 * * *", function()
    zhac.set_attr(VALVE, "current_heating_setpoint", 17)
end)
` },
    { name: "leak_alarm",
      title: "Leak alarm that ignores 5 s splashes",
      src: `-- Alert only if the sensor is still wet after 5 s.
local LEAK  = "0xLEAK_SENSOR_IEEE"
local SIREN = "0xSIREN_IEEE"

zhac.on_attr_change(LEAK, "water_leak", function(_, _, wet)
    if wet then
        zhac.sleep(5000)
        if zhac.get_attr(LEAK, "water_leak") then
            zhac.publish("home/alert/leak", "confirmed", 1, true)   -- qos 1, retained
            zhac.set_attr(SIREN, "state", true)
        end
    end
end)
` },
    { name: "power_watchdog",
      title: "Warn when a plug draws more than 2 kW",
      src: `-- Float values reach Lua x100: 200000 means 2000.00 W.
local PLUG = "0xPLUG_IEEE"

zhac.on_attr_change(PLUG, "power", function(_, _, value)
    if value > 200000 then
        zhac.publish("home/alert", "plug overload")
    end
end)
` },
];
