# PinWall Widget SDK — Getting Started

## 概述

PinWall Widget SDK (`@pinwall/widget-sdk`) 是开发 PinWall 桌面小组件的 JavaScript/TypeScript 库。
它封装了与 PinWall 宿主应用的通信协议，提供存储、设置、主题、通知、卡片系统、AI、国际化等能力。

## 快速开始

### 1. 使用 CLI 创建 Widget 项目

```bash
npx @pinwall/widget-cli init my-widget
cd my-widget
```

CLI 会生成以下结构：
```
my-widget/
├── widget.json      # Manifest 清单文件
├── index.html       # 入口页面
├── icon.png         # Widget 图标 (256x256)
└── README.md        # 说明文档
```

### 2. 编写 Widget

在 `index.html` 中引入 SDK：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>My Widget</title>
  <script src="https://unpkg.com/@pinwall/widget-sdk/dist/index.js"></script>
</head>
<body>
  <div id="app">Hello Widget!</div>
  <script>
    // 等待 PinWall 就绪
    PinWall.onReady(async (config) => {
      console.log('Widget is ready!', config);

      // 获取设置
      const settings = await PinWall.settings.getAll();
      console.log('Settings:', settings);

      // 获取主题
      const theme = await PinWall.theme.get();
      console.log('Theme:', theme);
    });
  </script>
</body>
</html>
```

### 3. 校验与打包

```bash
# 校验 manifest 和包结构
npx @pinwall/widget-cli validate

# 打包为 .pwx 文件
npx @pinwall/widget-cli build
```

### 4. 安装到 PinWall

打开 PinWall → 设置 → 扩展 → "安装本地小组件" → 选择你的 Widget 目录。

## Widget Manifest (widget.json)

每个 Widget 必须包含 `widget.json` 清单文件：

```json
{
  "$schema": "../manifest-schema/widget-manifest.schema.json",
  "id": "com.example.my-widget",
  "name": "My Widget",
  "description": "A cool widget",
  "version": "1.0.0",
  "author": "Your Name",
  "entry": "index.html",
  "icon": "icon.png",
  "type": "community",
  "category": "utility",
  "permissions": ["storage", "theme", "i18n"],
  "defaultSize": { "width": 200, "height": 200 },
  "minSize": { "width": 150, "height": 150 },
  "maxSize": { "width": 400, "height": 400 },
  "settings": [
    {
      "key": "color",
      "label": "颜色",
      "type": "select",
      "options": ["red", "blue", "green"],
      "default": "blue"
    }
  ]
}
```

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识符，格式 `com.author.name` |
| `name` | string | 显示名称 |
| `description` | string | 简短描述 |
| `version` | string | 语义化版本号 |
| `author` | string | 作者名 |
| `entry` | string | 入口 HTML 文件 |
| `icon` | string | 图标文件路径 |
| `type` | enum | `official` 或 `community` |
| `category` | enum | `utility`/`productivity`/`beautification`/`entertainment`/`system` |
| `permissions` | array | 声明需要的权限 |
| `defaultSize` | object | 默认尺寸 `{width, height}` |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `minSize` | object | 最小尺寸 |
| `maxSize` | object | 最大尺寸 |
| `settings` | array | 用户可配置的设置项 |

## 权限系统

Widget 必须在 manifest 中声明所需权限，未声明的权限调用将被拒绝：

| 权限标识 | API 模块 | 说明 |
|---------|----------|------|
| `storage` | `PinWall.storage.*` | Widget 本地存储 |
| `theme` | `PinWall.theme.*` | 主题读取 |
| `notify` | `PinWall.notify()` | 发送桌面通知 |
| `cards` | `PinWall.cards.*` | 卡片系统读写 |
| `events` | `PinWall.events.*` | 应用事件监听 |
| `app` | `PinWall.app.*` | 应用控制 |
| `ai` | `PinWall.ai.*` | AI 服务调用 |
| `system` | `PinWall.system.*` | 系统信息采集 |
| `network` | `PinWall.network.*` | 网络请求代理 |
| `i18n` | `PinWall.i18n.*` | 国际化多语言 |

## 设计规范

### 尺寸

- 最小尺寸：150 × 150 px
- 推荐尺寸：200 × 200 ~ 300 × 200 px
- Widget 应自适应容器大小

### 样式

- 背景必须透明 (`background: transparent`)
- 字体使用系统默认：`'Inter Variable', -apple-system, BlinkMacSystemFont, sans-serif`
- 主色调：`#6366f1` (indigo-500)
- 文本颜色：`#1a1a1a` (light mode)
- 圆角建议：8px ~ 16px

### 交互

- Widget 通过 PinWall 宿主实现拖拽和右键菜单
- Widget 内部可有自己的交互（按钮、切换等）
- 避免在 Widget 内打开外部链接

## 下一步

- [API Reference](./api-reference.md) — 完整 API 文档
- 查看 `widgets/` 目录下的官方 Widget 源码作为参考
