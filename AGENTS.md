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

The direction is **Ambient**: one warm dark room, one glass surface, one accent.

- A floating segmented control at the top centre carries the four views: Remote, Apps, Setup, Phone.
- The top bar always answers "which TV, which backend, connected or not" through the device chip.
  Wake and Disconnect live inside that chip's popover, not as separate buttons.
- One clear setup flow. ADB setup first.
- Native remote stays collapsed and clearly labeled as optional / less reliable.
- Remote and apps views should be unavailable or clearly empty when no TV is connected.
- The remote view is the hero, and it is deliberately sparse: one glass panel holding now-playing,
  an oversized soft pad, and volume. Back, Home, Play/Pause, pinned keys, Type, Mirror and More sit
  under it as pills.
- Everything else — the full key grids, typing, scrcpy, sideloading, shortcuts and pad customisation
  — lives in the More sheet. The sheet is always one click away and never holds connection state.
- The pad takes taps on its four edges and flicks anywhere on its face, on both desktop and phone.
- Dark only. There is no light theme and no theme toggle.
- Never invent a value the backend cannot report. Volume is a rocker, not a slider, because ADB
  moves volume but never reads it back.

## Design System

Three rules hold the look together. Breaking one is what makes the app feel half-finished, so
treat them as constraints rather than suggestions.

1. **Ember is the only fill that means "press me."** Nothing else out-shouts it — not white, not
   a semantic colour. Selected states use glass and weight, not a filled pill. Semantic colour
   (`--live` / `--warning` / `--danger`) reports state and is never the accent.
2. **Every value comes from a token.** Type sizes (`--t-*`), weights (`--w-*`), space (`--s-*`),
   radii, shadows and durations are all declared in the `:root` block. No ad-hoc `0.83rem`, no
   `font-weight: 550` — the system faces do not have it. If a value is missing, add it to the
   scale rather than writing a literal.
3. **Everything pressable moves the same way.** One shared rule sinks every control by the same
   amount on the same curve. Positioned elements use the `translate` property for placement so
   `scale` stays free for the press.

Motion is three durations (`--dur-1/2/3`) and three curves (`--ease`, `--ease-out`,
`--ease-spring`). Views, sheets and the palette animate in *and* out; the segmented controls move
a thumb rather than repainting a pill. Everything is covered by one `prefers-reduced-motion` rule.

The ambient wash is light, not tint — weak enough that a card sitting on it never looks stained,
with a grain layer so the falloff does not band. `src/renderer/src/styles.css` and
`src/main/web/app.css` carry the same token vocabulary; a change to one usually belongs in both.

## Architecture Rules

- Renderer must not shell out directly.
- All ADB and native-remote work lives in the Electron main process.
- Renderer communicates through typed IPC only.
- Shared contracts live in `src/shared`.
- Device capability decisions should flow from `DeviceManager`.
- Renderer state lives in `useRelayState`; views read it through `RelayContext` instead of prop drilling.
- Presentation helpers that are not React live in `viewModel.ts` so they stay unit-testable.
- The phone remote is a client of the same controllers the desktop UI uses. It must never reach the TV directly.

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
- `src/main/services/web/webRemoteServer.ts`
  LAN HTTP server for the phone remote: static assets, token-guarded API, SSE state stream.
- `src/main/web/`
  The phone UI. Inlined into the main bundle through `?raw` imports in `services/web/assets.ts`.
- `src/renderer/src/App.tsx`
  Shell, global keyboard handling, and view switching.
- `src/renderer/src/useRelayState.ts`
  All renderer state and IPC calls.
- `src/renderer/src/styles.css`
  Design tokens, then components in the order the shell renders them.
- `src/renderer/src/components/Sheet.tsx`
  The More sheet. The one place the remote view is allowed to hide anything.
- `src/renderer/src/components/DirectionPad.tsx`
  The soft pad, including the pointer-flick handling that suppresses the click after a swipe.
- `scripts/generate-icons.mjs`
  Draws the Relay mark and writes `build/icon.png`, `build/icon.icns` and `build/icon.ico`.

## Validation Checklist

Before wrapping work, run:

```bash
npm run typecheck
npm test
npm run build
```

At minimum, `typecheck` and `build` should pass for UI or service changes.

## Release Workflow

- The packaged product is **Relay** (`build.productName`). `build.appId` deliberately keeps the
  older `com.satyamkashyap.androidtvremote` value, because on Windows the app id is what NSIS uses
  to recognise an existing install.
- App icons are generated, not hand-drawn: run `npm run generate:icons` after touching
  `scripts/generate-icons.mjs`, and keep `src/main/web/icon.svg` in step with it. Commit the
  regenerated `build/` files.
- Prefer the GitHub Actions release flow over manual one-off packaging.
- Use the `Version Bump` workflow or `npm version` to change app versions so `package.json`, `package-lock.json`, commit history, and tags stay aligned.
- Treat `v*` git tags as release triggers.
- Keep release docs in `README.md` and `docs/RELEASING.md` accurate when the workflow changes.
- If release packaging or version scripts change, make sure the markdown explains the new path clearly.

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

## When Touching the Phone Remote

- It stays off by default. Turning it on is an explicit, visible choice.
- Never widen the bind beyond the LAN, and never drop the token check on `/api/*`.
- Rotating the token must sign every phone out.
- Keep the phone UI dependency-free and inlined; packaged builds must not need a static directory on disk.
- Changing the phone UI means re-running the phone-side checks by hand on a real phone, not just in a desktop browser.

## When Touching Setup UX

- The user should always know:
  - which TV is selected
  - whether anything is connected
  - which backend is in use
  - what to do next

- If the screen does more than that, simplify it.
