import { describe, expect, it, vi } from 'vitest'
import type { LaunchableApp, SavedDevice } from '@shared/types'
import { AppController } from './appController'
import type { AdbClient } from './adb/adbClient'
import type { DeviceManager } from './deviceManager'

function createDeviceManager(options?: { withCachedApps?: boolean }) {
  let activeDevice: SavedDevice = {
    id: 'tv-1',
    name: 'Living Room',
    host: '192.168.1.2',
    connectPort: 5555,
    mode: 'connect',
    favorites: [],
    recentApps: [],
    cachedApps: options?.withCachedApps
      ? {
          updatedAt: '2026-04-18T10:00:00.000Z',
          apps: [
            {
              packageName: 'com.netflix.ninja',
              activity: 'com.netflix.ninja/com.netflix.ninja.MainActivity',
              displayName: 'Netflix',
              category: 'leanback'
            }
          ]
        }
      : undefined
  }

  return {
    getActiveDevice: vi.fn().mockImplementation(() => activeDevice),
    withAdbAccess: vi.fn(),
    updateDeviceAppsCache: vi.fn().mockImplementation(async (_deviceId: string, apps: LaunchableApp[]) => {
      activeDevice = {
        ...activeDevice,
        cachedApps: {
          updatedAt: '2026-04-18T10:00:00.000Z',
          apps
        }
      }

      return activeDevice
    }),
    recordAppLaunch: vi.fn().mockImplementation(async (packageName: string) => {
      activeDevice = {
        ...activeDevice,
        recentApps: [{ packageName, launchedAt: '2026-04-18T10:30:00.000Z' }]
      }

      return activeDevice
    }),
    toggleFavoriteApp: vi.fn().mockImplementation(async (packageName: string) => {
      activeDevice = {
        ...activeDevice,
        favorites: activeDevice.favorites?.includes(packageName) ? [] : [packageName]
      }

      return activeDevice
    })
  } as unknown as DeviceManager
}

describe('AppController', () => {
  it('reuses the persisted cached app list for the same TV', async () => {
    const apps: LaunchableApp[] = [
      {
        packageName: 'com.netflix.ninja',
        activity: 'com.netflix.ninja/com.netflix.ninja.MainActivity',
        displayName: 'Netflix',
        category: 'leanback'
      }
    ]

    const deviceManager = createDeviceManager()
    const adbClient = {
      listLaunchableApps: vi.fn().mockResolvedValue(apps)
    } as unknown as AdbClient

    vi.mocked(deviceManager.withAdbAccess)
      .mockImplementationOnce(async <T>(callback: (serial: string) => Promise<T>) => callback('tv-serial'))

    const controller = new AppController(deviceManager, adbClient)

    await expect(controller.listApps()).resolves.toEqual(apps)
    await expect(controller.listApps()).resolves.toEqual(apps)
    expect(deviceManager.withAdbAccess).toHaveBeenCalledTimes(1)
    expect(deviceManager.updateDeviceAppsCache).toHaveBeenCalledTimes(1)
  })

  it('launches the selected app without re-listing everything first', async () => {
    const app: LaunchableApp = {
      packageName: 'com.netflix.ninja',
      activity: 'com.netflix.ninja/com.netflix.ninja.MainActivity',
      displayName: 'Netflix',
      category: 'leanback'
    }

    const deviceManager = createDeviceManager()
    const adbClient = {
      launchApp: vi.fn().mockResolvedValue(undefined)
    } as unknown as AdbClient

    vi.mocked(deviceManager.withAdbAccess)
      .mockImplementationOnce(async <T>(callback: (serial: string) => Promise<T>) => callback('tv-serial'))

    const controller = new AppController(deviceManager, adbClient)

    const feedback = await controller.launchApp(app)

    expect(feedback.status).toBe('sent')
    expect(feedback.kind).toBe('app')
    expect(feedback.appPackage).toBe(app.packageName)
    expect(adbClient.launchApp).toHaveBeenCalledWith('tv-serial', app)
    expect(deviceManager.recordAppLaunch).toHaveBeenCalledWith(app.packageName)
  })

  it('caches the foreground app for clients that must not hit ADB themselves', async () => {
    const deviceManager = createDeviceManager()
    const adbClient = {
      getForegroundApp: vi.fn().mockResolvedValue({
        packageName: 'com.netflix.ninja',
        displayName: 'Netflix'
      })
    } as unknown as AdbClient

    vi.mocked(deviceManager.withAdbAccess).mockImplementation(
      async <T>(callback: (serial: string) => Promise<T>) => callback('tv-serial')
    )

    const controller = new AppController(deviceManager, adbClient)

    expect(controller.getCachedForegroundApp()).toBeNull()

    await controller.getForegroundApp()

    expect(controller.getCachedForegroundApp()).toEqual({
      packageName: 'com.netflix.ninja',
      displayName: 'Netflix'
    })
    // Reading the cache must never reach the TV again.
    expect(adbClient.getForegroundApp).toHaveBeenCalledTimes(1)
  })

  it('reports nothing rather than a stale foreground app once the TTL lapses', async () => {
    vi.useFakeTimers()

    try {
      const deviceManager = createDeviceManager()
      const adbClient = {
        getForegroundApp: vi.fn().mockResolvedValue({
          packageName: 'com.netflix.ninja',
          displayName: 'Netflix'
        })
      } as unknown as AdbClient

      vi.mocked(deviceManager.withAdbAccess).mockImplementation(
        async <T>(callback: (serial: string) => Promise<T>) => callback('tv-serial')
      )

      const controller = new AppController(deviceManager, adbClient)

      await controller.getForegroundApp()
      expect(controller.getCachedForegroundApp()).not.toBeNull()

      vi.advanceTimersByTime(21_000)
      expect(controller.getCachedForegroundApp()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggles favorites without disturbing cached apps', async () => {
    const deviceManager = createDeviceManager({ withCachedApps: true })
    const controller = new AppController(deviceManager, {} as AdbClient)

    const updated = await controller.toggleFavorite('com.netflix.ninja')

    expect(updated.favorites).toEqual(['com.netflix.ninja'])
    expect(updated.cachedApps?.apps[0]?.displayName).toBe('Netflix')
  })
})
