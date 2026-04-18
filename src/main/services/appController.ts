import type { ActionFeedback, ForegroundApp, LaunchableApp, SavedDevice } from '@shared/types'
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

  async launchApp(app: LaunchableApp): Promise<ActionFeedback> {
    const activeDevice = this.deviceManager.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before launching an app.')
    }

    await this.deviceManager.withAdbAccess((serial) => this.adbClient.launchApp(serial, app))
    await this.deviceManager.recordAppLaunch(app.packageName)
    return this.createFeedback({
      status: 'sent',
      kind: 'app',
      title: `Launch requested for ${app.displayName}`,
      detail: 'The app launch intent was sent to the TV.',
      appPackage: app.packageName
    })
  }

  async toggleFavorite(packageName: string): Promise<SavedDevice> {
    return this.deviceManager.toggleFavoriteApp(packageName)
  }

  async getForegroundApp(): Promise<ForegroundApp | null> {
    const activeDevice = this.deviceManager.getActiveDevice()

    if (!activeDevice) {
      return null
    }

    return this.deviceManager.withAdbAccess((serial) => this.adbClient.getForegroundApp(serial))
  }

  async launchPackage(packageName: string): Promise<ActionFeedback> {
    const activeDevice = this.deviceManager.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before launching an app.')
    }

    await this.deviceManager.withAdbAccess((serial) => this.adbClient.launchPackage(serial, packageName))
    await this.deviceManager.recordAppLaunch(packageName)
    return this.createFeedback({
      status: 'sent',
      kind: 'app',
      title: 'Launch requested',
      detail: `The app launch intent for ${packageName} was sent to the TV.`,
      appPackage: packageName
    })
  }

  async openAppInfo(packageName: string): Promise<ActionFeedback> {
    const activeDevice = this.deviceManager.getActiveDevice()

    if (!activeDevice) {
      throw new Error('Connect to a TV before opening app details.')
    }

    await this.deviceManager.withAdbAccess((serial) => this.adbClient.openAppInfo(serial, packageName))
    return this.createFeedback({
      status: 'sent',
      kind: 'quick_action',
      title: 'App info opened',
      detail: `Android app details were opened for ${packageName}.`,
      appPackage: packageName
    })
  }

  private createFeedback(input: Omit<ActionFeedback, 'id' | 'createdAt'>): ActionFeedback {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      ...input
    }
  }
}
