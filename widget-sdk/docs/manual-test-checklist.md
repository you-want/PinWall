# PinWall 小组件扩展系统 — 人工测试清单

> 自动化测试已覆盖: 83 项单元测试 (Desktop 40 + Marketplace 20 + SDK 23)
> 以下为需要在真实运行环境中手动验证的测试项。

---

## 一、Widget 宿主引擎 (Desktop)

### 1.1 Widget 安装
- [ ] 设置面板 → 扩展 → 点击"安装本地小组件" → 选择 `widgets/widget-clock/` 目录 → 安装成功
- [ ] 安装后 Widget 列表中出现 "时钟小组件"，显示版本号和"官方"标签
- [ ] 重复安装同一 Widget → 不产生重复实例
- [ ] 依次安装全部 5 个官方 Widget → 全部出现在列表中

### 1.2 Widget 启用/禁用
- [ ] 切换 Widget 开关为关闭 → 桌面上该 Widget 消失
- [ ] 切换 Widget 开关为开启 → 桌面上该 Widget 重新出现
- [ ] 禁用后重启应用 → Widget 仍保持禁用状态

### 1.3 Widget 卸载
- [ ] 点击 Widget 列表中的"移除"按钮 → Widget 从列表和桌面消失
- [ ] 卸载后重新安装 → Widget 恢复正常（位置和设置重置）

### 1.4 Widget 渲染 (iframe 沙箱)
- [ ] 时钟 Widget 正常显示模拟表盘/数字时间
- [ ] 天气 Widget 显示当前天气（需要网络）
- [ ] 番茄钟 Widget 可以开始/暂停/重置
- [ ] 系统监控 Widget 显示内存和电池信息
- [ ] 音乐 Widget 显示"等待音乐播放..."状态

---

## 二、Widget 交互

### 2.1 拖拽
- [ ] 鼠标按住 Widget → 可自由拖拽到桌面任意位置
- [ ] 拖拽时 Widget 有视觉反馈（阴影/透明度变化）
- [ ] 松开鼠标 → Widget 停留在新位置
- [ ] 拖拽 Widget 不影响便签卡片的拖拽

### 2.2 右键菜单
- [ ] 右键点击 Widget → 弹出上下文菜单
- [ ] 菜单包含: 刷新、设置、尺寸 S/M/L、移除
- [ ] 选择尺寸 S → Widget 变为 160×160
- [ ] 选择尺寸 M → Widget 变为 260×260
- [ ] 选择尺寸 L → Widget 变为 380×380
- [ ] 点击"移除" → Widget 被卸载

### 2.3 层级管理
- [ ] 点击 Widget → Widget 被置顶（z-index 增加）
- [ ] Widget 默认层级低于便签卡片（Widget 从 50 起，卡片从 100 起）
- [ ] 点击便签卡片 → 卡片层级高于 Widget

### 2.4 Widget 设置
- [ ] 右键 → 设置 → 弹出设置对话框
- [ ] 时钟 Widget 设置: 切换模拟/数字模式 → Widget 实时变化
- [ ] 时钟 Widget 设置: 切换显示秒 → 秒针显示/隐藏
- [ ] 天气 Widget 设置: 修改城市 → 天气数据刷新
- [ ] 番茄钟 Widget 设置: 修改工作时长 → 倒计时更新
- [ ] 设置值持久化: 修改后重启应用 → 设置仍保留

---

## 三、Host API Bridge 通信

### 3.1 基础能力 (无需权限)
- [ ] Widget 可读取主题信息 (theme.get)
- [ ] Widget 可获取当前语言 (i18n.getLocale)
- [ ] Widget 可使用本地存储 (storage.get/set/remove/clear)
- [ ] Widget 存储数据重启后仍存在

### 3.2 权限控制
- [ ] 未声明 `cards` 权限的 Widget 调用 cards API → 返回 Permission denied
- [ ] 未声明 `system` 权限的 Widget 调用 system API → 返回 Permission denied
- [ ] 未声明 `network` 权限的 Widget 调用 network API → 返回 Permission denied
- [ ] 未声明 `ai` 权限的 Widget 调用 ai API → 返回 Permission denied

### 3.3 系统信息 (system 权限)
- [ ] 系统监控 Widget 能读取电池电量和充电状态
- [ ] 系统监控 Widget 能读取内存使用量
- [ ] 系统信息按配置的间隔自动刷新

### 3.4 通知 (notify 权限)
- [ ] 番茄钟完成时发出桌面通知
- [ ] 休息结束时发出桌面通知

---

## 四、官方 Widget 功能验证

### 4.1 时钟 (widget-clock)
- [ ] 模拟模式: 时针/分针/秒针正确转动
- [ ] 数字模式: 时间每秒更新
- [ ] 日期正确显示（年月日+星期）
- [ ] 切换主题色 → 秒针和中心点颜色变化

### 4.2 天气 (widget-weather)
- [ ] 自动定位获取天气 (city 留空时)
- [ ] 指定城市 (如 "Beijing") → 显示该城市天气
- [ ] 温度单位切换: 摄氏 ↔ 华氏
- [ ] 显示 3 天预报
- [ ] 天气图标正确对应天气类型

### 4.3 番茄钟 (widget-pomodoro)
- [ ] 点击"开始" → 25 分钟倒计时开始
- [ ] 倒计时归零 → 自动切换到 5 分钟休息
- [ ] 休息归零 → 自动切换回工作模式
- [ ] 完成番茄数 +1 显示
- [ ] 点击"重置" → 回到初始 25:00 状态

### 4.4 系统监控 (widget-system-monitor)
- [ ] 显示内存使用百分比和进度条
- [ ] 显示电池电量和充电状态
- [ ] 进度条颜色: <60% 绿色, 60-85% 黄色, >85% 红色
- [ ] 数据按设定间隔自动刷新

### 4.5 音乐控制 (widget-music)
- [ ] 无音乐播放时显示"等待音乐播放..."
- [ ] 播放/暂停/上一曲/下一曲按钮可用

---

## 五、Marketplace 后端

### 5.1 启动与配置
- [ ] `docker-compose up -d` → PostgreSQL 启动
- [ ] `pnpm start:dev` → NestJS 服务在 3000 端口启动
- [ ] 访问 `http://localhost:3000/api/docs` → Swagger 文档页面正常

### 5.2 开发者 API
- [ ] POST `/api/developers/register` → 注册成功，返回 apiKey
- [ ] POST `/api/developers/login` → 登录成功，返回 JWT token
- [ ] 重复注册同邮箱 → 返回 409 Conflict

### 5.3 Widget API
- [ ] GET `/api/widgets` → 返回空列表（初始状态）
- [ ] POST `/api/widgets/submit` (携带 JWT) → 提交 Widget 成功
- [ ] GET `/api/widgets` → 显示提交的 Widget（需 approved 状态）
- [ ] GET `/api/widgets/:id` → Widget 详情
- [ ] GET `/api/widgets?search=xxx` → 搜索功能
- [ ] GET `/api/widgets?category=utility` → 分类筛选

### 5.4 评价系统
- [ ] POST `/api/widgets/:id/reviews` → 添加评价
- [ ] Widget 平均分自动更新
- [ ] GET `/api/widgets/:id/reviews` → 评价列表

---

## 六、Marketplace UI 集成

### 6.1 市场面板
- [ ] 设置面板 → 扩展 → 点击"浏览市场" → 市场面板弹出
- [ ] 面板包含: 搜索框、分类筛选、Widget 列表
- [ ] 分类筛选切换 → 列表更新
- [ ] 搜索输入 → 列表过滤

### 6.2 Widget 详情
- [ ] 点击 Widget 卡片"详情" → 进入详情页
- [ ] 详情页显示: 名称、作者、描述、版本历史、权限要求
- [ ] 点击"返回列表" → 回到列表视图

### 6.3 安装
- [ ] 点击"安装"按钮 → Widget 安装到本地
- [ ] 安装中按钮显示 loading 状态
- [ ] 安装完成后 Widget 出现在设置面板的已安装列表中

---

## 七、SDK & CLI

### 7.1 SDK
- [ ] SDK 的 `PinWall.onReady()` 回调在 Widget 加载时被正确调用
- [ ] SDK 的 `PinWall.storage` 读写正常
- [ ] SDK 的 `PinWall.i18n.t()` 翻译正常
- [ ] SDK 的 `PinWall.theme.get()` 返回主题配置

### 7.2 CLI
- [ ] `npx @pinwall/widget-cli init test-widget` → 生成项目模板
- [ ] 生成的目录包含: widget.json, index.html, icon.png
- [ ] `npx @pinwall/widget-cli validate` → 校验通过
- [ ] `npx @pinwall/widget-cli build` → 打包为 .pwx 文件

---

## 八、兼容性与边界条件

### 8.1 兼容性
- [ ] macOS 上全部 Widget 正常运行
- [ ] 透明窗口下 Widget 背景透明，与桌面融合
- [ ] Widget 与便签卡片共存不冲突

### 8.2 边界条件
- [ ] 安装 0 个 Widget → 设置面板显示"尚未安装任何小组件"
- [ ] 安装 10+ 个 Widget → 性能正常，无卡顿
- [ ] Widget 目录被手动删除 → 应用启动不崩溃
- [ ] 网络断开时 → 天气 Widget 显示错误提示而非崩溃
- [ ] Marketplace 后端未启动时 → 市场面板显示"加载失败"而非崩溃

---

## 测试结果汇总模板

| 模块 | 总项数 | 通过 | 失败 | 跳过 | 备注 |
|------|--------|------|------|------|------|
| Widget 宿主引擎 | 14 | | | | |
| Widget 交互 | 18 | | | | |
| Host API Bridge | 10 | | | | |
| 官方 Widget 功能 | 20 | | | | |
| Marketplace 后端 | 12 | | | | |
| Marketplace UI | 9 | | | | |
| SDK & CLI | 8 | | | | |
| 兼容性与边界 | 8 | | | | |
| **总计** | **99** | | | | |
