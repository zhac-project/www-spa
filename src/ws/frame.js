// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// The hub's WebSocket server closes the session on a text frame over this many bytes
// (ws_server.cpp WS_RX_MAX), and with it every request still waiting for an answer.
export const WS_FRAME_MAX = 8 * 1024;

export function frameTooLarge(text) {
    return new TextEncoder().encode(text).length > WS_FRAME_MAX;
}
