import { EventEmitter } from 'node:events'
import type { AppUpdateStatus } from '@shared/types'

const REPO_OWNER = 'sudotman'
const REPO_NAME = 'tvrelay'

interface GithubRelease {
  tag_name: string
  html_url: string
}

/** The slice of electron-updater's `autoUpdater` this service drives. Narrowed so it can be faked in tests. */
export interface AutoUpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-not-available', listener: () => void): unknown
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

type UpdateServiceEvents = {
  status: [AppUpdateStatus]
}

export interface UpdateServiceOptions {
  platform: NodeJS.Platform
  currentVersion: string
  isPackaged: boolean
  /** Windows only: the real electron-updater `autoUpdater`, or a fake in tests. Omitted on mac. */
  autoUpdater?: AutoUpdaterLike
  fetchLatestRelease?: () => Promise<GithubRelease>
  openExternal?: (url: string) => Promise<void>
}

/**
 * Windows gets electron-updater's silent download/install flow. The mac build ships unsigned
 * and unnotarized, and Squirrel.Mac refuses to verify an update against an unsigned running app,
 * so mac just compares against the latest GitHub release and hands the user a link.
 */
export class UpdateService extends EventEmitter<UpdateServiceEvents> {
  private readonly platform: NodeJS.Platform
  private readonly isPackaged: boolean
  private readonly autoUpdater: AutoUpdaterLike | null
  private readonly fetchLatestRelease: () => Promise<GithubRelease>
  private readonly openExternal: (url: string) => Promise<void>
  private status: AppUpdateStatus
  private checking = false

  constructor(options: UpdateServiceOptions) {
    super()
    this.platform = options.platform
    this.isPackaged = options.isPackaged
    this.autoUpdater = options.platform === 'win32' ? (options.autoUpdater ?? null) : null
    this.fetchLatestRelease = options.fetchLatestRelease ?? fetchLatestGithubRelease
    this.openExternal = options.openExternal ?? (async () => undefined)
    this.status = {
      state: 'idle',
      currentVersion: options.currentVersion,
      canAutoInstall: this.autoUpdater !== null
    }

    if (this.autoUpdater) {
      this.wireAutoUpdater(this.autoUpdater)
    }
  }

  getStatus(): AppUpdateStatus {
    return this.status
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    if (!this.isPackaged || this.checking) {
      return this.status
    }

    this.checking = true

    try {
      if (this.autoUpdater) {
        await this.autoUpdater.checkForUpdates()
      } else if (this.platform === 'darwin') {
        await this.checkGithubReleaseDirectly()
      }
    } catch (error) {
      this.setStatus({ state: 'error', message: describeError(error) })
    } finally {
      this.checking = false
    }

    return this.status
  }

  async openReleasePage(): Promise<void> {
    if (this.status.releaseUrl) {
      await this.openExternal(this.status.releaseUrl)
    }
  }

  quitAndInstall(): void {
    if (this.autoUpdater && this.status.state === 'downloaded') {
      this.autoUpdater.quitAndInstall()
    }
  }

  private setStatus(patch: Partial<AppUpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.status)
  }

  private wireAutoUpdater(autoUpdater: AutoUpdaterLike): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('checking-for-update', () => {
      this.setStatus({ state: 'checking', message: undefined })
    })

    autoUpdater.on('update-not-available', () => {
      this.setStatus({ state: 'not-available', latestVersion: undefined, progressPercent: undefined })
    })

    autoUpdater.on('update-available', (info) => {
      this.setStatus({ state: 'downloading', latestVersion: info.version, progressPercent: 0 })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.setStatus({ state: 'downloading', progressPercent: Math.round(progress.percent) })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.setStatus({ state: 'downloaded', latestVersion: info.version, progressPercent: 100 })
    })

    autoUpdater.on('error', (error) => {
      this.setStatus({ state: 'error', message: describeError(error) })
    })
  }

  private async checkGithubReleaseDirectly(): Promise<void> {
    this.setStatus({ state: 'checking', message: undefined })

    const release = await this.fetchLatestRelease()
    const latestVersion = release.tag_name.replace(/^v/, '')

    if (isNewerVersion(latestVersion, this.status.currentVersion)) {
      this.setStatus({ state: 'available', latestVersion, releaseUrl: release.html_url })
    } else {
      this.setStatus({ state: 'not-available', latestVersion: undefined })
    }
  }
}

async function fetchLatestGithubRelease(): Promise<GithubRelease> {
  const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  })

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} while checking for updates.`)
  }

  return (await response.json()) as GithubRelease
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Compares dotted numeric versions (e.g. "1.10.0" vs "1.9.2"); a non-numeric part is treated as 0. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = candidate.split('.').map((part) => parseInt(part, 10) || 0)
  const currentParts = current.split('.').map((part) => parseInt(part, 10) || 0)
  const length = Math.max(candidateParts.length, currentParts.length)

  for (let i = 0; i < length; i += 1) {
    const diff = (candidateParts[i] ?? 0) - (currentParts[i] ?? 0)

    if (diff !== 0) {
      return diff > 0
    }
  }

  return false
}
