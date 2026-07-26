import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { ActionFeedback, ScrcpyPreset, ScrcpyStatus } from '@shared/types'
import type { DeviceManager } from './deviceManager'
import type { AdbLocator } from './adb/adbLocator'

const execFileAsync = promisify(execFile)
const STATUS_CACHE_MS = 30_000
const LAUNCH_GRACE_MS = 650

function installHint(): string {
  if (app.isPackaged) {
    return 'The bundled scrcpy component is missing or damaged. Reinstall the latest Relay release.'
  }

  return process.platform === 'darwin'
    ? 'Run `npm run prepare:scrcpy`, or install scrcpy with Homebrew.'
    : process.platform === 'win32'
      ? 'Run `npm run prepare:scrcpy`, or install scrcpy with WinGet.'
      : 'Install scrcpy from your package manager, then make sure it is on PATH.'
}

function createFeedback(input: Omit<ActionFeedback, 'id' | 'createdAt'>): ActionFeedback {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...input
  }
}

function candidatePaths(): string[] {
  const executableName = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy'
  const candidates = [
    path.join(process.resourcesPath, 'scrcpy', executableName),
    path.join(app.getAppPath(), 'vendor', 'scrcpy', executableName),
    executableName
  ]

  if (process.platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/scrcpy', '/usr/local/bin/scrcpy')
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'scrcpy.exe'))
    }

    candidates.push(
      'C:\\Program Files\\scrcpy\\scrcpy.exe',
      'C:\\Program Files (x86)\\scrcpy\\scrcpy.exe'
    )
  }

  return [...new Set(candidates)]
}

function parseVersion(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith('scrcpy')) ?? 'scrcpy detected'
}

export class ScrcpyController {
  private cachedStatus: ScrcpyStatus | null = null
  private cachedStatusAt = 0

  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly adbLocator: AdbLocator
  ) {}

  async getStatus(forceRefresh = false): Promise<ScrcpyStatus> {
    if (this.cachedStatus && !forceRefresh && Date.now() - this.cachedStatusAt < STATUS_CACHE_MS) {
      return this.cachedStatus
    }

    for (const candidate of candidatePaths()) {
      try {
        const { stdout, stderr } = await execFileAsync(candidate, ['--version'], {
          cwd: path.dirname(candidate),
          timeout: 6_000,
          maxBuffer: 512 * 1024
        })
        this.cachedStatus = {
          available: true,
          path: candidate,
          version: parseVersion(`${stdout}\n${stderr}`),
          installHint: installHint()
        }
        this.cachedStatusAt = Date.now()
        return this.cachedStatus
      } catch {
        // Try the next common location.
      }
    }

    this.cachedStatus = {
      available: false,
      installHint: installHint()
    }
    this.cachedStatusAt = Date.now()
    return this.cachedStatus
  }

  async launch(preset: ScrcpyPreset): Promise<ActionFeedback> {
    const status = await this.getStatus(true)

    if (!status.available || !status.path) {
      return createFeedback({
        status: 'blocked',
        kind: 'scrcpy',
        title: 'scrcpy is not installed',
        detail: status.installHint
      })
    }

    const activeDevice = this.deviceManager.getActiveDevice()
    if (!activeDevice) {
      throw new Error('Connect to a TV before opening scrcpy.')
    }

    const adbInfo = await this.adbLocator.locate()
    if (!adbInfo.available || !adbInfo.path) {
      return createFeedback({
        status: 'blocked',
        kind: 'scrcpy',
        title: 'ADB is not available',
        detail: adbInfo.installHint
      })
    }

    const args = await this.deviceManager.withAdbAccess(async (serial) => [
      '-s',
      serial,
      ...this.getPresetArgs(preset)
    ])

    const child = spawn(status.path, args, {
      cwd: path.dirname(status.path),
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        // scrcpy officially supports ADB as an explicit binary override. This
        // avoids relying on PATH when Relay is opened from Finder/Start Menu.
        ADB: adbInfo.path
      },
      windowsHide: false
    })

    await new Promise<void>((resolve, reject) => {
      let launched = false

      const launchTimer = setTimeout(() => {
        launched = true
        child.removeListener('error', onError)
        child.removeListener('exit', onExit)
        child.unref()
        resolve()
      }, LAUNCH_GRACE_MS)

      const onError = (error: Error) => {
        clearTimeout(launchTimer)
        reject(error)
      }

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (launched) {
          return
        }

        clearTimeout(launchTimer)
        reject(
          new Error(
            `scrcpy exited before opening${code === null ? '' : ` (code ${code})`}${signal ? ` (${signal})` : ''}.`
          )
        )
      }

      child.once('error', onError)
      child.once('exit', onExit)
    })

    return createFeedback({
      status: 'sent',
      kind: 'scrcpy',
      title: 'scrcpy launched',
      detail:
        preset === 'record'
          ? 'scrcpy opened in recording mode with Relay’s packaged ADB runtime.'
          : 'scrcpy opened as a companion mirror with Relay’s packaged ADB runtime.'
    })
  }

  private getPresetArgs(preset: ScrcpyPreset): string[] {
    if (preset === 'fast') {
      return ['--max-size', '1280', '--max-fps', '30', '--no-audio']
    }

    if (preset === 'high_quality') {
      return ['--max-size', '1920', '--max-fps', '60']
    }

    if (preset === 'no_audio') {
      return ['--no-audio']
    }

    const videosPath = app.getPath('videos') || app.getPath('desktop')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return ['--record', path.join(videosPath, `android-tv-${timestamp}.mkv`)]
  }
}
