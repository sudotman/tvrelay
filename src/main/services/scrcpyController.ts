import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { ActionFeedback, ScrcpyPreset, ScrcpyStatus } from '@shared/types'
import type { DeviceManager } from './deviceManager'

const execFileAsync = promisify(execFile)

const INSTALL_HINT =
  process.platform === 'darwin'
    ? 'Install scrcpy with Homebrew: brew install scrcpy.'
    : process.platform === 'win32'
      ? 'Install scrcpy with winget: winget install --exact Genymobile.scrcpy.'
      : 'Install scrcpy from your package manager, then make sure it is on PATH.'

function createFeedback(input: Omit<ActionFeedback, 'id' | 'createdAt'>): ActionFeedback {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...input
  }
}

function candidatePaths(): string[] {
  const candidates = ['scrcpy']

  if (process.platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/scrcpy', '/usr/local/bin/scrcpy')
  }

  if (process.platform === 'win32') {
    candidates.push(
      'scrcpy.exe',
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

  constructor(private readonly deviceManager: DeviceManager) {}

  async getStatus(forceRefresh = false): Promise<ScrcpyStatus> {
    if (this.cachedStatus && !forceRefresh) {
      return this.cachedStatus
    }

    for (const candidate of candidatePaths()) {
      try {
        const { stdout, stderr } = await execFileAsync(candidate, ['--version'], {
          timeout: 6_000,
          maxBuffer: 512 * 1024
        })
        this.cachedStatus = {
          available: true,
          path: candidate,
          version: parseVersion(`${stdout}\n${stderr}`),
          installHint: INSTALL_HINT
        }
        return this.cachedStatus
      } catch {
        // Try the next common location.
      }
    }

    this.cachedStatus = {
      available: false,
      installHint: INSTALL_HINT
    }
    return this.cachedStatus
  }

  async launch(preset: ScrcpyPreset): Promise<ActionFeedback> {
    const status = await this.getStatus()

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

    const args = await this.deviceManager.withAdbAccess(async (serial) => [
      '-s',
      serial,
      ...this.getPresetArgs(preset)
    ])

    const child = spawn(status.path, args, {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    return createFeedback({
      status: 'sent',
      kind: 'scrcpy',
      title: 'scrcpy launched',
      detail:
        preset === 'record'
          ? 'scrcpy opened in recording mode using the active TV over ADB.'
          : 'scrcpy opened as a companion mirror using the active TV over ADB.'
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
