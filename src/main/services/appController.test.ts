import { describe, expect, it, vi } from 'vitest'
import type { LaunchableApp, SavedDevice } from '@shared/types'
import { AppController } from './appController'
import type { AdbClient } from './adb/adbClient'
import type { DeviceManager } from './deviceManager'

function createDeviceManager() {
  let activeDevice: SavedDevice = {
    id: 'tv-1',
    name: 'Living Room',
    host: '192.168.1.2',
    connectPort: 5555,
    mode: 'connect'
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

    await expect(controller.launchApp(app)).resolves.toBeUndefined()
    expect(adbClient.launchApp).toHaveBeenCalledWith('tv-serial', app)
  })
})
