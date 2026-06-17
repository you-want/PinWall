# Debug Session: autostart-not-registering

Status: OPEN

## Symptom
- Installed `PinWall.app` does not appear in macOS `登录项与扩展` automatically after launch.
- User confirms previous visible entry was manually added, so current flow is not a valid closed-loop pass.

## Expected
- After launching the installed app, it should register itself for autostart automatically.
- The settings toggle and macOS login items should reflect the same real system state.

## Hypotheses
1. The frontend never reaches `enable()` during startup sync.
2. The plugin call reaches `enable()` but macOS rejects registration due to app path or launch shape.
3. `isEnabled()` / local settings sync overwrites the intended default-on behavior.
4. Capability or runtime context blocks plugin guest calls from the current window.
5. Registration succeeds later than expected, but this is less likely than a failed or skipped call.

## Evidence Plan
- Add runtime instrumentation around startup sync and settings toggle.
- Capture whether `isEnabled()`, `enable()`, and persistence paths are actually executed.
- Reproduce on installed app and compare logs before deciding on a fix.
