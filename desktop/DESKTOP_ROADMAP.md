# PinWall Desktop Roadmap

## Core Direction

PinWall Desktop is the product mainline. The web app should be treated as an old demo and should not drive product or architecture decisions for now.

The desktop product should be positioned as:

> A transparent macOS desktop note wall and lightweight workspace.

The core value is not generic online notes. It is putting notes, reminders, and small information widgets directly on the user's desktop wallpaper while staying out of the way.

## Product Principles

- Desktop first: optimize for macOS window behavior, local persistence, tray access, shortcuts, click-through, and low interruption.
- Local first: user data should work without an account or network.
- Quiet by default: reminders and cards should stay visible without becoming noisy.
- Stable before broad: a reliable note/reminder experience matters more than adding AI, marketplace, or cloud features early.
- Ecosystem later: widgets and marketplace are valuable, but only after the local widget sandbox and permission model are safe enough.

## Current State

The desktop app already has a solid product skeleton:

- Tauri v2 + React 19 + Vite.
- Three-window model: main wall, settings, and notification.
- Transparent desktop window and local card persistence.
- Card creation, editing, dragging, stacking, reminders, and notification window.
- Settings for appearance, AI, shortcuts, and reminders.
- Early widget system, widget SDK, marketplace service, and developer portal.
- Unit tests currently cover important stores, utilities, bridge behavior, i18n, and reminder-adjacent logic.

Verified baseline:

- `pnpm test:run` in `desktop/` passes.
- Production build was blocked because test files were included by the production TypeScript config. This should be treated as a release-blocking issue.

## Main Problems

### P0: Release Build Must Be Reliable

The Tauri release path depends on `pnpm build`, so the desktop package must have a production TypeScript config that excludes tests and test setup files.

Required outcome:

- `pnpm build` passes from `desktop/`.
- `pnpm tauri build` can rely on the same command.
- CI should run desktop unit tests and production build before creating a release.

### P1: Product Scope Is Too Broad

The desktop app currently mixes:

- Sticky notes.
- Reminders.
- Daily check-in, hydration, eye care, rest, off-work, mood, and holiday cards.
- AI generation, polishing, and quota monitoring.
- Widgets, marketplace, and developer portal.

These features should be layered instead of presented as one flat product.

Recommended layers:

- Core: transparent note wall, dragging, reminders, stacking, local persistence, tray, shortcuts.
- Enhancement: health reminders, hydration, rest, backgrounds, appearance, import/export.
- Experimental: AI, local widgets, marketplace, developer portal.

### P1: Desktop Experience Needs Polishing Before More Features

The user experience must be reliable in everyday desktop use:

- Window click-through should not interfere with normal desktop work.
- Dragging should be smooth.
- Reminders should not repeat unexpectedly.
- App restart should restore state correctly.
- Data should not be lost if settings or stores fail.
- Settings should stay understandable and not expose unfinished systems too early.

### P2: Widget System Is Not Ready For Public Marketplace

Widgets are a strong future direction, but public installation requires a stricter sandbox and permission model.

Current risks to address before public ecosystem:

- `postMessage` should not use wildcard targets once widget origins are controllable.
- Widget manifest IDs need strict validation.
- Local widget paths must be canonicalized and restricted to the app widget directory.
- Network access should support allowlists.
- Sensitive APIs such as cards, AI, and system info need explicit permission UX.
- Marketplace submission must validate package contents, manifest fields, entry files, and permissions.

## Version Plan

### 0.1: Stable Desktop Notes

Goal: ship a reliable installable macOS desktop app.

Scope:

- Transparent desktop note wall.
- Create, edit, drag, collapse, close, stack, and restore cards.
- Reminder scheduling and notification window.
- Local persistence and restart recovery.
- Tray access.
- Keyboard shortcuts.
- Appearance basics: opacity and background.

Do now:

- Fix production build.
- Keep marketplace and developer portal out of the main user path if they are not production ready.
- Run a full manual desktop QA pass.
- Make README and product copy describe the desktop product clearly.

### 0.2: Lightweight Desktop Workspace

Goal: expand from notes into useful local desktop widgets and structured cards.

Scope:

- Official widgets: clock, weather, pomodoro, system monitor.
- Better widget manager.
- Card types: reminder, daily check-in, hydration, rest, eye care.
- Import/export and local backup.
- Cleaner settings organization.

Widgets should still be local/experimental until sandbox hardening is complete.

### 0.3: Safe Widget Ecosystem

Goal: allow third-party widgets safely.

Required before public launch:

- Strict manifest schema validation.
- Path traversal protection.
- Permission review UI.
- Network allowlist or proxy policy.
- Widget package integrity checks.
- Marketplace review workflow.
- SDK and CLI end-to-end documentation.

### 0.4+: Cloud And Commercial Features

Goal: add optional cloud services only after the desktop product is stable.

Possible scope:

- Account-based sync.
- Backup and restore.
- Share pages.
- Paid advanced widgets or sync.
- Managed AI quota.

The old web app can become a supporting surface at this stage, but not the product mainline.

## Implementation Priority

1. Fix desktop production build.
2. Add CI checks for desktop test and build.
3. Update desktop README and product copy to match the desktop-first direction.
4. Hide or label unfinished marketplace/developer features as experimental.
5. Add widget manifest/path validation.
6. Add manual release QA checklist for macOS behavior.
7. Improve settings structure around core, enhancement, and experimental sections.

Current local progress:

- Desktop production build now excludes test files and passes.
- Desktop CI covers frontend unit tests, frontend production build, and Rust tests.
- Release QA checklist is tracked in `RELEASE_QA.md`.
- Local `.app` bundle verification is available via `pnpm tauri:build:app`.
- Local `.app` bundling succeeds; local DMG bundling currently fails at `hdiutil create` with a packaging-environment error and must be rechecked in the release environment.
- Marketplace and developer portal are no longer presented as production-ready settings actions.
- Widget local install now validates manifest ids, enums, relative entry/icon paths, entry/icon file existence, and rejects symlinked package contents.
- Settings are organized into Basics, Note Experience, Care Reminders, and Experimental sections.
- Frontend widget manifest validation now mirrors the Rust-side id/path/enum/size checks, and bundled example widget manifests are covered by tests.
- Widget iframe messages use a scoped target origin instead of wildcard delivery.
- Widget network bridge now blocks non-http protocols, localhost/private-network hosts, sensitive headers, unsupported methods, and credentialed requests.
- Settings now shows widget permission chips and highlights higher-risk permissions such as network, system, cards, and AI.

## Release Readiness Checklist

- `pnpm test:run` passes.
- `pnpm build` passes.
- `pnpm tauri build` produces a macOS app/dmg.
- App starts cleanly after fresh install.
- App starts cleanly after restart with existing data.
- Card CRUD works.
- Dragging and stacking work.
- Reminder notification window appears once and can be dismissed.
- Settings window opens and persists changes.
- Tray menu can show and quit the app.
- No unfinished marketplace/developer workflow is presented as production-ready.
