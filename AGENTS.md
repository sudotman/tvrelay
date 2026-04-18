# AGENTS

This file is for contributors and coding agents working in this repository.

## Mission

Build a practical desktop remote for Android TV that is easy to start, reliable in daily use, and honest about what works well versus what is fragile.

## Product Principles

- Prefer reliability over protocol purity.
- Treat `ADB` as the default and safest path.
- Treat `Native Remote` as optional unless it proves stable on a given TV.
- Keep typing and installed-app launch working through ADB even when native remote is active.
- Avoid UI cleverness that hides the actual state of the app.

## Current UX Direction

- One obvious status area at the top.
- One clear setup flow.
- ADB setup first.
- Native remote clearly labeled as optional / less reliable.
- Remote and apps views should be unavailable or clearly empty when no TV is connected.

## Architecture Rules

- Renderer must not shell out directly.
- All ADB and native-remote work lives in the Electron main process.
- Renderer communicates through typed IPC only.
- Shared contracts live in `src/shared`.
- Device capability decisions should flow from `DeviceManager`.

## Connection Strategy

- Default to `preferredBackend: 'adb'` for new setup flows unless there is a strong reason not to.
- If native pairing is pending and the user switches to ADB, clear the native session fully.
- Do not imply native is better than ADB unless the implementation actually supports that claim.
- When a feature still requires ADB, say so plainly in both code and UI.

## Editing Guidance

- Keep frontend hierarchy simple.
- Reduce surface area before adding explanatory UI.
- Avoid turning the interface into a wall of equally weighted cards.
- Prefer straightforward labels over product copy flourishes.
- When changing setup behavior, verify both the visual flow and the fallback behavior.

## Important Files

- `src/main/services/deviceManager.ts`
  Source of truth for connection order, active backend, reconnects, and capabilities.
- `src/main/services/adb/adbClient.ts`
  ADB command execution and parsing.
- `src/main/services/native/nativeRemoteService.ts`
  Native remote discovery, pairing, and control.
- `src/main/services/remoteController.ts`
  Maps remote commands to the active backend.
- `src/main/services/appController.ts`
  App discovery and launch through ADB.
- `src/renderer/src/App.tsx`
  Main UI flow.
- `src/renderer/src/styles.css`
  Visual hierarchy and layout.

## Validation Checklist

Before wrapping work, run:

```bash
npm run typecheck
npm test
npm run build
```

At minimum, `typecheck` and `build` should pass for UI or service changes.

## When Adding Features

- Ask whether the feature belongs to ADB, native remote, or both.
- Document any backend-specific limitation in the UI.
- Avoid silently degrading into a broken state.
- Prefer a visible fallback path over hidden automatic behavior when users need to understand what is happening.

## When Touching Native Remote

- Assume TV behavior varies.
- Preserve a clean cancel path for pairing.
- Do not block ADB usage behind native setup.
- Treat “TV did not show a code” as a first-class failure case.

## When Touching Setup UX

- The user should always know:
  - which TV is selected
  - whether anything is connected
  - which backend is in use
  - what to do next

- If the screen does more than that, simplify it.
