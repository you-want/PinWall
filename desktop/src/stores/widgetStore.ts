import { create } from "zustand";
import { createTauriStore } from "@tauri-store/zustand";
import type { WidgetInstance, WidgetManifest, WidgetSize } from "../types";

type WidgetState = {
  widgets: WidgetInstance[];
  _zIndexCounter: number;

  /** 安装 Widget（添加新实例） */
  installWidget: (manifest: WidgetManifest) => void;
  /** 卸载 Widget */
  uninstallWidget: (id: string) => void;
  /** 启用/禁用 Widget */
  toggleWidget: (id: string, enabled: boolean) => void;
  /** 更新 Widget 位置 */
  setPosition: (id: string, x: number, y: number) => void;
  /** 更新 Widget 尺寸 */
  setSize: (id: string, size: WidgetSize) => void;
  /** 置顶 Widget */
  bringToFront: (id: string) => void;
  /** 更新 Widget 用户设置 */
  updateSettings: (id: string, settings: Record<string, any>) => void;
  /** 根据 manifest 列表同步（处理新增/删除） */
  syncWidgets: (manifests: WidgetManifest[]) => void;
};

function buildDefaultSettings(manifest: WidgetManifest): Record<string, any> {
  const settings: Record<string, any> = {};
  if (manifest.settings) {
    for (const def of manifest.settings) {
      if (def.default !== undefined) {
        settings[def.key] = def.default;
      }
    }
  }
  return settings;
}

export const useWidgetStore = create<WidgetState>((set, get) => ({
  widgets: [],
  _zIndexCounter: 50, // Widget 起始 z-index 低于卡片（卡片从 100 起）

  installWidget: (manifest) => {
    const existing = get().widgets.find((w) => w.manifest.id === manifest.id);
    if (existing) {
      set((s) => ({
        widgets: s.widgets.map((w) =>
          w.manifest.id === manifest.id
            ? { ...w, manifest, enabled: true, updatedAt: Date.now() }
            : w
        ),
      }));
      return;
    }

    const now = Date.now();
    const { _zIndexCounter } = get();
    const instance: WidgetInstance = {
      manifest,
      enabled: true,
      x: 50,
      y: 50,
      size: manifest.defaultSize,
      zIndex: _zIndexCounter + 1,
      settings: buildDefaultSettings(manifest),
      installedAt: now,
      updatedAt: now,
    };
    set((s) => ({
      widgets: [...s.widgets, instance],
      _zIndexCounter: _zIndexCounter + 1,
    }));
  },

  uninstallWidget: (id) => {
    set((s) => ({
      widgets: s.widgets.filter((w) => w.manifest.id !== id),
    }));
  },

  toggleWidget: (id, enabled) => {
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.manifest.id === id ? { ...w, enabled, updatedAt: Date.now() } : w
      ),
    }));
  },

  setPosition: (id, x, y) => {
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.manifest.id === id ? { ...w, x, y, updatedAt: Date.now() } : w
      ),
    }));
  },

  setSize: (id, size) => {
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.manifest.id === id ? { ...w, size, updatedAt: Date.now() } : w
      ),
    }));
  },

  bringToFront: (id) => {
    const { _zIndexCounter } = get();
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.manifest.id === id ? { ...w, zIndex: _zIndexCounter + 1 } : w
      ),
      _zIndexCounter: _zIndexCounter + 1,
    }));
  },

  updateSettings: (id, settings) => {
    set((s) => ({
      widgets: s.widgets.map((w) =>
        w.manifest.id === id
          ? { ...w, settings: { ...w.settings, ...settings }, updatedAt: Date.now() }
          : w
      ),
    }));
  },

  syncWidgets: (manifests) => {
    const manifestMap = new Map(manifests.map((m) => [m.id, m]));
    const currentWidgets = get().widgets;

    // 保留已存在且 manifest 仍有效的 Widget
    const kept = currentWidgets
      .filter((w) => manifestMap.has(w.manifest.id))
      .map((w) => ({
        ...w,
        manifest: manifestMap.get(w.manifest.id)!, // 更新 manifest（可能版本变了）
      }));

    // 找出新增的 Widget
    const existingIds = new Set(currentWidgets.map((w) => w.manifest.id));
    const now = Date.now();
    const { _zIndexCounter } = get();
    let counter = _zIndexCounter;
    const added = manifests
      .filter((m) => !existingIds.has(m.id))
      .map((manifest) => {
        counter++;
        return {
          manifest,
          enabled: true,
          x: 50,
          y: 50,
          size: manifest.defaultSize,
          zIndex: counter,
          settings: buildDefaultSettings(manifest),
          installedAt: now,
          updatedAt: now,
        } as WidgetInstance;
      });

    set({ widgets: [...kept, ...added], _zIndexCounter: counter });
  },
}));

export const widgetTauriHandler = createTauriStore("widgets", useWidgetStore, {
  autoStart: true,
  saveOnChange: true,
  filterKeys: ["_zIndexCounter"],
  filterKeysStrategy: "omit",
});
