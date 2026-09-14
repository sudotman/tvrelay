import { describe, expect, it, vi } from 'vitest'
import { isNewerVersion, UpdateService, type AutoUpdaterLike } from './updateService'

function createFakeAutoUpdater(): AutoUpdaterLike & { emitEvent: (event: string, ...args: unknown[]) => void } {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()

  return {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) ?? []
      existing.push(listener)
      listeners.set(event, existing)
      return undefined
    }),
    emitEvent: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args)
      }
    }
  } as unknown as AutoUpdaterLike & { emitEvent: (event: string, ...args: unknown[]) => void }
}

describe('isNewerVersion', () => {
  it('treats a higher patch version as newer', () => {
    expect(isNewerVersion('0.2.1', '0.2.0')).toBe(true)
  })

  it('treats an equal version as not newer', () => {
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false)
  })

  it('treats a lower version as not newer', () => {
    expect(isNewerVersion('0.1.9', '0.2.0')).toBe(false)
  })

  it('compares version segments numerically, not lexicographically', () => {
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true)
  })
})

describe('UpdateService on mac', () => {
  it('does nothing while unpackaged, so dev runs never hit the network', async () => {
    const fetchLatestRelease = vi.fn()
    const service = new UpdateService({
      platform: 'darwin',
      currentVersion: '0.2.0',
      isPackaged: false,
      fetchLatestRelease
    })

    await service.checkForUpdates()

    expect(fetchLatestRelease).not.toHaveBeenCalled()
    expect(service.getStatus().state).toBe('idle')
  })

  it('reports an available update with a release link when GitHub has a newer tag', async () => {
    const fetchLatestRelease = vi.fn().mockResolvedValue({
      tag_name: 'v0.3.0',
      html_url: 'https://github.com/sudotman/tvrelay/releases/tag/v0.3.0'
    })
    const service = new UpdateService({
      platform: 'darwin',
      currentVersion: '0.2.0',
      isPackaged: true,
      fetchLatestRelease
    })

    const statuses: string[] = []
    service.on('status', (status) => statuses.push(status.state))

    await service.checkForUpdates()

    expect(service.getStatus()).toMatchObject({
      state: 'available',
      latestVersion: '0.3.0',
      releaseUrl: 'https://github.com/sudotman/tvrelay/releases/tag/v0.3.0',
      canAutoInstall: false
    })
    expect(statuses).toEqual(['checking', 'available'])
  })

  it('reports not-available when the current version is already latest', async () => {
    const fetchLatestRelease = vi.fn().mockResolvedValue({
      tag_name: 'v0.2.0',
      html_url: 'https://github.com/sudotman/tvrelay/releases/tag/v0.2.0'
    })
    const service = new UpdateService({
      platform: 'darwin',
      currentVersion: '0.2.0',
      isPackaged: true,
      fetchLatestRelease
    })

    await service.checkForUpdates()

    expect(service.getStatus().state).toBe('not-available')
  })

  it('surfaces a network failure as an error state instead of throwing', async () => {
    const fetchLatestRelease = vi.fn().mockRejectedValue(new Error('boom'))
    const service = new UpdateService({
      platform: 'darwin',
      currentVersion: '0.2.0',
      isPackaged: true,
      fetchLatestRelease
    })

    await expect(service.checkForUpdates()).resolves.toMatchObject({ state: 'error', message: 'boom' })
  })

  it('opens the release page only once one is known', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const service = new UpdateService({
      platform: 'darwin',
      currentVersion: '0.2.0',
      isPackaged: true,
      openExternal
    })

    await service.openReleasePage()
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe('UpdateService on windows', () => {
  it('delegates checking to electron-updater and forwards its events', async () => {
    const autoUpdater = createFakeAutoUpdater()
    const service = new UpdateService({
      platform: 'win32',
      currentVersion: '0.2.0',
      isPackaged: true,
      autoUpdater
    })

    expect(service.getStatus().canAutoInstall).toBe(true)

    const checkPromise = service.checkForUpdates()
    autoUpdater.emitEvent('checking-for-update')
    autoUpdater.emitEvent('update-available', { version: '0.3.0' })
    autoUpdater.emitEvent('download-progress', { percent: 42.6 })
    autoUpdater.emitEvent('update-downloaded', { version: '0.3.0' })
    await checkPromise

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toMatchObject({
      state: 'downloaded',
      latestVersion: '0.3.0',
      progressPercent: 100
    })
  })

  it('only quits and installs once a download has finished', () => {
    const autoUpdater = createFakeAutoUpdater()
    const service = new UpdateService({
      platform: 'win32',
      currentVersion: '0.2.0',
      isPackaged: true,
      autoUpdater
    })

    service.quitAndInstall()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()

    autoUpdater.emitEvent('update-downloaded', { version: '0.3.0' })
    service.quitAndInstall()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
  })
})
