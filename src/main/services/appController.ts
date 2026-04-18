import type { LaunchableApp } from '@shared/types'
import type { AdbClient } from './adb/adbClient'
import type { DeviceManager } from './deviceManager'

export class AppController {
  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly adbClient: AdbClient
  ) {}

  async listApps(forceRefresh = false): Promise<LaunchableApp[]> {
    const activeDevice = this.deviceManager.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before browsing installed apps.')
    }

    if (!forceRefresh && activeDevice.cachedApps) {
      return activeDevice.cachedApps.apps
    }

    const apps = await this.deviceManager.withAdbAccess((serial) => this.adbClient.listLaunchableApps(serial))
    const updated = await this.deviceManager.updateDeviceAppsCache(activeDevice.id, apps)
    return updated.cachedApps?.apps ?? apps
  }

  async launchApp(app: LaunchableApp): Promise<void> {
    const activeDevice = this.deviceManager.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before launching an app.')
    }

    await this.deviceManager.withAdbAccess((serial) => this.adbClient.launchApp(serial, app))
  }
}
