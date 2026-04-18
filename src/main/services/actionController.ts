import type {
  ActionFeedback,
  DeviceHealthStatus,
  ForegroundApp,
  QuickAction,
  RemoteCommand,
  SavedDevice
} from '@shared/types'
import type { AppController } from './appController'
import type { DeviceManager } from './deviceManager'
import type { RemoteController } from './remoteController'

const REMOTE_QUICK_ACTIONS: Array<{ id: string; label: string; detail: string; command: RemoteCommand }> = [
  {
    id: 'remote:home',
    label: 'Home',
    detail: 'Jump back to the TV home screen.',
    command: 'home'
  },
  {
    id: 'remote:mute',
    label: 'Mute',
    detail: 'Toggle mute without leaving the current screen.',
    command: 'mute'
  },
  {
    id: 'remote:playPause',
    label: 'Play/Pause',
    detail: 'Control media playback quickly.',
    command: 'playPause'
  }
]

function buildLaunchActions(device: SavedDevice, health: DeviceHealthStatus | null): QuickAction[] {
  const adbReady = Boolean(health?.adb.available)

  return (device.favorites ?? []).slice(0, 3).map((packageName) => ({
    id: `launch:${packageName}`,
    label: packageName.split('.').at(-1)?.replace(/[-_]/g, ' ') ?? packageName,
    detail: adbReady ? 'Launch this pinned app.' : 'ADB is required for app launch shortcuts.',
    kind: 'app',
    disabled: !adbReady
  }))
}

export class ActionController {
  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly remoteController: RemoteController,
    private readonly appController: AppController
  ) {}

  listQuickActions(health: DeviceHealthStatus | null, foregroundApp: ForegroundApp | null): QuickAction[] {
    const activeDevice = this.deviceManager.getActiveDevice()

    if (!activeDevice || this.deviceManager.getConnectionState().status !== 'connected') {
      return []
    }

    const actions: QuickAction[] = REMOTE_QUICK_ACTIONS.map((action) => ({
      id: action.id,
      label: action.label,
      detail: action.detail,
      kind: 'remote'
    }))

    if (foregroundApp) {
      actions.unshift({
        id: `app-info:${foregroundApp.packageName}`,
        label: 'Open App Info',
        detail: `Open Android settings for ${foregroundApp.displayName}.`,
        kind: 'app',
        disabled: !health?.adb.available
      })
      actions.unshift({
        id: `favorite:${foregroundApp.packageName}`,
        label: 'Pin Current App',
        detail: `Add ${foregroundApp.displayName} to this TV's favorites.`,
        kind: 'app',
        disabled: !health?.adb.available
      })
      actions.unshift({
        id: `launch:${foregroundApp.packageName}`,
        label: 'Relaunch Current App',
        detail: `Launch ${foregroundApp.displayName} again through ADB.`,
        kind: 'app',
        disabled: !health?.adb.available
      })
    }

    actions.push(...buildLaunchActions(activeDevice, health))

    return actions.slice(0, 6)
  }

  async runQuickAction(id: string): Promise<ActionFeedback> {
    const [kind, ...rest] = id.split(':')
    const value = rest.join(':')

    if (kind === 'remote') {
      return this.remoteController.sendCommand(value as RemoteCommand)
    }

    if (kind === 'launch') {
      return this.appController.launchPackage(value)
    }

    if (kind === 'app-info') {
      return this.appController.openAppInfo(value)
    }

    if (kind === 'favorite') {
      const device = await this.deviceManager.toggleFavoriteApp(value)
      const isFavorite = device.favorites?.includes(value) ?? false

      return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        status: 'success',
        kind: 'favorite',
        title: isFavorite ? 'Pinned current app' : 'Removed current app pin',
        detail: isFavorite
          ? 'The current app was added to this TV\'s favorites.'
          : 'The current app was removed from this TV\'s favorites.',
        appPackage: value,
        actionId: id
      }
    }

    throw new Error('Unknown quick action.')
  }
}
