# Releasing

This repository uses a simple two-step GitHub Actions release flow:

1. Bump the app version.
2. Let the tag-based release workflow build and publish the release.

## Recommended Path

Use the `Version Bump` workflow in GitHub Actions.

- Choose `patch`, `minor`, or `major`.
- Or provide `explicit_version` if you need an exact version.
- The workflow runs `npm version`, commits the version change, and pushes a matching `v*` tag.

That tag automatically triggers the `Release` workflow.

## What The Release Workflow Does

On every `v*` tag:

- installs dependencies with `npm ci`
- runs `npm run typecheck`
- runs `npm test`
- runs `npm run build`
- downloads the pinned official scrcpy portable runtime and verifies its SHA-256 checksum
- packages scrcpy and its matching ADB binary inside the app
- builds macOS packages on `macos-latest`
- builds Windows packages on `windows-latest`
- checks the packaged app carries the real app icon, not Electron's default
- creates a GitHub Release titled `Relay <version>`
- uploads the generated artifacts to that release

## Naming And Icons

The packaged app is **Relay**. That name comes from `build.productName` in
`package.json` and flows into the macOS bundle, the Windows shortcut, the DMG
volume, and the artifact filenames.

Artifacts are named `Relay-<version>-<os>-<arch>.<ext>`, for example:

```text
Relay-0.2.0-mac-arm64.dmg
Relay-0.2.0-mac-arm64.zip
Relay-0.2.0-win-x64.exe
Relay-0.2.0-win-x64.zip
```

Icons live in `build/` and are generated from a single procedural source:

```bash
npm run generate:icons
```

That writes three files, all committed:

| File | Used by |
| --- | --- |
| `build/icon.icns` | the macOS app bundle and the DMG |
| `build/icon.ico` | the Windows executable, the NSIS installer, and the uninstaller |
| `build/icon.png` | Linux and electron-builder's generic fallback |

`scripts/generate-icons.mjs` draws the mark directly rather than rasterising an
SVG, because the toolchain has no rasteriser and nothing here is worth a native
image dependency. The macOS variant sits inside a squircle with the margin
Apple expects; the Windows variant runs edge to edge, because Windows does not
mask icons. Both match `src/main/web/icon.svg`, which is the phone remote's PWA
icon — change one and change the other.

The release workflow fails if `build/icon.icns` or `build/icon.ico` is missing,
and the macOS job additionally asserts that the packaged bundle contains
`icon.icns` and no longer contains Electron's default `electron.icns`.

## Local Versioning

If you want to bump locally instead of using GitHub Actions:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

These commands:

- update `package.json`
- update `package-lock.json`
- create a git commit
- create a matching git tag

Push both the branch and tag after that:

```bash
git push origin main
git push origin --tags
```

## Local Packaging

Build release packages locally without publishing:

```bash
npm run release:build
```

Build only macOS packages:

```bash
npm run release:build:mac
```

Build only Windows packages:

```bash
npm run release:build:win
```

## Notes

- `build.appId` deliberately stays `com.satyamkashyap.androidtvremote` even
  though the product is now called Relay. On Windows the app id is what NSIS
  uses to recognise an existing install, so changing it would leave upgraders
  with two entries in Add/Remove Programs.
- Renaming the product moved Electron's `userData` directory. `migrateLegacyUserData`
  in `src/main/index.ts` copies saved TVs and pairing certificates across on
  first launch, and can be deleted once nobody is upgrading from a build called
  "Android TV Remote".
- macOS artifacts are built for the architecture of the GitHub runner, which is
  Apple silicon. Intel Macs are not currently covered by the release.
- macOS signing is intentionally not auto-discovered in CI right now.
- The release workflow is designed to publish unsigned artifacts unless you add signing secrets later.
- `scripts/prepare-scrcpy.mjs` pins the scrcpy version used by release packages. Update that version only after checking the official release assets for macOS ARM64, macOS x64, Windows x64, and Windows x86.
- Packaged builds do not depend on a terminal `PATH` for scrcpy or ADB. The launcher passes the packaged ADB path through scrcpy's supported `ADB` environment override.
- If packaging targets or release naming change, update this file and `README.md` in the same change.
