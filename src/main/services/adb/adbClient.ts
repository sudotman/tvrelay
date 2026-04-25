import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import pkg from 'node-apk'
import type { Apk as ApkType, Resource, Resources } from 'node-apk'
import type { DiscoveredAdbService, LaunchableApp } from '@shared/types'
import {
  buildSerial,
  chunkAdbText,
  deriveConnectionState,
  parseAdbMdnsServices,
  parseForegroundApp,
  parseAdbDevices,
  parseAdbVersion,
  parseLaunchableApps
} from './parsers'

const { Apk } = pkg
import type { ConnectionState, ForegroundApp, SavedDevice } from '@shared/types'

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

  async killServer(): Promise<void> {
    await this.runRaw(['kill-server'], { timeoutMs: 5_000 })
  }

  async startServer(): Promise<void> {
    await this.runRaw(['start-server'], { timeoutMs: 8_000 })
  }

  async restartServer(): Promise<void> {
    await this.killServer()
    await this.startServer()
  }

  async listMdnsServices(): Promise<DiscoveredAdbService[]> {
    const { stdout } = await this.runRaw(['mdns', 'services'], { timeoutMs: 8_000 })
    return parseAdbMdnsServices(stdout)
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

  async wakeUp(serial: string): Promise<void> {
    await this.sendKey(serial, 224)
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
    const failures: Error[] = []

    for (const { androidCategory, category } of categories) {
      try {
        const apps = await this.listAppsForCategory(serial, androidCategory, category)

        for (const app of apps) {
          if (!appsByPackage.has(app.packageName) || category === 'leanback') {
            appsByPackage.set(app.packageName, app)
          }
        }
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error('App discovery failed.'))
      }
    }

    if (appsByPackage.size === 0 && failures.length > 0) {
      throw failures[0]
    }

    const apps = [...appsByPackage.values()].sort((left, right) => left.displayName.localeCompare(right.displayName))
    return this.enrichAppsMetadata(serial, apps)
  }

  async launchApp(serial: string, app: LaunchableApp): Promise<void> {
    await this.runSerial(serial, ['shell', 'am', 'start', '-n', app.activity])
  }

  async launchPackage(serial: string, packageName: string): Promise<void> {
    await this.runSerial(serial, ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'])
  }

  async openAppInfo(serial: string, packageName: string): Promise<void> {
    await this.runSerial(serial, [
      'shell',
      'am',
      'start',
      '-a',
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      '-d',
      `package:${packageName}`
    ])
  }

  async installApk(serial: string, apkPath: string): Promise<void> {
    const { stdout, stderr } = await this.runRaw(['-s', serial, 'install', '-r', apkPath], {
      timeoutMs: 180_000
    })
    const joined = `${stdout}\n${stderr}`.toLowerCase()

    if (!joined.includes('success')) {
      throw new Error((stdout || stderr || 'APK install failed.').trim())
    }
  }

  async getForegroundApp(serial: string): Promise<ForegroundApp | null> {
    const windowDump = await this.runSerial(serial, ['shell', 'dumpsys', 'window', 'windows'], {
      timeoutMs: 12_000
    })
    const parsed = parseForegroundApp(windowDump.stdout)

    if (parsed) {
      return parsed
    }

    const activityDump = await this.runSerial(serial, ['shell', 'dumpsys', 'activity', 'activities'], {
      timeoutMs: 12_000
    })
    return parseForegroundApp(activityDump.stdout)
  }

  private async runSerial(
    serial: string,
    args: string[],
    options?: { timeoutMs?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    return this.runRaw(['-s', serial, ...args], options)
  }

  private async enrichAppsMetadata(serial: string, apps: LaunchableApp[]): Promise<LaunchableApp[]> {
    const enriched: LaunchableApp[] = []

    for (const app of apps) {
      enriched.push(await this.enrichAppMetadata(serial, app))
    }

    return enriched.sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  private async enrichAppMetadata(serial: string, app: LaunchableApp): Promise<LaunchableApp> {
    let tempDir: string | null = null
    let apkPath: string | null = null

    try {
      const remoteApkPath = await this.getRemoteApkPath(serial, app.packageName)

      if (!remoteApkPath) {
        return app
      }

      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'android-tv-remote-apk-'))
      apkPath = path.join(tempDir, `${randomUUID()}.apk`)

      await this.runRaw(['-s', serial, 'pull', remoteApkPath, apkPath], {
        timeoutMs: 120_000
      })

      const apk = new Apk(apkPath)

      try {
        const [manifest, resources] = await Promise.all([apk.getManifestInfo(), apk.getResources()])
        const displayName = this.resolveAppLabel(manifest.applicationLabel, resources) ?? app.displayName
        const iconDataUrl = await this.resolveAppIconDataUrl(apk, manifest.applicationIcon, resources)

        return {
          ...app,
          displayName,
          iconDataUrl: iconDataUrl ?? app.iconDataUrl
        }
      } finally {
        apk.close()
      }
    } catch {
      return app
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true })
      } else if (apkPath) {
        await fs.rm(apkPath, { force: true })
      }
    }
  }

  private async getRemoteApkPath(serial: string, packageName: string): Promise<string | null> {
    try {
      const { stdout } = await this.runSerial(serial, ['shell', 'pm', 'path', packageName], {
        timeoutMs: 10_000
      })

      const apkPaths = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('package:'))
        .map((line) => line.slice('package:'.length))

      return apkPaths.find((item) => item.endsWith('base.apk')) ?? apkPaths[0] ?? null
    } catch {
      return null
    }
  }

  private resolveAppLabel(labelValue: string | number, resources: Resources): string | null {
    if (typeof labelValue === 'string' && labelValue.trim()) {
      return labelValue.trim()
    }

    if (typeof labelValue !== 'number') {
      return null
    }

    const resource = this.pickBestStringResource(resources.resolve(labelValue))
    return typeof resource?.value === 'string' && resource.value.trim() ? resource.value.trim() : null
  }

  private async resolveAppIconDataUrl(apk: ApkType, iconResourceId: number, resources: { resolve(id: number): Resource[] }): Promise<string | null> {
    if (!iconResourceId) {
      return null
    }

    const resource = this.pickBestIconResource(resources.resolve(iconResourceId))

    if (!resource || typeof resource.value !== 'string') {
      return null
    }

    const mimeType = this.getIconMimeType(resource.value)

    if (!mimeType) {
      return null
    }

    const iconBytes = await apk.extract(resource.value)
    return `data:${mimeType};base64,${iconBytes.toString('base64')}`
  }

  private pickBestStringResource(resources: Resource[]): Resource | null {
    const englishResource =
      resources.find((resource) => typeof resource.value === 'string' && resource.locale?.language === 'en') ??
      resources.find((resource) => typeof resource.value === 'string' && !resource.locale?.language) ??
      resources.find((resource) => typeof resource.value === 'string')

    return englishResource ?? null
  }

  private pickBestIconResource(resources: Resource[]): Resource | null {
    const ranked = resources
      .filter((resource) => typeof resource.value === 'string')
      .sort((left, right) => this.rankIconPath(String(right.value)) - this.rankIconPath(String(left.value)))

    return ranked[0] ?? null
  }

  private rankIconPath(resourcePath: string): number {
    const normalized = resourcePath.toLowerCase()

    if (normalized.endsWith('.png')) {
      return 90 + this.rankIconDensity(normalized)
    }

    if (normalized.endsWith('.webp')) {
      return 80 + this.rankIconDensity(normalized)
    }

    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
      return 70 + this.rankIconDensity(normalized)
    }

    return this.rankIconDensity(normalized)
  }

  private rankIconDensity(resourcePath: string): number {
    if (resourcePath.includes('xxxhdpi')) return 60
    if (resourcePath.includes('xxhdpi')) return 50
    if (resourcePath.includes('xhdpi')) return 40
    if (resourcePath.includes('hdpi')) return 30
    if (resourcePath.includes('mdpi')) return 20
    if (resourcePath.includes('drawable')) return 10
    return 0
  }

  private getIconMimeType(resourcePath: string): string | null {
    const normalized = resourcePath.toLowerCase()

    if (normalized.endsWith('.png')) {
      return 'image/png'
    }

    if (normalized.endsWith('.webp')) {
      return 'image/webp'
    }

    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
      return 'image/jpeg'
    }

    return null
  }

  private async listAppsForCategory(
    serial: string,
    androidCategory: string,
    category: 'leanback' | 'launcher'
  ): Promise<LaunchableApp[]> {
    let lastError: Error | null = null

    for (const args of this.getCategoryQueryCommands(androidCategory)) {
      try {
        const { stdout } = await this.runSerial(serial, args, { timeoutMs: 12_000 })
        return parseLaunchableApps(stdout, category)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('App discovery failed.')
      }
    }

    try {
      return await this.listAppsByResolvingPackages(serial, androidCategory, category)
    } catch (error) {
      throw lastError ?? (error instanceof Error ? error : new Error('App discovery failed.'))
    }
  }

  private getCategoryQueryCommands(androidCategory: string): string[][] {
    return [
      [
        'shell',
        'cmd',
        'package',
        'query-intent-activities',
        '--brief',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        androidCategory
      ],
      [
        'shell',
        'pm',
        'query-intent-activities',
        '--brief',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        androidCategory
      ]
    ]
  }

  private async listAppsByResolvingPackages(
    serial: string,
    androidCategory: string,
    category: 'leanback' | 'launcher'
  ): Promise<LaunchableApp[]> {
    const packages = await this.listInstalledPackages(serial)
    const apps: LaunchableApp[] = []

    for (const packageName of packages) {
      const app = await this.resolveLaunchableActivity(serial, packageName, androidCategory, category)

      if (app) {
        apps.push(app)
      }
    }

    return apps
  }

  private async listInstalledPackages(serial: string): Promise<string[]> {
    const { stdout } = await this.runSerial(serial, ['shell', 'pm', 'list', 'packages'], { timeoutMs: 20_000 })

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('package:'))
      .map((line) => line.slice('package:'.length))
  }

  private async resolveLaunchableActivity(
    serial: string,
    packageName: string,
    androidCategory: string,
    category: 'leanback' | 'launcher'
  ): Promise<LaunchableApp | null> {
    for (const args of [
      [
        'shell',
        'cmd',
        'package',
        'resolve-activity',
        '--brief',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        androidCategory,
        packageName
      ],
      [
        'shell',
        'pm',
        'resolve-activity',
        '--brief',
        '-a',
        'android.intent.action.MAIN',
        '-c',
        androidCategory,
        packageName
      ]
    ]) {
      try {
        const { stdout } = await this.runSerial(serial, args, { timeoutMs: 5_000 })
        return parseLaunchableApps(stdout, category)[0] ?? null
      } catch {
        // Some TVs expose only one of these shell entry points.
      }
    }

    return null
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
