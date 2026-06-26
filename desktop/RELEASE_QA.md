# PinWall Desktop Release QA

This checklist is the release gate for the desktop product mainline. It focuses on the macOS app experience and intentionally ignores the old web demo.

## Automated Gate

Run these before any manual release pass:

```bash
cd desktop
pnpm test:run
pnpm build
cd src-tauri
cargo test
```

For a release candidate, also run:

```bash
cd desktop
pnpm tauri:build:app
```

Expected result:

- Frontend unit tests pass.
- Production bundle builds.
- Rust tests pass.
- Tauri produces a macOS app under `desktop/src-tauri/target/release/bundle/macos/`.

For public distribution, run the full bundle command and confirm the DMG is produced:

```bash
cd desktop
pnpm tauri build
```

The full bundle should produce a DMG under `desktop/src-tauri/target/release/bundle/dmg/`. If the app bundle succeeds but DMG creation fails with a local `hdiutil` error, treat it as a packaging-environment issue and verify the full DMG path in GitHub Actions before publishing.

Current local note:

- `pnpm tauri:build:app` succeeds and produces `PinWall.app`.
- A local full `pnpm tauri build` reached the DMG stage but failed at `hdiutil create` with `设备未配置`. The app bundle itself was produced successfully. Re-check DMG creation on GitHub Actions or another macOS packaging environment before publishing.

## Fresh Install

- [ ] Install the app from the generated DMG.
- [ ] Launch PinWall from Applications.
- [ ] The main transparent desktop window appears without a system title bar.
- [ ] The settings window can be opened.
- [ ] The tray/menu-bar icon appears.
- [ ] The app can quit cleanly from the tray/menu-bar.

## Core Note Flow

- [ ] Create a note from the floating button.
- [ ] Create a note with `Cmd+Shift+N`.
- [ ] Edit title and content.
- [ ] Create a note with empty content and confirm fallback content is shown.
- [ ] Drag a note and confirm it stays where dropped.
- [ ] Bring an overlapped note to front by clicking it.
- [ ] Collapse/restore a note.
- [ ] Delete a note and confirm the delete prompt works.
- [ ] Create more than five notes and confirm extra notes move into the stack.
- [ ] Restore a stacked note to the desktop.

## Reminder Flow

- [ ] Create a reminder note for one minute in the future.
- [ ] The notification window appears when due.
- [ ] The notification contains the correct note title/content.
- [ ] Dismissing the notification hides it.
- [ ] The same reminder does not fire repeatedly after dismissal.
- [ ] "View" or fullscreen behavior brings the corresponding note into focus.

## Desktop Behavior

- [ ] Clicking blank desktop/window area sends PinWall back behind normal desktop interactions.
- [ ] Floating buttons and cards remain interactive when the app is summoned.
- [ ] `Cmd+Shift+Space` toggles the main window state.
- [ ] `Cmd+Shift+A` arranges cards.
- [ ] `Cmd+Shift+B` opens the breathing guide.
- [ ] The app stays responsive after rapid window toggling.

## Persistence

- [ ] Notes survive app quit and restart.
- [ ] Note positions survive app quit and restart.
- [ ] Reminder settings survive app quit and restart.
- [ ] Settings changes survive app quit and restart.
- [ ] Removing a note persists after restart.

## Settings

- [ ] Language switching updates visible settings text and tray/menu labels.
- [ ] Settings use section navigation for Basics, Note Experience, Care Reminders, and Experimental.
- [ ] Section navigation can switch without scrolling through the full settings page.
- [ ] Launch-on-startup toggle does not error.
- [ ] Global shortcut recording works and can be reset.
- [ ] Window opacity slider persists and changes the desktop appearance.
- [ ] Background auto-change toggle and interval controls persist.
- [ ] AI settings can be enabled/disabled without exposing the API key in plain text fields.
- [ ] Quota monitor can be enabled/disabled.
- [ ] Care reminder toggles and parameters persist.
- [ ] Care reminders explain that they appear as top-right notifications instead of desktop cards.
- [ ] Widget extension section only presents local install as the production path.
- [ ] Marketplace is clearly marked experimental and is not presented as a release-ready store.
- [ ] Installed widgets show their requested permissions.
- [ ] Network, system, cards, and AI permissions are visually distinguishable from low-risk permissions.

## Unified Care Reminders

- [ ] Eye care reminder appears in the top-right notification window when due.
- [ ] Rest reminder appears in the top-right notification window when due.
- [ ] Off-work reminder appears in the top-right notification window at the configured time.
- [ ] Weather component appears on the main wall when weather care is enabled.
- [ ] Weather component hides when weather care is disabled.
- [ ] Weather component can use a manually entered city.
- [ ] Weather component can detect the current city when the city field is empty.
- [ ] Weather component shows current weather and the next 7 days.
- [ ] Mood check-in reminder appears as a top-right notification at configured slots.
- [ ] Confirming a recurring reminder does not disable future reminders.
- [ ] Confirming a one-time daily system reminder prevents duplicate notifications for the same day.
- [ ] Dismissing or auto-dismissing a notification does not delete user notes.
- [ ] User-created note reminders still keep their original note after notification.

## Widget Local Install

This is an experimental feature for 0.1.x.

- [ ] Install one official local widget directory from `../widgets`.
- [ ] The widget appears on the desktop.
- [ ] The widget can be toggled off and on.
- [ ] The widget can be removed.
- [ ] Installing a widget with an invalid id is rejected.
- [ ] Installing a widget with `../` in `entry` or `icon` is rejected.
- [ ] Installing a widget with a missing `entry` or `icon` file is rejected.
- [ ] Installing a widget directory containing symlinks is rejected.
- [ ] A widget with `network` permission cannot fetch `file://`, localhost, or private-network URLs through the bridge.

## Visual And Performance Checks

- [ ] Empty state is visible on first launch with no notes.
- [ ] Cards do not overlap incoherently after arrangement.
- [ ] Text in cards and settings does not overflow obvious containers.
- [ ] App idle CPU is low when no reminder or widget is active.
- [ ] Dragging notes feels smooth with at least 10 notes.
- [ ] Memory usage remains acceptable after 30 minutes of normal use.

## Release Decision

- [ ] Automated gate passed.
- [ ] Core note flow passed.
- [ ] Reminder flow passed.
- [ ] Persistence passed.
- [ ] No crash or console error observed during QA.
- [ ] Known limitations are documented in the release notes.

Release result:

- [ ] Approved
- [ ] Blocked

Tester:

Date:


人工测试清单（基于 0.1.2 PRD）

  1. 设置页信息架构

  - [x] 分区导航：打开设置页，左侧导航（基础 / 便签体验 / 关怀提醒 /
  实验功能）是否清晰？当前分区是否有选中态？
  - [x] 分区切换：点击不同分区，右侧内容是否切换？切换后未完成的输入（如刚输入的文本）是否保留？
  - [x] 窗口自适应：缩小设置窗口宽度，分区导航是否从左侧变为顶部？
  - [x] 首屏可见：默认窗口尺寸下，是否能一眼看到导航和当前分区的主要设置？

  2. 基础设置

  - [x] 语言切换：切换中英文后，设置页和托盘菜单文案是否实时更新？
  - [x] 开机启动：开关是否正常工作？切换失败时是否有可见的错误提示（不是只写 console）？
  - [x] 全局快捷键：修改快捷键后是否生效？修改失败时是否保留旧快捷键？是否有重置入口？


  3. 便签体验

  - [ ] 透明度滑块：是否可见、可拖动？调整后桌面窗口透明度是否实时变化？设置是否持久化（重启后恢复）？
  - [x] 节日卡片：中国节日和国际节日两个开关是否都能独立切换？切换后重启是否保持状态？

  4. 关怀提醒整合

  - [x] 设置集中展示：护眼、休息、下班、天气、心情是否合并在一个紧凑区域？
  - [x] 每个提醒项：是否都有启用开关 + 当前关键参数（如休息间隔、下班时间、天气城市）？
  - [x] 关闭提醒：关闭某个关怀项后，详细参数是否变为次要状态但仍可查看？
  - [x] 持久化：所有开关切换后重启应用是否保持状态？

  5. 统一提醒体系 ⭐ 核心

  - [ ] 护眼/休息/下班/心情：到点后是否在右上角通知窗口弹出？是否不再默认生成桌面系统卡片？
  - [ ] 天气：用户开启后是否在主窗口显示组件？关闭后是否隐藏？
  - [ ] 天气：用户手动输入城市是否可用？未输入城市时是否可自动定位？
  - [ ] 天气：是否显示当天实时天气和最近 7 天预报？
  - [ ] 一次性系统提醒（如天气）：确认后是否清理本次提醒实例，不留临时桌面卡片？
  - [ ] 周期系统提醒（如护眼、休息）：确认后是否计算下一次时间？下一周期是否仍会触发？
  - [ ] 每日定时系统提醒（如下班）：确认后当天是否不重复弹出？第二天是否可再次触发？
  - [ ] 用户便签提醒：确认后便签是否仍保留？是否标记 reminderFired？
  - [ ] 关闭提醒设置：关闭某项后，该类型是否不再弹出？
  - [ ] 通知自动消失：等待通知 15 秒自动消失后，是否不会错误删除一次性提醒或周期提醒？
  - [ ] 应用重启：已处理的一次性每日提醒是否不会在同一天重复弹出？

  6. 实验功能降权

  - [ ] AI 助手：未启用时是否折叠，只显示启用状态和摘要？不直接展示完整 API 表单？
  - [ ] 额度监控：未启用时是否折叠？不展示模型添加表单？
  - [ ] API Key 输入：是否为 password 类型（不显示明文）？
  - [ ] 本地 Widget：空状态、安装、启用、移除路径是否仍可用？
  - [ ] Marketplace：是否只显示实验状态（不是稳定商店的外观）？
  - [ ] Widget 权限：高风险权限（network、system、cards、ai）是否有视觉区分？

  7. 视觉与交互质量

  - [ ] 中英文：切换语言后是否有文字溢出或换行失控？
  - [ ] 长文本：长 URL、长模型名、长 Widget 描述是否被正确截断或换行？
  - [ ] 布局稳定：切换、展开、错误提示时是否无明显布局跳动？
  - [ ] 键盘操作：能否用 Escape 关闭设置页？
  - [ ] 重复打开：多次打开/关闭设置窗口，是否不会出现空白或重复实例？
  - [ ] 危险操作：删除类按钮是否使用红色？但不过度强调？
