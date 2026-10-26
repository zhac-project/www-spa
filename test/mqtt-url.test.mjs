// node --test test/  -- the MQTT card's checks (review 2026-10-24 HS-13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleartextCredentials, isTlsUrl, normalizePin, brokerPatch } from "../src/mqtt_url.js";

test("cleartextCredentials: a user name or password over mqtt:// or ws://", () => {
    assert.equal(cleartextCredentials("mqtt://user:pass@192.168.1.10:1883"), true);
    assert.equal(cleartextCredentials("ws://user@broker/mqtt"), true);
    assert.equal(cleartextCredentials("mqtts://user:pass@broker:8883"), false);
    assert.equal(cleartextCredentials("wss://user:pass@broker"), false);
    assert.equal(cleartextCredentials("mqtt://broker:1883"), false);
    assert.equal(cleartextCredentials("ws://broker/path@x"), false, "an @ in the path");
    assert.equal(cleartextCredentials(""), false);
    assert.equal(cleartextCredentials(undefined), false);
});

test("isTlsUrl", () => {
    assert.equal(isTlsUrl("mqtts://broker:8883"), true);
    assert.equal(isTlsUrl("wss://broker/mqtt"), true);
    assert.equal(isTlsUrl("mqtt://broker"), false);
});

test("normalizePin: as openssl prints it, or bare hex; null when it is not one", () => {
    const hex = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const colons = hex.toUpperCase().match(/../g).join(":");
    assert.equal(normalizePin(colons), hex);
    assert.equal(normalizePin(`  sha256 Fingerprint=${colons}\n`), hex, "openssl's whole line");
    assert.equal(normalizePin(hex), hex);
    assert.equal(normalizePin(""), "", "empty removes the pin");
    assert.equal(normalizePin(hex.slice(1)), null, "63 digits");
    assert.equal(normalizePin(hex + "0"), null, "65 digits");
    assert.equal(normalizePin("g" + hex.slice(1)), null, "not hex");
});

// The status reports the broker URL without its user name and password. Saving the card must not send
// that stripped URL back: it would replace the stored one and lose the credentials.
test("brokerPatch: the URL goes only when it was changed", () => {
    const d = { mqtt_broker: "mqtt://broker:1883", mqtt_tls_pin: "" };
    assert.deepEqual(brokerPatch(d, "mqtt://broker:1883", "zhac", ""), { mqtt_root_topic: "zhac" });
    assert.deepEqual(brokerPatch(d, "mqtt://u:p@broker:1883", "zhac", ""),
        { broker_url: "mqtt://u:p@broker:1883", mqtt_root_topic: "zhac" });
    const hex = "ab".repeat(32);
    assert.deepEqual(brokerPatch(d, "mqtt://broker:1883", "zhac", hex), { mqtt_root_topic: "zhac", mqtt_tls_pin: hex });
    assert.deepEqual(brokerPatch({ ...d, mqtt_tls_pin: hex }, "mqtt://broker:1883", "zhac", hex), { mqtt_root_topic: "zhac" },
        "an unchanged pin is not sent");
    assert.deepEqual(brokerPatch({ ...d, mqtt_tls_pin: hex }, "mqtt://broker:1883", "zhac", ""),
        { mqtt_root_topic: "zhac", mqtt_tls_pin: "" }, "clearing it is sent");
    assert.deepEqual(brokerPatch({ mqtt_broker: "mqtt://b" }, "mqtt://b", "zhac", "ab"), { mqtt_root_topic: "zhac" },
        "a hub that does not report a pin never gets one");
});
