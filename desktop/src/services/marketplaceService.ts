/**
 * Marketplace API Client
 *
 * 与 PinWall Widget Marketplace 后端通信的服务层
 */

const MARKETPLACE_BASE_URL =
  import.meta.env.VITE_MARKETPLACE_URL ?? 'http://localhost:3000';

export interface MarketplaceWidget {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  widgetType: 'official' | 'community';
  status: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  iconUrl: string;
  screenshots: string[];
  manifest: Record<string, any>;
  versions: MarketplaceVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceVersion {
  id: string;
  version: string;
  packageUrl: string;
  manifest: Record<string, any>;
  changelog: string;
  downloadCount: number;
  packageSize: number;
  createdAt: string;
}

export interface MarketplaceReview {
  id: string;
  rating: number;
  comment: string;
  userName: string;
  createdAt: string;
}

export interface WidgetListResponse {
  items: MarketplaceWidget[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QueryParams {
  search?: string;
  category?: string;
  widgetType?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'ASC' | 'DESC';
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${MARKETPLACE_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Marketplace API error: ${res.status} ${res.statusText} - ${errorBody}`,
    );
  }
  return res.json();
}

/** 获取 Widget 列表 */
export async function fetchWidgets(
  params: QueryParams = {},
): Promise<WidgetListResponse> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  const query = searchParams.toString();
  return apiFetch<WidgetListResponse>(
    `/api/widgets${query ? `?${query}` : ''}`,
  );
}

/** 获取 Widget 详情 */
export async function fetchWidgetDetail(
  idOrSlug: string,
): Promise<MarketplaceWidget> {
  return apiFetch<MarketplaceWidget>(`/api/widgets/${idOrSlug}`);
}

/** 获取 Widget 版本列表 */
export async function fetchWidgetVersions(
  idOrSlug: string,
): Promise<MarketplaceVersion[]> {
  return apiFetch<MarketplaceVersion[]>(`/api/widgets/${idOrSlug}/versions`);
}

/** 获取 Widget 评价 */
export async function fetchWidgetReviews(
  idOrSlug: string,
): Promise<MarketplaceReview[]> {
  return apiFetch<MarketplaceReview[]>(`/api/widgets/${idOrSlug}/reviews`);
}

/** 下载 Widget 包（返回下载 URL） */
export async function downloadWidget(
  idOrSlug: string,
  version?: string,
): Promise<{ downloadUrl: string }> {
  const ver = version ?? 'latest';
  return apiFetch(`/api/widgets/${idOrSlug}/download/${ver}`);
}

/** 提交评价 */
export async function submitReview(
  idOrSlug: string,
  rating: number,
  comment?: string,
  userName?: string,
): Promise<MarketplaceReview> {
  return apiFetch<MarketplaceReview>(`/api/widgets/${idOrSlug}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment, userName }),
  });
}

/** 开发者登录 */
export async function developerLogin(
  email: string,
  password: string,
): Promise<{ accessToken: string; developer: { id: string; email: string; name: string } }> {
  return apiFetch('/api/developers/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/** 提交 Widget */
export async function submitWidget(
  token: string,
  data: {
    name: string;
    slug: string;
    description: string;
    category: string;
    widgetType: string;
  },
): Promise<MarketplaceWidget> {
  return apiFetch<MarketplaceWidget>('/api/widgets/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}
