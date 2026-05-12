// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Top-level app shell: header nav + active-page switch + toast host.
// Routing is signal-based (no router library) — see stores/ui.js.
import { useState } from "preact/hooks";
import { ui, navigate } from "./stores/ui.js";
import { wireBootstrap } from "./ws/events.js";
import { ToastHost } from "./components/Toast.jsx";

import { InfoPage }         from "./pages/Info.jsx";
import { DevicesPage }      from "./pages/Devices.jsx";
import { DeviceDetailPage } from "./pages/DeviceDetail.jsx";
import { GroupsPage }       from "./pages/Groups.jsx";
import { RulesPage }        from "./pages/Rules.jsx";
import { ScriptsPage }      from "./pages/Scripts.jsx";
import { LogsPage }         from "./pages/Logs.jsx";
import { DiagPage }         from "./pages/Diag.jsx";
import { SettingsPage }     from "./pages/Settings.jsx";

// Kick off WS bootstrap once, as soon as the app mounts.
wireBootstrap();

const NAV = [
    { id: "info",     label: "Info" },
    { id: "devices",  label: "Devices" },
    { id: "groups",   label: "Groups" },
    { id: "rules",    label: "Rules" },
    { id: "scripts",  label: "Scripts" },
    { id: "log",      label: "Log" },
    { id: "diag",     label: "Diag" },
    { id: "settings", label: "Settings" },
];

export function App() {
    const [menuOpen, setMenuOpen] = useState(false);
    const page = ui.value.activePage;
    const connected = ui.value.connected;

    return (
        <>
            <header>
                <span class="brand">ZHAC</span>
                <button class="nav-toggle" aria-label="Menu"
                        onClick={() => setMenuOpen(o => !o)}>☰</button>
                <nav class={menuOpen ? "open" : ""}>
                    {NAV.map(n => (
                        <a key={n.id} href="#"
                           class={page === n.id || (n.id === "devices" && page === "device") ? "active" : ""}
                           onClick={(e) => {
                               e.preventDefault();
                               setMenuOpen(false);
                               navigate(n.id);
                           }}>
                            {n.label}
                        </a>
                    ))}
                </nav>
                <span class={"ws-dot " + (connected ? "connected" : "disconnected")}
                      title={connected ? "WebSocket connected" : "WebSocket disconnected"} />
            </header>
            <main>
                {page === "info"     && <InfoPage />}
                {page === "devices"  && <DevicesPage />}
                {page === "device"   && <DeviceDetailPage />}
                {page === "groups"   && <GroupsPage />}
                {page === "rules"    && <RulesPage />}
                {page === "scripts"  && <ScriptsPage />}
                {page === "log"      && <LogsPage />}
                {page === "diag"     && <DiagPage />}
                {page === "settings" && <SettingsPage />}
            </main>
            <ToastHost />
        </>
    );
}
