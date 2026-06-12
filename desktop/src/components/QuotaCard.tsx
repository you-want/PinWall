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

  const getBarColorClass = (percent: number): string => {
    if (percent >= 90) return "bg-red-500/85";
    if (percent >= 70) return "bg-orange-400/85";
    return "bg-green-500/85";
  };

  const lastUpdate = results.length > 0
    ? new Date(results[0].lastUpdated).toLocaleTimeString()
    : "—";

  const errorCount = results.filter((r) => r.error).length;

  return (
    <div
      className={`fixed top-4 right-4 z-[9999] overflow-hidden rounded-2xl border border-white/15 bg-[rgba(28,28,30,0.88)] shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-[40px] transition-[width] duration-300 ease-in-out font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text',sans-serif] pointer-events-auto ${collapsed ? "w-[200px]" : "w-[280px]"}`}
      data-interactive="true"
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white/90">
            {t.quota_title}
          </span>
          {loading && (
            <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          )}
        </div>
        <span className={`text-base text-white/40 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}>
          ▾
        </span>
      </div>

      {/* Collapsed summary */}
      {collapsed && (
        <div className="px-3.5 pb-2.5 text-xs text-white/50">
          {models.length} {t.quota_models_monitoring}
          {errorCount > 0 && (
            <span className="ml-1.5 text-red-500/80">
              {errorCount} {t.quota_error}
            </span>
          )}
        </div>
      )}

      {/* Expanded content */}
      {!collapsed && (
        <div className="px-3.5 pb-3">
          {results.length === 0 && !loading && (
            <div className="py-2 text-center text-xs text-white/40">
              {t.quota_no_models}
            </div>
          )}

          {results.map((result) => {
            const percent = getUsagePercent(result);
            const barColorClass = getBarColorClass(percent);
            const name = getModelName(result.modelId);

            return (
              <div key={result.modelId} className="mb-2.5 last:mb-0">
                {/* Model name row */}
                <div className="mb-1 flex items-center justify-between">
                  <span className="max-w-[160px] truncate text-xs font-medium text-white/85">
                    {name}
                  </span>
                  {result.error ? (
                    <span className="text-[10px] text-red-500/80">{t.quota_error}</span>
                  ) : (
                    <span className="text-[11px] text-white/50">
                      {t.quota_remaining}: {formatMoney(result.remaining, result.currency)}
                      {result.total !== null && (
                        <> / {formatMoney(result.total, result.currency)}</>
                      )}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {!result.error && result.total !== null && result.used !== null && (
                  <div className="h-1 rounded-sm bg-white/10">
                    <div
                      className={`h-full rounded-sm transition-[width] duration-500 ${barColorClass}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}

                {/* Used label (only when we have usage data) */}
                {!result.error && result.used !== null && (
                  <div className="mt-0.5 text-[10px] text-white/35">
                    {t.quota_used}: {formatMoney(result.used, result.currency)} ({percent.toFixed(1)}%)
                  </div>
                )}

                {/* Error message */}
                {result.error && (
                  <div className="mt-0.5 text-[10px] text-white/35">
                    {result.error}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer: last update + refresh */}
          <div className="mt-1 flex items-center justify-between border-t border-white/[0.08] pt-2">
            <span className="text-[10px] text-white/30">
              {t.quota_last_update}: {lastUpdate}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              disabled={loading}
              className="border-none bg-transparent p-0.5 text-[11px] text-[rgba(10,132,255,0.9)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.quota_refresh}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
