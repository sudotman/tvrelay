import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { LaunchableApp } from '@shared/types'
import {
  buildSerial,
  chunkAdbText,
  deriveConnectionState,
  parseAdbDevices,
  parseAdbVersion,
  parseLaunchableApps
} from './parsers'
import type { ConnectionState, SavedDevice } from '@shared/types'

const execFileAsync = promisify(execFile)

export class AdbClient {
  constructor(
    private readonly adbPath: string,
    private readonly defaultTimeoutMs = 8_000
  ) {}

  async version(): Promise<string> {
    const { stdout } = await this.runRaw(['version'])
    return parseAdbVersion(stdout)
  }

  async listDevices(): Promise<Array<{ serial: string; state: string }>> {
    const { stdout } = await this.runRaw(['devices'])
    return parseAdbDevices(stdout)
  }

  async getConnectionState(device: SavedDevice): Promise<ConnectionState> {
    const devices = await this.listDevices()
    return deriveConnectionState(devices, buildSerial(device), device.id)
  }

  async pair(host: string, pairPort: number, code: string): Promise<void> {
    const { stdout, stderr } = await this.runRaw(['pair', `${host}:${pairPort}`, code], { timeoutMs: 15_000 })
    const joined = `${stdout}\n${stderr}`.toLowerCase()

    if (!joined.includes('successfully paired')) {
      throw new Error((stdout || stderr || 'Pairing failed.').trim())
    }
  }

  async connect(host: string, connectPort: number): Promise<void> {
    const { stdout, stderr } = await this.runRaw(['connect', `${host}:${connectPort}`], { timeoutMs: 12_000 })
    const joined = `${stdout}\n${stderr}`.toLowerCase()

    if (!joined.includes('connected to') && !joined.includes('already connected')) {
      throw new Error((stdout || stderr || 'Unable to connect to device.').trim())
    }
  }

  async disconnect(serial?: string): Promise<void> {
    const args = ['disconnect']
    if (serial) {
      args.push(serial)
    }
    await this.runRaw(args)
  }

  async sendKey(serial: string, keyCode: number): Promise<void> {
    await this.runSerial(serial, ['shell', 'input', 'keyevent', String(keyCode)])
  }

  async sendText(serial: string, text: string): Promise<void> {
    const chunks = chunkAdbText(text)

    for (const chunk of chunks) {
      await this.runSerial(serial, ['shell', 'input', 'text', chunk], { timeoutMs: 10_000 })
    }
  }

  async listLaunchableApps(serial: string): Promise<LaunchableApp[]> {
    const categories: Array<{ androidCategory: string; category: 'leanback' | 'launcher' }> = [
      { androidCategory: 'android.intent.category.LEANBACK_LAUNCHER', category: 'leanback' },
      { androidCategory: 'android.intent.category.LAUNCHER', category: 'launcher' }
    ]

    const appsByPackage = new Map<string, LaunchableApp>()

    for (const { androidCategory, category } of categories) {
      const { stdout } = await this.runSerial(serial, [
        'shell',
        'cmd',
        'package',
        'query-intent-activities',
        '--brief',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        androidCategory
      ])

      for (const app of parseLaunchableApps(stdout, category)) {
        if (!appsByPackage.has(app.packageName) || category === 'leanback') {
          appsByPackage.set(app.packageName, app)
        }
      }
    }

    return [...appsByPackage.values()].sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  async launchApp(serial: string, app: LaunchableApp): Promise<void> {
    await this.runSerial(serial, ['shell', 'am', 'start', '-n', app.activity])
  }

  private async runSerial(
    serial: string,
    args: string[],
    options?: { timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    return this.runRaw(['-s', serial, ...args], options)
  }

  private async runRaw(
    args: string[],
    options?: { timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync(this.adbPath, args, {
        timeout: options?.timeoutMs ?? this.defaultTimeoutMs,
        maxBuffer: 2 * 1024 * 1024
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ADB command failed.'
      throw new Error(message)
    }
  }
}
