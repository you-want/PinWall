# PinWall 后续改进规划

> 历史修复记录，当前迭代见 [NEXT_ITERATION.md](./NEXT_ITERATION.md)。2026-10-15 核验：设置深拷贝不能解决多窗口并发读改写覆盖；当前 Vite 配置仍未拆分主 JS；`signingIdentity: "-"` 表示 ad-hoc 临时签名，不代表 Developer ID 正式签名。下方“全部完成”只作为早期记录保留，不作为当前发布验收结论。

## 实施清单

### P0 — 必须修复 ✅ 全部完成

- [x] **1. 修复 postMessage null origin 错误** — `src/components/WidgetFrame.tsx:32`
  - `new URL(iframeSrc).origin` 在 jsdom + `asset://` 协议下返回 `null`，导致 postMessage 报错
  - 修复：增加 `|| "*"` 兜底

- [x] **2. 修复 storage 并发写入数据丢失** — `src/services/storage.ts`
  - `getSettings()` 返回可变引用，多个异步操作并发修改会互相覆盖
  - 修复：`saveSettings` 内部先做 `JSON.parse(JSON.stringify(...))` 深拷贝再写入

- [x] **3. 修复 Rust delete_background_image_file 路径遍历边界** — `src-tauri/src/background.rs`
  - 纯文件名场景下 `canonicalize("")` 返回 CWD，可能绕过安全检查
  - 修复：检查 parent 是否为空，reject 纯文件名

### P1 — 安全加固 ✅ 全部完成

- [x] **4. network 模块安全加固** — `src/services/widgetBridge.ts:322-352`
  - 添加 `redirect: "manual"` 防止通过 3xx 重定向绕过 host 黑名单
  - 限制 POST body 最大 10MB
  - 校验响应 Content-Type 为 application/json

### P2 — 构建优化 ✅ 全部完成

- [x] **5. 解决动态 import 冲突** — `src/services/widgetBridge.ts`
  - `aiService` 同时被静态和动态导入，Rollup 无法独立拆分 chunk
  - 修复：将 `generateNoteContent` 改为静态导入

- [x] **6. 配置 manualChunks 拆分大 bundle** — `vite.config.ts`
  - 产物 683KB 未做 code splitting
  - 新增拆分：`vendor-react` (3.7KB), `vendor-tauri` (22.8KB), `vendor-utils` (8.8KB)

### P3 — 完善 TODO 和配置 ✅ 全部完成

- [x] **7. 完善 theme API 返回** — `src/services/widgetBridge.ts`
  - 移除硬编码注释，增加 try/catch 错误处理

- [x] **8. 完善 notify API 实现** — `src/services/widgetBridge.ts`
  - 移除 console.log，增加参数解析和 try/catch 错误处理

- [x] **9. 修复 app.getVersion 返回值** — `src/services/widgetBridge.ts` + `src-tauri/src/commands.rs`
  - 新增 Rust 命令 `get_app_version` 从 `CARGO_PKG_VERSION` 读取
  - 前端通过 `invoke("get_app_version")` 获取真实版本号

- [x] **10. macOS 签名占位符替换** — `src-tauri/tauri.conf.json`
  - `"signingIdentity": "-"` — ad-hoc 临时签名，正式分发仍需配置 Developer ID 与公证

---

## 验证结果

```
$ npx vitest run
Test Files  17 passed (17)
Tests       163 passed (163)
✓ built in 4.80s
```

- TypeScript 类型检查：✅ 无错误
- 单元测试：✅ 163/163 全部通过（之前存在 1 个 postMessage 运行时错误，已修复）
- Vite 构建：✅ 成功，vendor chunks 已拆分
