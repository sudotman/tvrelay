# Android TV Remote

Desktop app for controlling an Android TV from macOS or Windows using Electron, React, and TypeScript.

The app supports two connection paths:

- `ADB`: the most reliable path in this project today. It powers navigation, media controls, text input, and installed-app launch.
- `Native Remote`: the Android TV Remote Service path used by Google TV style software remotes. It can be more convenient when it works, but it is less consistent across TVs.

## Current Product Direction

- Prefer `ADB` as the default setup path.
- Keep `Native Remote` available as an optional extra.
- Fall back to ADB-backed features for typing and installed apps even when the active control path is native.

## Why Native Exists

Native remote has a few real advantages:

- It does not depend on developer options or wireless ADB setup.
- It is closer to the built-in “phone remote” experience on supported TVs.
- It can be useful for simple navigation and media controls on TVs where ADB is unavailable.

But in this codebase, ADB is still the better daily-driver path because:

- it is more predictable
- text input is ADB-backed
- installed-app discovery and launch are ADB-backed
- native pairing behavior varies by TV and sometimes fails to surface a code prompt reliably

## Stack

- Electron
- React
- TypeScript
- Vite via `electron-vite`
- Packaging with `electron-builder`
- Persistence with `electron-store`
- Native discovery via `bonjour-service`
- Native remote protocol via `androidtv-remote`

## Project Layout

```text
src/
  main/
    index.ts
    ipc.ts
    services/
      adb/
        adbClient.ts
        adbLocator.ts
        parsers.ts
      native/
        nativeRemoteService.ts
      appController.ts
      deviceManager.ts
      deviceStore.ts
      remoteController.ts
  preload/
    index.ts
  renderer/
    index.html
    src/
      App.tsx
      main.tsx
      styles.css
  shared/
    ipc.ts
    types.ts
```

## Key Modules

- `src/main/services/deviceManager.ts`
  Coordinates saved devices, active device state, native-vs-ADB connection order, reconnects, and capability exposure.
- `src/main/services/adb/adbClient.ts`
  Wraps shelling out to local `adb` for connect, pair, key events, text, and app launch.
- `src/main/services/native/nativeRemoteService.ts`
  Handles mDNS discovery and native remote pairing/control.
- `src/main/services/remoteController.ts`
  Sends remote actions through the active backend.
- `src/main/services/appController.ts`
  Lists and launches installed apps through ADB access.
- `src/renderer/src/App.tsx`
  Main desktop UI and setup flow.

## Development

Install dependencies:

```bash
npm install
```

Start the app in development:

```bash
npm run dev
```

Type-check:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build production bundles:

```bash
npm run build
```

Create packaged artifacts:

```bash
npm run dist
```

Build release packages locally without publishing:

```bash
npm run release:build
```

Build only macOS release packages locally:

```bash
npm run release:build:mac
```

Build only Windows release packages locally:

```bash
npm run release:build:win
```

## Versioning And Releases

This repo now uses a tag-driven GitHub release flow.

- Run the `Version Bump` GitHub Actions workflow to create the next version, commit the updated `package.json`, and push a matching `v*` tag.
- Pushing a `v*` tag triggers the `Release` workflow automatically.
- The release workflow validates the app with `typecheck`, `test`, and `build`, then creates macOS and Windows packages and uploads them to the GitHub Release.

Local version helpers are available too:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

These use `npm version`, which updates `package.json`, updates `package-lock.json`, creates a git commit, and creates a matching tag.

For the full release checklist and workflow details, see [docs/RELEASING.md](docs/RELEASING.md).

## Testing

Current tests cover:

- ADB parser behavior
- mocked ADB integration paths
- reconnect and device-manager logic

Real-device manual testing is still important for:

- wireless ADB pairing
- native remote pairing
- connection recovery
- device-specific remote quirks

## Known Limitations

- Native remote is less reliable than ADB on some TVs.
- Direct text input and installed-app browsing still depend on ADB.
- Windows packaging exists in config but should be verified on Windows hardware.
- TV-specific behaviors can differ even when the protocol path is nominally supported.

## Recommended Usage

1. Choose a TV.
2. Connect with ADB first.
3. Use native remote only if you specifically want it and the TV behaves well with it.
