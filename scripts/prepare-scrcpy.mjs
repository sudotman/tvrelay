import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scrcpyVersion = process.env.SCRCPY_VERSION ?? '4.1'
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(repositoryRoot, 'vendor', 'scrcpy')

function assetForCurrentPlatform() {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return `scrcpy-macos-aarch64-v${scrcpyVersion}.tar.gz`
  }

  if (process.platform === 'darwin' && process.arch === 'x64') {
    return `scrcpy-macos-x86_64-v${scrcpyVersion}.tar.gz`
  }

  if (process.platform === 'win32' && process.arch === 'x64') {
    return `scrcpy-win64-v${scrcpyVersion}.zip`
  }

  if (process.platform === 'win32' && process.arch === 'ia32') {
    return `scrcpy-win32-v${scrcpyVersion}.zip`
  }

  throw new Error(`No packaged scrcpy runtime is configured for ${process.platform}-${process.arch}.`)
}

async function download(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'tv-relay-release-build'
    }
  })

  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

function expectedChecksum(checksumText, assetName) {
  const line = checksumText
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().endsWith(assetName))

  if (!line) {
    throw new Error(`The scrcpy checksum manifest does not contain ${assetName}.`)
  }

  return line.trim().split(/\s+/)[0]
}

async function main() {
  const assetName = assetForCurrentPlatform()
  const executableName = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy'
  const markerPath = path.join(outputDirectory, '.relay-scrcpy.json')

  try {
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8'))
    await fs.access(path.join(outputDirectory, executableName))
    if (marker.assetName === assetName) {
      console.log(`scrcpy runtime already prepared: ${assetName}`)
      return
    }
  } catch {
    // Download or refresh the runtime below.
  }

  const releaseBase = `https://github.com/Genymobile/scrcpy/releases/download/v${scrcpyVersion}`
  const [archive, checksumManifest] = await Promise.all([
    download(`${releaseBase}/${assetName}`),
    download(`${releaseBase}/SHA256SUMS.txt`)
  ])
  const checksum = createHash('sha256').update(archive).digest('hex')
  const expected = expectedChecksum(checksumManifest.toString('utf8'), assetName)

  if (checksum !== expected) {
    throw new Error(`Checksum verification failed for ${assetName}.`)
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tv-relay-scrcpy-'))
  const archivePath = path.join(temporaryDirectory, assetName)
  const extractedDirectory = path.join(temporaryDirectory, 'extracted')

  try {
    await fs.mkdir(extractedDirectory)
    await fs.writeFile(archivePath, archive)
    await execFileAsync('tar', ['-xf', archivePath, '-C', extractedDirectory])

    const entries = await fs.readdir(extractedDirectory, { withFileTypes: true })
    const sourceDirectory =
      entries.length === 1 && entries[0].isDirectory()
        ? path.join(extractedDirectory, entries[0].name)
        : extractedDirectory

    await fs.rm(outputDirectory, { recursive: true, force: true })
    await fs.mkdir(path.dirname(outputDirectory), { recursive: true })
    await fs.cp(sourceDirectory, outputDirectory, { recursive: true })

    if (process.platform !== 'win32') {
      await fs.chmod(path.join(outputDirectory, executableName), 0o755)
      await fs.chmod(path.join(outputDirectory, 'adb'), 0o755)
    }

    await fs.writeFile(
      markerPath,
      `${JSON.stringify({ version: scrcpyVersion, assetName, sha256: checksum }, null, 2)}\n`
    )
    console.log(`Prepared verified scrcpy runtime: ${assetName}`)
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  }
}

await main()
