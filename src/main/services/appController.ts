import type { LaunchableApp } from '@shared/types'
import type { AdbClient } from './adb/adbClient'
import type { DeviceManager } from './deviceManager'

export class AppController {
  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly adbClient: AdbClient
  ) {}

  async listApps(): Promise<LaunchableApp[]> {
    return this.deviceManager.withAdbAccess((serial) => this.adbClient.listLaunchableApps(serial))
  }

  async launchApp(packageName: string): Promise<void> {
    const apps = await this.deviceManager.withAdbAccess((serial) => this.adbClient.listLaunchableApps(serial))
    const app = apps.find((item) => item.packageName === packageName)

    if (!app) {
      throw new Error('Selected app is no longer launchable on this TV.')
    }

    await this.deviceManager.withAdbAccess((serial) => this.adbClient.launchApp(serial, app))
  }
}
