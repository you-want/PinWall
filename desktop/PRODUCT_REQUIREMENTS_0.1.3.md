# PinWall Desktop 0.1.3 Product Requirements

## Theme

Official Widget Hub.

## Goal

Make PinWall's existing local widget capability usable for normal desktop users. Users should be able to discover official widgets, understand requested permissions, install them with one action, and manage installed widgets without using a file picker as the primary path.

## Scope

- Add an official widget catalog in Settings.
- Support one-click installation for bundled official widgets.
- Keep local widget installation available as an advanced trusted-source path.
- Improve permission explanations and risk visibility.
- Improve installed widget management: enable, disable, remove, source, version, and permissions.
- Show user-visible status for install and uninstall success/failure.

## Official Widgets

The initial official catalog uses bundled widgets from `../widgets`:

- Clock: `com.pinwall.clock`
- Weather: `com.pinwall.weather`
- Pomodoro: `com.pinwall.pomodoro`
- System Monitor: `com.pinwall.system-monitor`
- Music Control: `com.pinwall.music`

## Permission Model

Permission risk levels:

- Low: `theme`, `i18n`, `app`
- Medium: `storage`, `notify`, `events`
- High: `network`, `system`, `cards`, `ai`

Requirements:

- Every widget row shows permission chips.
- High-risk permissions are visually distinct.
- Each permission has a plain-language explanation.
- Installing a widget with high-risk permissions requires explicit confirmation.

## Installation

Official install:

- User clicks Install in the official catalog.
- App installs the corresponding bundled widget directory.
- Widget is added to the widget store and enabled by default.
- Desktop renders the widget immediately.
- Settings shows success or failure feedback.

Local install:

- Remains available under an Advanced local install action.
- Copy explains that users should install only trusted widgets.
- Existing manifest, path, enum, file existence, and symlink validation remains required.

## Installed Management

Installed widget rows must support:

- Enable/disable.
- Remove.
- View version, source, category, and default size.
- View permissions and permission explanations.

## Non-goals

- Public marketplace.
- Remote widget download.
- Third-party review workflow.
- Paid widgets.
- Widget auto-update.
- Full SDK documentation site.

## Acceptance Criteria

- Official widget catalog is visible in Settings.
- All five bundled official widgets are listed.
- Official widgets can be installed from Settings without choosing a folder.
- Installed widgets appear on the desktop immediately.
- Installed widgets can be enabled, disabled, and removed.
- Permission chips and explanations are visible for official and installed widgets.
- High-risk permissions require confirmation before installation.
- Local install is still available but marked as advanced/trusted-source only.
- Install and uninstall failures show user-visible feedback.
- `pnpm test:run`, `pnpm build`, and `cargo test` pass before release.
