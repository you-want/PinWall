import { useState, useEffect, useCallback } from 'react';
import {
  fetchWidgets,
  fetchWidgetDetail,
  type MarketplaceWidget,
  type WidgetListResponse,
} from '../services/marketplaceService';
import type { WidgetManifest } from '../types';
import { useWidgetStore } from '../stores/widgetStore';

const CATEGORIES = [
  { value: '', label_zh: '全部', label_en: 'All' },
  { value: 'utility', label_zh: '工具', label_en: 'Utility' },
  { value: 'productivity', label_zh: '效率', label_en: 'Productivity' },
  { value: 'beautification', label_zh: '美化', label_en: 'Beautification' },
  { value: 'entertainment', label_zh: '娱乐', label_en: 'Entertainment' },
  { value: 'system', label_zh: '系统', label_en: 'System' },
];

interface MarketplacePanelProps {
  onClose: () => void;
  lang: string;
}

export function MarketplacePanel({ onClose, lang }: MarketplacePanelProps) {
  const [widgets, setWidgets] = useState<MarketplaceWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedWidget, setSelectedWidget] =
    useState<MarketplaceWidget | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const isZh = lang === 'zh';

  const loadWidgets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: WidgetListResponse = await fetchWidgets({
        search: search || undefined,
        category: category || undefined,
        page,
        limit: 20,
        sortBy: 'downloads',
        order: 'DESC',
      });
      setWidgets(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      setError(err.message || 'Failed to load widgets');
    } finally {
      setLoading(false);
    }
  }, [search, category, page]);

  useEffect(() => {
    loadWidgets();
  }, [loadWidgets]);

  const handleInstall = async (widget: MarketplaceWidget) => {
    setInstalling(widget.id);
    try {
      // In production, this would download the .pwx file and install it
      // For now, show a message that marketplace install requires the backend
      const detail = await fetchWidgetDetail(widget.id);
      if (detail.manifest) {
        // If we have the manifest, we can install directly
        useWidgetStore.getState().installWidget(detail.manifest as WidgetManifest);
      }
    } catch (err: any) {
      console.error('Install failed:', err);
    } finally {
      setInstalling(null);
    }
  };

  const handleViewDetail = async (widget: MarketplaceWidget) => {
    try {
      const detail = await fetchWidgetDetail(widget.id);
      setSelectedWidget(detail);
    } catch {
      setSelectedWidget(widget);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[680px] max-h-[80vh] bg-[#1e1e2e] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {isZh ? '🧩 小组件市场' : '🧩 Widget Marketplace'}
          </h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Search & Filters */}
        <div className="px-6 py-3 flex gap-3 border-b border-white/10">
          <input
            type="text"
            placeholder={isZh ? '搜索小组件...' : 'Search widgets...'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-500/50 transition-colors"
          />
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white outline-none cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value} className="bg-[#1e1e2e]">
                {isZh ? cat.label_zh : cat.label_en}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-12 text-white/40">
              <div className="text-2xl mb-2">⏳</div>
              <div className="text-sm">
                {isZh ? '加载中...' : 'Loading...'}
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-white/40">
              <div className="text-2xl mb-2">😕</div>
              <div className="text-sm mb-3">{error}</div>
              <button
                onClick={loadWidgets}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-white/70 transition-colors"
              >
                {isZh ? '重试' : 'Retry'}
              </button>
            </div>
          ) : selectedWidget ? (
            <WidgetDetail
              widget={selectedWidget}
              isZh={isZh}
              installing={installing === selectedWidget.id}
              onInstall={() => handleInstall(selectedWidget)}
              onBack={() => setSelectedWidget(null)}
            />
          ) : widgets.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <div className="text-2xl mb-2">📦</div>
              <div className="text-sm">
                {isZh ? '暂无可用小组件' : 'No widgets available'}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {widgets.map((widget) => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  isZh={isZh}
                  installing={installing === widget.id}
                  onView={() => handleViewDetail(widget)}
                  onInstall={() => handleInstall(widget)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!selectedWidget && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-6 py-3 border-t border-white/10">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded text-sm bg-white/5 text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              ‹
            </button>
            <span className="text-xs text-white/40">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded text-sm bg-white/5 text-white/60 disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  isZh,
  installing,
  onView,
  onInstall,
}: {
  widget: MarketplaceWidget;
  isZh: boolean;
  installing: boolean;
  onView: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/8 hover:border-white/15 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-lg flex-shrink-0">
          {widget.iconUrl ? (
            <img
              src={widget.iconUrl}
              alt=""
              className="w-full h-full rounded-lg object-cover"
            />
          ) : (
            '🧩'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white truncate">
              {widget.name}
            </span>
            {widget.widgetType === 'official' && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/30 text-indigo-300 flex-shrink-0">
                {isZh ? '官方' : 'Official'}
              </span>
            )}
          </div>
          <div className="text-xs text-white/40 mt-0.5 line-clamp-2">
            {widget.description}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-white/30">
            <span>⬇ {widget.downloads}</span>
            {widget.rating > 0 && <span>⭐ {widget.rating.toFixed(1)}</span>}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onView}
          className="flex-1 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-white/60 transition-colors"
        >
          {isZh ? '详情' : 'Details'}
        </button>
        <button
          onClick={onInstall}
          disabled={installing}
          className="flex-1 py-1.5 rounded-lg text-xs bg-indigo-500/80 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
        >
          {installing
            ? isZh
              ? '安装中...'
              : 'Installing...'
            : isZh
              ? '安装'
              : 'Install'}
        </button>
      </div>
    </div>
  );
}

function WidgetDetail({
  widget,
  isZh,
  installing,
  onInstall,
  onBack,
}: {
  widget: MarketplaceWidget;
  isZh: boolean;
  installing: boolean;
  onInstall: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="text-xs text-white/50 hover:text-white/80 mb-4 transition-colors"
      >
        ← {isZh ? '返回列表' : 'Back to list'}
      </button>

      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-3xl flex-shrink-0">
          {widget.iconUrl ? (
            <img
              src={widget.iconUrl}
              alt=""
              className="w-full h-full rounded-xl object-cover"
            />
          ) : (
            '🧩'
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            {widget.name}
            {widget.widgetType === 'official' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300">
                {isZh ? '官方' : 'Official'}
              </span>
            )}
          </h3>
          <div className="text-sm text-white/50 mt-1">
            {isZh ? '作者' : 'By'} {widget.author}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
            <span>⬇ {widget.downloads}</span>
            {widget.rating > 0 && (
              <span>
                ⭐ {widget.rating.toFixed(1)} ({widget.ratingCount})
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-white/60 mb-4 leading-relaxed">
        {widget.description}
      </p>

      {widget.versions?.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wider">
            {isZh ? '版本历史' : 'Version History'}
          </h4>
          <div className="space-y-2">
            {widget.versions.slice(0, 5).map((ver) => (
              <div
                key={ver.id}
                className="flex items-center justify-between text-xs text-white/40 bg-white/5 rounded-lg px-3 py-2"
              >
                <span className="font-mono">v{ver.version}</span>
                <span>{new Date(ver.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {widget.manifest?.permissions && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wider">
            {isZh ? '权限要求' : 'Permissions'}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {widget.manifest.permissions.map((perm: string) => (
              <span
                key={perm}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/50"
              >
                {perm}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onInstall}
        disabled={installing}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50 transition-colors"
      >
        {installing
          ? isZh
            ? '安装中...'
            : 'Installing...'
          : isZh
            ? '安装此小组件'
            : 'Install Widget'}
      </button>
    </div>
  );
}
