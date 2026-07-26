# tv relay 
open source android tv remote! 

an electron app for controlling any smart tv from macOS or Windows using Electron, React, and TypeScript

the app will work with most android tvs/smart tvs.

[![Demo screenshot of TV Relay desktop application showing the Android TV setup and control interface with dark theme. The left sidebar displays setup options, device roster showing a connected bedroom TV at 192.168.29.40, remote controls for playback and typing, and apps launcher. The main content area shows the configuration panel for connecting with ADB, displaying fields for ADB pair port (37099), connect port (5555), and pair code (654321), along with diagnostics showing both ADB and Native Remote as Ready. The interface has a professional dark blue color scheme with blue accent buttons and status indicators.](https://github.com/sudotman/sudotman/blob/main/demos/tvrelay/ss1.png?raw=true)](https://github.com/sudotman/sudotman/blob/main/demos/tvrelay/ss1.png?raw=true)

## adb vs native

ADB is the default and most broadly useful path. It powers the remote, typing, installed-app discovery and launch, APK sideloading, and screen mirroring.

Native Remote is optional. It can feel faster on TVs where the protocol behaves well, but pairing and reconnect behavior varies by manufacturer. Typing, app management, and scrcpy still use ADB even when Native Remote is active.

Release packages include the official portable scrcpy runtime and its matching ADB binary. Screen mirroring therefore does not depend on the shell `PATH` that happened to exist when the desktop app was opened.

## stack

- Electron
- React
- TypeScript
- Vite via `electron-vite`
- Packaging with `electron-builder`
- Persistence with `electron-store`
- Native discovery via `bonjour-service`
- Native remote protocol via `androidtv-remote`

## project layout

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

## key modules

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

## development

install dependencies:

```bash
npm install
```

start the app in development:

```bash
npm run dev
```

type-check:

```bash
npm run typecheck
```

run tests:

```bash
npm test
```

build production bundles:

```bash
npm run build
```

download and verify the scrcpy runtime used by release packages:

```bash
npm run prepare:scrcpy
```

create packaged artifacts:

```bash
npm run dist
```

build release packages locally without publishing:

```bash
npm run release:build
```

build only macOS release packages locally:

```bash
npm run release:build:mac
```

build only Windows release packages locally:

```bash
npm run release:build:win
```

## versioning and releases

tag driven - github release flow

- run the `Version Bump` GitHub Actions workflow to create the next version, commit the updated `package.json`, and push a matching `v*` tag.
- pushing a `v*` tag triggers the `Release` workflow automatically.
- the release workflow validates the app with `typecheck`, `test`, and `build`, then creates macOS and Windows packages and uploads them to the GitHub Release.

local version helpers are available too:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

these use `npm version`, which updates `package.json`, updates `package-lock.json`, creates a git commit, and creates a matching tag.

for the full release checklist and workflow details, see [docs/RELEASING.md](docs/RELEASING.md).

## testing

current tests cover:

- ADB parser behavior
- mocked ADB integration paths
- reconnect and device-manager logic

real-device manual testing is still important for:

- wireless ADB pairing
- native remote pairing
- connection recovery
- device-specific remote quirks

## contributing
all contributions are welcome. commit, PR and we shall merge!
