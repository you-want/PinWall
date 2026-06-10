import type { QuotaMonitorModel, QuotaResult } from "../types";

/**
 * Detect provider type from the API endpoint URL.
 */
function detectProvider(base: string): "openai" | "deepseek" | "unknown" {
  const lower = base.toLowerCase();
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("openai")) return "openai";
  return "unknown";
}

/**
 * Fetch quota for DeepSeek: GET /user/balance
 * Response: { is_available, balance_infos: [{ currency, total_balance, granted_balance, topped_up_balance }] }
 */
async function fetchDeepSeekQuota(
  base: string,
  headers: Record<string, string>,
  modelId: string,
): Promise<QuotaResult | null> {
  try {
    const res = await fetch(`${base}/user/balance`, { headers });
    if (!res.ok) return null;

    const data = await res.json();
    const info = data?.balance_infos?.[0];
    if (!info) return null;

    const totalBalance = parseFloat(info.total_balance);
    const grantedBalance = parseFloat(info.granted_balance || "0");
    const toppedUpBalance = parseFloat(info.topped_up_balance || "0");

    if (isNaN(totalBalance)) return null;

    // DeepSeek balance API returns current remaining balance, not usage.
    // total_balance = current available balance (remaining)
    // We show it as: total = topped_up + granted (original), remaining = total_balance (current)
    const originalTotal = toppedUpBalance + grantedBalance;

    return {
      modelId,
      total: originalTotal > 0 ? originalTotal : totalBalance,
      used: originalTotal > 0 ? Math.max(0, originalTotal - totalBalance) : null,
      remaining: totalBalance,
      currency: info.currency || "CNY",
      lastUpdated: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch quota for OpenAI-compatible APIs:
 *   GET /dashboard/billing/subscription → hard_limit_usd
 *   GET /dashboard/billing/usage → total_usage (cents)
 */
async function fetchOpenAIQuota(
  base: string,
  headers: Record<string, string>,
  modelId: string,
): Promise<QuotaResult | null> {
  let total: number | null = null;
  let used: number | null = null;
  let currency = "USD";

  // 1. Subscription endpoint
  try {
    const subRes = await fetch(`${base}/dashboard/billing/subscription`, { headers });
    if (subRes.ok) {
      const subData = await subRes.json();
      if (typeof subData.hard_limit_usd === "number") total = subData.hard_limit_usd;
      else if (typeof subData.soft_limit_usd === "number") total = subData.soft_limit_usd;
      if (subData.currency) currency = subData.currency;
    }
  } catch { /* not available */ }

  // 2. Usage endpoint
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const usageRes = await fetch(
      `${base}/dashboard/billing/usage?start_date=${formatYYYYMMDD(start)}&end_date=${formatYYYYMMDD(now)}`,
      { headers },
    );
    if (usageRes.ok) {
      const usageData = await usageRes.json();
      if (typeof usageData.total_usage === "number") {
        used = usageData.total_usage / 100; // cents → dollars
      }
    }
  } catch { /* not available */ }

  // 3. Fallback: /usage endpoint
  if (total === null && used === null) {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const altRes = await fetch(
        `${base}/usage?start_date=${formatYYYYMMDD(start)}&end_date=${formatYYYYMMDD(now)}`,
        { headers },
      );
      if (altRes.ok) {
        const altData = await altRes.json();
        if (typeof altData.total_usage === "number") used = altData.total_usage / 100;
        if (typeof altData.hard_limit_usd === "number") total = altData.hard_limit_usd;
      }
    } catch { /* not available */ }
  }

  if (total === null && used === null) return null;

  const remaining = total !== null && used !== null ? Math.max(0, total - used) : null;

  return {
    modelId,
    total,
    used,
    remaining,
    currency,
    lastUpdated: Date.now(),
  };
}

/**
 * Fetch quota information for a single model.
 * Automatically detects provider and uses the appropriate API.
 */
export async function fetchQuota(model: QuotaMonitorModel): Promise<QuotaResult> {
  const base = model.apiEndpoint.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
  };

  const provider = detectProvider(base);

  // Try provider-specific strategy first, then fallback
  let result: QuotaResult | null = null;

  if (provider === "deepseek") {
    result = await fetchDeepSeekQuota(base, headers, model.id);
    if (!result) {
      // DeepSeek also supports OpenAI-style billing in some cases
      result = await fetchOpenAIQuota(base, headers, model.id);
    }
  } else {
    // OpenAI, DashScope, and other OpenAI-compatible providers
    result = await fetchOpenAIQuota(base, headers, model.id);
  }

  if (result) return result;

  return {
    modelId: model.id,
    total: null,
    used: null,
    remaining: null,
    currency: "USD",
    lastUpdated: Date.now(),
    error: "该提供商不支持额度查询 API",
  };
}

/**
 * Fetch quota for all configured models in parallel.
 */
export async function fetchAllQuotas(models: QuotaMonitorModel[]): Promise<QuotaResult[]> {
  return Promise.all(models.map(fetchQuota));
}

function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
