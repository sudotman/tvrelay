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
- creates a GitHub Release
- uploads the generated artifacts to that release

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

- macOS signing is intentionally not auto-discovered in CI right now.
- The release workflow is designed to publish unsigned artifacts unless you add signing secrets later.
- `scripts/prepare-scrcpy.mjs` pins the scrcpy version used by release packages. Update that version only after checking the official release assets for macOS ARM64, macOS x64, Windows x64, and Windows x86.
- Packaged builds do not depend on a terminal `PATH` for scrcpy or ADB. The launcher passes the packaged ADB path through scrcpy's supported `ADB` environment override.
- If packaging targets or release naming change, update this file and `README.md` in the same change.
