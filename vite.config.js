// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Dev server expects the firmware (or a stub) running on localhost:8080.
// Build output is single-chunk so SPIFFS serves it with minimal round-trips.
export default defineConfig({
    plugins: [preact()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            output: {
                // Lump all CodeMirror packages + our editor glue into a
                // single lazy chunk. Rollup's default splits @codemirror/*
                // into ~8 separate files; lazy-loading them in parallel
                // blew past the ESP-IDF httpd socket pool on mobile
                // browsers (errno 23 ENFILE on /assets/*.js). One fat
                // chunk = one HTTP round-trip on first editor open.
                manualChunks(id) {
                    if (id.includes("node_modules/@codemirror") ||
                        id.includes("node_modules/codemirror") ||
                        id.includes("node_modules/@lezer") ||
                        id.includes("/src/editor/")) {
                        return "cm-editor";
                    }
                    return undefined;
                },
            },
        },
    },
    server: {
        proxy: {
            "/ws": { target: "ws://localhost:8080", ws: true },
        },
    },
});
