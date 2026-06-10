import { useState, useEffect, useCallback, useRef } from "react";
import type { QuotaMonitorConfig, QuotaResult } from "../types";
import { fetchAllQuotas } from "../services/quotaService";

/**
 * Hook to poll quota information for configured models.
 * Returns results, loading state, and a manual refresh function.
 */
export function useQuotaMonitor(config: QuotaMonitorConfig | undefined) {
  const [results, setResults] = useState<QuotaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!config?.enabled || config.models.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchAllQuotas(config.models);
      if (mountedRef.current) {
        setResults(data);
      }
    } catch (err) {
      console.error("[useQuotaMonitor] Failed to fetch quotas:", err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [config?.enabled, config?.models]);

  // Initial fetch + interval polling
  useEffect(() => {
    mountedRef.current = true;

    if (!config?.enabled || config.models.length === 0) {
      setResults([]);
      return;
    }

    // Fetch immediately
    refresh();

    // Set up polling interval
    const intervalMs = (config.refreshInterval || 5) * 60 * 1000;
    intervalRef.current = setInterval(refresh, intervalMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [config?.enabled, config?.refreshInterval, config?.models.length, refresh]);

  return { results, loading, refresh };
}
