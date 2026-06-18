# PinWall 测试文档

本文档描述 PinWall 桌面端的测试基础设施、测试命令和测试策略。

## 测试概览

| 类型 | 工具 | 位置 | 测试数 |
|------|------|------|--------|
| 前端单元测试 | Vitest + jsdom | `src/**/*.test.{ts,tsx}` | 74 |
| Rust 后端单元测试 | Cargo test | `src-tauri/src/**/*.rs` | 18 |
| E2E 端到端测试 | Playwright | `e2e/**/*.spec.ts` | 14 |
| 手动测试 | 交互式 HTML 报告 | `test-results/manual-test-report.html` | ~80 |

## 快速开始

### 运行所有测试

```bash
# 前端单元测试 + Rust 后端测试
pnpm test:run
cd src-tauri && cargo test

# 或者使用脚本
./scripts/test.sh all
```

### 单独运行

```bash
# 前端单元测试
pnpm test:run               # 运行一次
pnpm test:watch             # 监听模式
pnpm test                   # 打开交互式 UI

# Rust 后端测试
cd src-tauri && cargo test

# E2E 测试
pnpm test:e2e               # 运行 E2E
pnpm test:e2e:ui            # Playwright UI 模式

# 覆盖率报告
pnpm test:coverage
```

## 前端单元测试

### 技术栈

- **Vitest v4** — 极速的单元测试框架
- **jsdom** — DOM 环境模拟
- **Testing Library** — DOM 查询和断言
- **@testing-library/jest-dom** — 自定义匹配器

### 测试文件位置

```
src/
├── utils/
│   ├── collision.test.ts        # 碰撞检测和分离算法
│   └── gridLayout.test.ts       # 网格布局算法
├── stores/
│   ├── cardStore.test.ts        # 卡片状态管理 (CRUD, zIndex, 提醒)
│   ├── languageStore.test.ts    # 语言切换
│   └── notificationStore.test.ts# 通知状态管理
├── i18n/
│   └── index.test.ts            # 翻译文件和插值函数
└── data/
    ├── holidays.test.ts         # 节假日定义数据
    └── careTones.test.ts        # 关怀语气消息库
```

### 测试覆盖的核心功能

| 模块 | 测试内容 |
|------|----------|
| **碰撞检测** | 重叠检测、水平/垂直分离、拖拽卡片不动、边界约束、内容感知高度 |
| **网格布局** | 首格位置、列填充、行换行、去重、顺序保持 |
| **卡片 Store** | 创建/关闭/定位/置顶/折叠/提醒/批量更新/迁移 |
| **通知 Store** | 显示/Dismiss/查看卡片/清除查看 |
| **i18n** | 中英文翻译完整性、插值函数 |
| **节假日** | 数据完整性、区域分布、唯一 ID |
| **关怀语气** | 三种语气消息、AI 提示词、随机选取 |

## Rust 后端单元测试

### 测试文件位置

```
src-tauri/src/
├── commands.rs (tests)          # greet 命令
├── i18n.rs (tests)              # 语言检测、快捷方式格式化、托盘翻译
└── background.rs (tests)        # 背景图时间戳生成
```

### 测试覆盖的核心功能

| 模块 | 测试内容 |
|------|----------|
| **commands** | greet 字符串格式化、空名、Unicode |
| **i18n** | 中英文切换、快捷方式格式化 (⌘⇧Space)、托盘翻译 |
| **background** | 时间戳生成、数值格式、唯一性 |

## E2E 端到端测试

### 技术栈

- **Playwright v1** — 跨浏览器自动化
- **Chromium** — 测试浏览器
- **Vite dev server** — 测试运行时

### 测试文件

```
e2e/
└── app.spec.ts                  # 应用加载、弹窗、表单交互
```

### 测试场景

| 场景 | 测试项 |
|------|--------|
| **页面加载** | 应用容器可见、空状态提示、浮动按钮 |
| **新建弹窗** | 打开/关闭、标题输入、内容输入、颜色选择、类型标签 |
| **交互** | 取消按钮、遮罩点击关闭 |

## 手动测试

### 交互式测试报告

```bash
# 生成交互式 HTML 报告
node scripts/manual-test-tracker.cjs

# 然后在浏览器中打开
open test-results/manual-test-report.html
```

报告功能：
- ✅ 复选框标记测试状态（保存在 localStorage）
- 📊 实时通过率统计
- 💾 导出 JSON 测试结果
- 📄 导出 Markdown 报告
- 🔄 重置所有状态

### 测试用例文档

完整的测试用例见 [`TEST_CASES.md`](./TEST_CASES.md)，涵盖：

1. 应用启动与窗口管理
2. 全局快捷键与窗口切换
3. 新建便签（17 项）
4. 便签提醒功能（9 项）
5. 卡片交互（10 项）
6. 卡片堆叠收纳（7 项）
7. 数据持久化（6 项）
8. 跨窗口状态同步（3 项）
9. 设置窗口（4 项）
10. 浮动按钮（4 项）
11. 空状态（3 项）
12. 视觉与动画（7 项）
13. 背景图片（3 项）
14. 稳定性与边界情况（7 项）
15. 性能基准（4 项）

## 测试策略

### 分层测试金字塔

```
        /   E2E (14 tests)   \
       /  集成测试 (Tauri)     \
      /  单元测试 (74 + 18)     \
     /___________________________\
```

- **单元测试** — 纯函数、状态管理、工具函数（最快，最多）
- **Rust 测试** — 后端逻辑、i18n、命令处理
- **E2E 测试** — 关键用户流程（最慢，最少）
- **手动测试** — 窗口层级、拖拽交互、多显示器、性能基准

### CI 建议

```yaml
# .github/workflows/test.yml
- run: pnpm test:run
- run: cd src-tauri && cargo test
# E2E 测试仅在 main 分支上运行（需要浏览器）
- run: pnpm test:e2e  # if: github.ref == 'refs/heads/main'
```

## 添加新测试

### 前端单元测试

```typescript
// src/utils/myNewModule.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from './myNewModule';

describe('myNewModule', () => {
  it('does something', () => {
    expect(myFunction('input')).toBe('output');
  });
});
```

### Rust 测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        assert_eq!(my_function("input"), "output");
    }
}
```

### E2E 测试

```typescript
// e2e/my-feature.spec.ts
import { test, expect } from '@playwright/test';

test('feature works', async ({ page }) => {
  await page.goto('http://localhost:1930');
  // ...
});
```

## 测试结果

### 当前状态

- ✅ **前端单元测试**: 74/74 通过
- ✅ **Rust 后端测试**: 18/18 通过
- ✅ **E2E 测试**: 14 个场景已配置
- 📋 **手动测试**: 80+ 用例待执行
