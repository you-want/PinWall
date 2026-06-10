import { useState } from "react";
import { useI18n } from "../i18n";
import type { QuotaResult, QuotaMonitorModel } from "../types";

interface QuotaCardProps {
  results: QuotaResult[];
  models: QuotaMonitorModel[];
  loading: boolean;
  onRefresh: () => void;
}

export function QuotaCard({ results, models, loading, onRefresh }: QuotaCardProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const getModelName = (modelId: string) => {
    return models.find((m) => m.id === modelId)?.name ?? modelId;
  };

  const formatMoney = (val: number | null, currency: string) => {
    if (val === null) return "—";
    const symbol = currency === "CNY" ? "¥" : "$";
    return `${symbol}${val.toFixed(2)}`;
  };

  const getUsagePercent = (result: QuotaResult): number => {
    if (result.total === null || result.used === null || result.total === 0) return 0;
    return Math.min(100, (result.used / result.total) * 100);
  };

  const getBarColor = (percent: number): string => {
    if (percent >= 90) return "rgba(255,59,48,0.85)";
    if (percent >= 70) return "rgba(255,159,10,0.85)";
    return "rgba(48,209,88,0.85)";
  };

  const lastUpdate = results.length > 0
    ? new Date(results[0].lastUpdated).toLocaleTimeString()
    : "—";

  const errorCount = results.filter((r) => r.error).length;

  return (
    <div
      className="quota-card"
      data-interactive="true"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        width: collapsed ? 200 : 280,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(28,28,30,0.88)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        overflow: "hidden",
        pointerEvents: "auto",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
        zIndex: 9999,
        transition: "width 0.3s ease",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>
            {t.quota_title}
          </span>
          {loading && (
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                border: "2px solid rgba(255,255,255,0.2)",
                borderTopColor: "rgba(255,255,255,0.8)",
                borderRadius: "50%",
                animation: "spin 0.6s linear infinite",
              }}
            />
          )}
        </div>
        <span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          ▾
        </span>
      </div>

      {/* Collapsed summary */}
      {collapsed && (
        <div style={{ padding: "0 14px 10px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {models.length} {t.quota_models_monitoring}
          {errorCount > 0 && (
            <span style={{ color: "rgba(255,59,48,0.8)", marginLeft: 6 }}>
              {errorCount} {t.quota_error}
            </span>
          )}
        </div>
      )}

      {/* Expanded content */}
      {!collapsed && (
        <div style={{ padding: "0 14px 12px" }}>
          {results.length === 0 && !loading && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "8px 0" }}>
              {t.quota_no_models}
            </div>
          )}

          {results.map((result) => {
            const percent = getUsagePercent(result);
            const barColor = getBarColor(percent);
            const name = getModelName(result.modelId);

            return (
              <div key={result.modelId} style={{ marginBottom: 10 }}>
                {/* Model name row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                    {name}
                  </span>
                  {result.error ? (
                    <span style={{ fontSize: 10, color: "rgba(255,59,48,0.8)" }}>{t.quota_error}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {t.quota_remaining}: {formatMoney(result.remaining, result.currency)}
                      {result.total !== null && (
                        <> / {formatMoney(result.total, result.currency)}</>
                      )}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {!result.error && result.total !== null && result.used !== null && (
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${percent}%`,
                        borderRadius: 2,
                        background: barColor,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                )}

                {/* Used label (only when we have usage data) */}
                {!result.error && result.used !== null && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {t.quota_used}: {formatMoney(result.used, result.currency)} ({percent.toFixed(1)}%)
                  </div>
                )}

                {/* Error message */}
                {result.error && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {result.error}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer: last update + refresh */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 8,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              {t.quota_last_update}: {lastUpdate}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              disabled={loading}
              style={{
                background: "none",
                border: "none",
                color: "rgba(10,132,255,0.9)",
                fontSize: 11,
                cursor: loading ? "not-allowed" : "pointer",
                padding: "2px 4px",
                opacity: loading ? 0.5 : 1,
              }}
            >
              {t.quota_refresh}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
