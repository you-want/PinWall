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

- [ ] Default/bottom state: the main window stays on the desktop layer, and blank areas click through to desktop icons or lower windows.
- [ ] Summoned/top state: clicking a blank area is captured by PinWall and sends the main window back to the default/bottom state.
- [ ] Summoned/top state: clicking cards, floating buttons, widgets, stack panels, or modals does not send the main window back.
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
- [ ] Settings do not expose a window opacity slider; desktop transparency uses the app default.
- [ ] Background auto-change toggle and interval controls persist.
- [ ] AI settings can be enabled/disabled without exposing the API key in plain text fields.
- [ ] Quota monitor can be enabled/disabled.
- [ ] Care reminder toggles and parameters persist.
- [ ] Care reminders explain that they appear as top-right notifications instead of desktop cards.
- [ ] Widget extension section presents the Official Widget Hub as the primary path.
- [ ] Local folder install remains available only as an advanced trusted-source path.
- [ ] Marketplace is not presented as a release-ready store.
- [ ] Official and installed widgets show requested permissions with plain-language explanations.
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

## Official Widget Hub

This is the main widget path for 0.1.3.

- [ ] All five official widgets are listed: Clock, Weather, Pomodoro, System Monitor, and Music Control.
- [ ] Install Clock from the Official Widget Hub without choosing a folder.
- [ ] Install Weather and confirm the high-risk `network` permission prompt appears before install.
- [ ] Install System Monitor and confirm the high-risk `system` permission prompt appears before install.
- [ ] Installed widgets appear on the main wall immediately.
- [ ] Installed widgets survive app quit and restart.
- [ ] Installed widgets can be toggled off and on.
- [ ] Installed widgets can be removed.
- [ ] Removing all optional cards and widgets does not leave an empty side panel.

## Widget Local Install

This is an advanced trusted-source path for 0.1.3.

- [ ] Install one trusted local widget directory from `../widgets`.
- [ ] The widget appears on the main wall.
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
