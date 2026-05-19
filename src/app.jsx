// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Top-level app shell: header nav + active-page switch + toast host.
// Routing is hash-based (no router library) — see stores/ui.js for the
// `#/page` ↔ signal sync. ErrorBoundary catches render-time throws so a
// single bad signal subscriber doesn't white-screen the whole SPA.
import { Component } from "preact";
import { useState } from "preact/hooks";
import { ui, navigate, hrefFor } from "./stores/ui.js";
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
import { OtaPage }          from "./pages/Ota.jsx";
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
    { id: "ota",      label: "OTA" },
    { id: "settings", label: "Settings" },
];

// Preact error boundary — a single render-time throw used to white-screen
// the whole SPA (no recovery short of reload, which is brutal on an
// embedded TV-remote scenario). With this, malformed server pushes / bad
// signal subscribers surface as a recoverable error pane and a Retry.
class ErrorBoundary extends Component {
    state = { err: null };
    static getDerivedStateFromError(err) { return { err }; }
    componentDidCatch(err, info) {
        // Best-effort: don't depend on console availability in production.
        try { console.error("UI error boundary:", err, info); } catch (_) {}
    }
    render() {
        if (this.state.err) {
            return (
                <div class="page">
                    <h2>Something went wrong</h2>
                    <p class="error-text">
                        {this.state.err?.message || String(this.state.err)}
                    </p>
                    <button onClick={() => this.setState({ err: null })}>
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

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
                        <a key={n.id} href={hrefFor(n.id)}
                           class={page === n.id || (n.id === "devices" && page === "device") ? "active" : ""}
                           onClick={(e) => {
                               // Let middle-click / cmd-click open in a new
                               // tab; intercept only the plain left-click so
                               // navigate() can update the hash without a
                               // browser-level page reload.
                               if (e.defaultPrevented || e.button !== 0 ||
                                   e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
                <ErrorBoundary>
                    {page === "info"     && <InfoPage />}
                    {page === "devices"  && <DevicesPage />}
                    {page === "device"   && <DeviceDetailPage />}
                    {page === "groups"   && <GroupsPage />}
                    {page === "rules"    && <RulesPage />}
                    {page === "scripts"  && <ScriptsPage />}
                    {page === "log"      && <LogsPage />}
                    {page === "diag"     && <DiagPage />}
                    {page === "ota"      && <OtaPage />}
                    {page === "settings" && <SettingsPage />}
                </ErrorBoundary>
            </main>
            <ToastHost />
        </>
    );
}
