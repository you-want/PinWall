# PinWall Desktop Release Process

This document describes how to publish a desktop release to GitHub Releases.

## Release Target

- Current release: `v0.1.3`
- GitHub Releases: https://github.com/you-want/PinWall/releases
- Release workflow: `.github/workflows/release.yml`

## What The Automation Does

Pushing a tag like `v0.1.3` runs the `Release` workflow.

The workflow:

1. Checks that the tag version matches:
   - `desktop/package.json`
   - `desktop/src-tauri/tauri.conf.json`
   - `desktop/src-tauri/Cargo.toml`
2. Requires a release note file at `desktop/releases/vX.Y.Z.md`.
3. Runs:
   - `pnpm test:run`
   - `pnpm build`
   - `cargo test`
4. Builds macOS DMGs for:
   - Apple Silicon
   - Intel
5. Creates a universal macOS DMG.
6. Publishes a non-draft GitHub Release with the DMG artifacts attached.

## Prepare A Patch Release

From the repository root:

```bash
cd desktop
pnpm test:run
pnpm build
cd src-tauri
cargo test
```

For app bundle verification:

```bash
cd desktop
pnpm tauri:build:app
```

Update these files before tagging:

- `desktop/package.json`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/Cargo.toml`
- `desktop/releases/vX.Y.Z.md`

Then commit the release changes.

## Publish By Tag

```bash
git tag v0.1.3
git push origin v0.1.3
```

After the workflow completes, check:

- https://github.com/you-want/PinWall/actions
- https://github.com/you-want/PinWall/releases

## Manual Dispatch

The workflow also supports manual dispatch from GitHub Actions.

Use the `Release` workflow and input:

```text
v0.1.3
```

Manual dispatch is useful for rerunning a failed release job, but tag-based release is preferred.

## Post-Release Checks

- Confirm the release is public, not draft.
- Confirm `PinWall-universal.dmg` is attached.
- Download the universal DMG from GitHub Releases.
- Install it on a clean macOS user profile if possible.
- Run the manual checks in `RELEASE_QA.md`.

## Rollback

If a release is bad:

1. Mark the GitHub Release as pre-release or delete the release assets.
2. Leave the git tag in place unless the release was never publicly used.
3. Prepare a new patch version, for example `v0.1.2`.
4. Publish a new fixed release.
