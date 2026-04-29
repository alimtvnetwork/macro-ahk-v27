/**
 * Auth Health Panel — Displays auth strategy waterfall results
 *
 * Shows which auth strategies succeeded/failed with per-strategy
 * timing bars, overall status, and one-click diagnostics copy.
 */

import { useState, useCallback } from "react";
import { getPlatform } from "../../platform";
import type { AuthHealthResponse } from "../../background/auth-health-handler";

const STATUS_ICONS: Record<string, string> = {
    authenticated: "🟢",
    degraded: "🟡",
    unauthenticated: "🔴",
};

const STATUS_LABELS: Record<string, string> = {
    authenticated: "Authenticated",
    degraded: "Degraded",
    unauthenticated: "Unauthenticated",
};

// eslint-disable-next-line max-lines-per-function
export function AuthHealthPanel() {
    const platform = getPlatform();
    const [data, setData] = useState<AuthHealthResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [copyLabel, setCopyLabel] = useState("📋 Copy");

    const runCheck = useCallback(async () => {
        setLoading(true);
        try {
            const res = await platform.sendMessage<AuthHealthResponse>({ type: "GET_AUTH_HEALTH" });
            setData(res);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [platform]);

    const handleCopy = useCallback(async () => {
        if (!data) return;
        const lines = [
            "=== Auth Health Report ===",
            `Status: ${data.status}`,
            `Resolved via: ${data.resolvedVia ?? "none"}`,
            `Total: ${data.totalMs}ms`,
            `Checked: ${data.checkedAt}`,
            "",
            "── Strategies ──",
            ...data.strategies.map(s =>
                `  [Tier ${s.tier}] ${s.name.padEnd(32)} ${s.success ? "✓" : "✗"}  ${String(s.durationMs).padStart(5)}ms  ${s.detail}`
            ),
            "",
            "=== End Report ===",
        ];
        await navigator.clipboard.writeText(lines.join("\n"));
        setCopyLabel("✅ Copied!");
        setTimeout(() => setCopyLabel("📋 Copy"), 2000);
    }, [data]);

    return (
        <div className="diag-auth-health-section">
            <div className="diag-auth-health-header">
                <h3>🔐 Auth Strategy Health</h3>
                <div className="diag-auth-health-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void runCheck()}
                        disabled={loading}
                    >
                        {loading ? "⏳ Running…" : "▶ Run Check"}
                    </button>
                    {data && (
                        <button className="btn btn-secondary btn-sm" onClick={() => void handleCopy()}>
                            {copyLabel}
                        </button>
                    )}
                </div>
            </div>

            {!data && !loading && (
                <p className="diag-auth-health-hint">
                    Click "Run Check" to test all 5 auth strategies with timing.
                </p>
            )}

            {data && (
                <>
                    {/* Overall Status */}
                    <div className="diag-auth-status-bar">
                        <span className="diag-auth-status-icon">
                            {STATUS_ICONS[data.status] ?? "⚪"}
                        </span>
                        <span className="diag-auth-status-label">
                            {STATUS_LABELS[data.status] ?? data.status}
                        </span>
                        {data.resolvedVia && (
                            <span className="diag-auth-resolved-via">
                                via <strong>{data.resolvedVia}</strong>
                            </span>
                        )}
                        <span className="diag-auth-total-ms">{data.totalMs}ms total</span>
                    </div>

                    {/* Strategy Table */}
                    <table className="diag-auth-table">
                        <thead>
                            <tr>
                                <th>Tier</th>
                                <th>Strategy</th>
                                <th>Result</th>
                                <th>Time</th>
                                <th>Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.strategies.map((s) => {
                                const barWidth = data.totalMs > 0
                                    ? Math.min(100, Math.round((s.durationMs / data.totalMs) * 100))
                                    : 0;
                                return (
                                    <tr key={s.tier} className={s.success ? "diag-auth-row-ok" : "diag-auth-row-fail"}>
                                        <td className="diag-auth-tier">T{s.tier}</td>
                                        <td className="diag-auth-name">{s.name}</td>
                                        <td className={s.success ? "diag-msg-ok" : "diag-msg-fail"}>
                                            {s.success ? "✓" : "✗"}
                                        </td>
                                        <td className="diag-auth-timing">
                                            <div className="diag-auth-timing-cell">
                                                <span>{s.durationMs}ms</span>
                                                <div className="diag-auth-bar-track">
                                                    <div
                                                        className={`diag-auth-bar-fill ${s.success ? "diag-auth-bar-ok" : "diag-auth-bar-fail"}`}
                                                        style={{ width: `${barWidth}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="diag-auth-detail">{s.detail}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="diag-auth-footer">
                        Last checked: {new Date(data.checkedAt).toLocaleTimeString("en-GB", {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
