// SPDX-FileCopyrightText: 2025-2026 Evgenij Cjura and project contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Top-level app shell: header nav + active-page switch + toast host.
// Routing is hash-based (no router library) — see stores/ui.js for the
// `#/page` ↔ signal sync. ErrorBoundary catches render-time throws so a
// single bad signal subscriber doesn't white-screen the whole SPA.
import { Component } from "preact";
import { useState, useEffect } from "preact/hooks";
import { ui, navigate, hrefFor } from "./stores/ui.js";
import { wireBootstrap } from "./ws/events.js";
import { ToastHost } from "./components/Toast.jsx";
import { Spinner } from "./components/Spinner.jsx";
import { Login } from "./pages/Login.jsx";
import { authState, probeAuth } from "./stores/auth.js";

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

// WS bootstrap must not start until the auth gate passes — an unauthenticated
// socket just loops connect → reject. Fire it exactly once, when auth first
// resolves OK (see the App gate below).
let booted = false;
function ensureBootstrap() { if (!booted) { booted = true; wireBootstrap(); } }

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

// Top-level auth gate. Probes the device's auth state once on mount and renders
// the sign-in gate (rather than a blank shell) when a token is required and
// missing. The WebSocket is started only after we pass, so the login screen
// isn't fighting a reconnect loop.
export function App() {
    const st = authState.value;
    useEffect(() => { probeAuth(); }, []);
    useEffect(() => { if (st === "ok") ensureBootstrap(); }, [st]);

    if (st === "checking") {
        return <Splash><Spinner label="Connecting to controller…" /></Splash>;
    }
    if (st === "offline") {
        return (
            <Splash>
                <p class="error-text">Can’t reach the controller.</p>
                <button class="primary" onClick={() => probeAuth()}>Retry</button>
            </Splash>
        );
    }
    if (st === "needsAuth") return <Login />;
    return <AppShell />;
}

// Centered brand splash for the pre-app states (connecting / offline).
function Splash({ children }) {
    return (
        <div class="splash">
            <span class="brand splash-brand">ZHAC</span>
            <div class="splash-body">{children}</div>
        </div>
    );
}

function AppShell() {
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
