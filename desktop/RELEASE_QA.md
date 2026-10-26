# PinWall Desktop Release QA

This checklist is the release gate for the desktop product mainline. It focuses on the macOS app experience and intentionally ignores the old web demo.

## Automated Gate

Current candidate: `0.1.4-beta.3`. Release automation creates a draft prerelease only; stable publishing and in-app updates are disabled. Follow `BETA_TESTING.md` for installation and the maintainer handoff.

Run these before any manual release pass:

```bash
cd desktop
pnpm test:run
node --test scripts/release-preflight.test.mjs
node scripts/release-preflight.mjs v0.1.4-beta.3
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
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
- Browser E2E passes using the isolated test IPC adapter on port 1932. This verifies UI/reload flows, not native filesystem or window behavior.
- Tauri produces a macOS app under `desktop/src-tauri/target/release/bundle/macos/`.

For public distribution, run the full bundle command and confirm the DMG is produced:

```bash
cd desktop
pnpm tauri build
```

The full bundle should produce a DMG under `desktop/src-tauri/target/release/bundle/dmg/`. A successful `.app` build does not replace DMG verification; public releases must confirm the final artifacts in GitHub Actions.

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
- [ ] Edit a note from the title-bar icon and from the context menu; save title, content and color.
- [ ] Cancel and Esc discard edits; Cmd/Ctrl+Enter saves; focus stays inside the editor and returns on close.
- [ ] Edit an existing reminder's time and toggle it off/on; content-only edits do not re-fire completed reminders.
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
- [ ] Drag at least two notes to custom positions, quit and restart: neither is automatically arranged on startup.
- [ ] The explicit Arrange action still arranges visible notes when requested.
- [ ] Reminder settings survive app quit and restart.
- [ ] Settings changes survive app quit and restart.
- [ ] Removing a note persists after restart.
- [ ] In an isolated test profile, concurrent settings changes in main and settings windows preserve both fields after restart.
- [ ] Export notes through the native save dialog; cancelling either file dialog makes no changes.
- [ ] Restore a backup after confirmation: matching local IDs win, positions survive, imported reminders are disabled, and a second import adds zero notes.
- [ ] Invalid, oversized and future-version backups show an error without changing the live store.
- [ ] In an isolated test profile, corrupt settings/cards stop startup, preserve the original and create a `.corrupt-backup` copy. Restore verified files and retry.
- [ ] Future-version settings/cards show an upgrade message and remain untouched.
- [ ] Before a successful restore, the previous card state is saved as `.before-restore`; a write failure leaves the current state intact.
- [ ] Exported JSON contains only note fields, with no settings, API keys or widget code.
- [ ] In an isolated profile, interrupt a routine card save: the previous JSON remains readable, the draft stays visible, and Retry saving persists it before quit/restart.
- [ ] While a save is pending or failed, restore notes in settings: the open wall gains restored notes and keeps pending edits; retry merges disjoint fields and does not revive remotely deleted notes.
- [ ] Rapid dragging and editing do not replay an older position/content after a later commit or window focus refresh.
- [ ] Quit immediately after an edit and reopen: confirm the native save completed; repeat from tray quit and during a system shutdown test.

Settings and all card commits use native atomic replacement; other five stores still use the existing plugin. The failure banner retains a draft in memory, so do not quit before a successful retry. An in-app corruption repair flow remains pending. Browser tests cover mocked failures and cross-page synchronization; test native file dialogs, window synchronization and actual quit/restart explicitly.

## Keychain Migration (macOS, Isolated Profile)

- [ ] With fake AI and quota keys in legacy settings, allow Keychain access: keys remain usable after restart, settings schema becomes 2, and the live JSON contains no keys.
- [ ] Deny initial Keychain access: legacy JSON stays byte-for-byte intact and settings show recovery guidance; unlock/allow and reload to finish migration.
- [ ] Lock Keychain after migration, reopen settings, then unlock: reads recover without replacing settings or keys; notes still start and can be edited.
- [ ] Change/delete keys or remove a quota model: restart confirms the new values; no old bundle is removed before the settings commit succeeds.
- [ ] Inject a settings write failure after Keychain creation: previous settings/keys remain usable and the uncommitted bundle is cleaned up.
- [ ] Notification settings reads contain no credentials and do not prompt for Keychain access.
- [ ] Historical backups are handled deliberately: migration does not silently edit old files that may still contain plaintext keys.

Automated vault tests use an in-memory adapter and temporary files. They do not exercise real Keychain permissions, lock/unlock or code-signing identity changes. Non-macOS secret storage is unsupported in this iteration.

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

This is the primary path for trusted, optional widgets.

- [ ] All six official widgets are listed: Clock, Weather, Pomodoro, System Monitor, Music Control, and Keep Awake.
- [ ] Install Clock from the Official Widget Hub without choosing a folder.
- [ ] Install Weather and confirm the high-risk `network` permission prompt appears before install.
- [ ] Install System Monitor and confirm the high-risk `system` permission prompt appears before install.
- [ ] Enabled widgets appear on the main wall immediately; Keep Awake is disabled after installation until explicitly enabled.
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

## Keep Awake (Experimental, macOS)

- [ ] Install from the Official Widget Hub; `power` is explained before confirmation, installation remains disabled, enabling shows an idle card.
- [ ] Start for 15 minutes; `pmset -g assertions` shows `PinWall Keep Awake`. Stop removes the assertion; repeated Start does not extend an active session.
- [ ] Check expiry using the explicit native smoke test below; the system releases without renderer polling.
- [ ] Refresh, disable in the wall menu, disable from the separate settings window, update, and uninstall while active; each releases the assertion. Re-enable/reinstall starts idle.
- [ ] A failed stop leaves the widget enabled and shows retry guidance; retry succeeds without losing other widget state.
- [ ] Quit from the tray while active, verify no remaining PinWall assertion, then restart: notes restore and Keep Awake is idle.
- [ ] Test system sleep/wake, screen locking, multiple displays and normal window hiding; verify the UI reflects actual status and core note/window behavior stays intact.
- [ ] Check Chinese/English, keyboard controls and a narrow wall; unsupported platforms and outdated modified plugin files show useful guidance.
- [ ] Verify installed modified HTML/manifest/icon and symlinked content cannot open a native power session; reinstall the bundled widget to recover.
- [ ] Existing official widgets still render in WKWebView with the opaque sandbox; external-resource local widgets get understandable load/bridge errors.

Explicit macOS IOKit smoke (creates short real assertions, no AppData writes):

```bash
cd desktop/src-tauri
cargo test --offline power::tests::native_assertion_smoke -- --ignored --exact --nocapture
```

The smoke verifies acquisition, manual release and system timeout; browser tests use mocked native commands. Neither replaces the unchecked Tauri UI, multiwindow, exit or sleep/wake checks above. Local builds remain ad-hoc and unnotarized; this feature does not constitute a release.

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
