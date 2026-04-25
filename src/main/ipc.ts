import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  BeginNativePairingInput,
  CompleteNativePairingInput,
  ConnectDeviceInput,
  LaunchableApp,
  InstallApkInput,
  LaunchScrcpyInput,
  PairDeviceInput,
  RemoteCommand,
  SaveDeviceInput,
  SendTextInput,
  UpdateDevicePreferencesInput
} from '@shared/types'
import type { AppController } from './services/appController'
import type { ActionController } from './services/actionController'
import type { DeviceManager } from './services/deviceManager'
import type { RemoteController } from './services/remoteController'
import type { AdbLocator } from './services/adb/adbLocator'
import type { AdbClient } from './services/adb/adbClient'
import type { ScrcpyController } from './services/scrcpyController'
import type { SideloadController } from './services/sideloadController'

interface RegisterIpcOptions {
  deviceManager: DeviceManager
  remoteController: RemoteController
  appController: AppController
  actionController: ActionController
  scrcpyController: ScrcpyController
  sideloadController: SideloadController
  adbLocator: AdbLocator
  adbClient: AdbClient
  getMainWindow: () => BrowserWindow | null
}

export function registerIpc(options: RegisterIpcOptions): void {
  const {
    deviceManager,
    remoteController,
    appController,
    actionController,
    scrcpyController,
    sideloadController,
    adbLocator,
    adbClient,
    getMainWindow
  } = options
  let cachedAdbVersion: string | undefined

  ipcMain.handle(IPC_CHANNELS.devicesList, () => deviceManager.listDevices())

  ipcMain.handle(IPC_CHANNELS.devicesSave, (_event, input: SaveDeviceInput) => deviceManager.saveDevice(input))

  ipcMain.handle(IPC_CHANNELS.devicesDelete, (_event, deviceId: string) => deviceManager.deleteDevice(deviceId))

  ipcMain.handle(IPC_CHANNELS.devicesPair, (_event, input: PairDeviceInput) => deviceManager.pairAndConnect(input))

  ipcMain.handle(IPC_CHANNELS.devicesBeginNativePairing, (_event, input: BeginNativePairingInput) =>
    deviceManager.beginNativePairing(input)
  )

  ipcMain.handle(IPC_CHANNELS.devicesCompleteNativePairing, (_event, input: CompleteNativePairingInput) =>
    deviceManager.completeNativePairing(input.code)
  )

  ipcMain.handle(IPC_CHANNELS.devicesDiscoverNative, () => deviceManager.discoverNativeDevices())

  ipcMain.handle(IPC_CHANNELS.devicesDiscoverAdb, async (_event, host?: string) => {
    const adbInfo = await adbLocator.locate()
    return adbInfo.available ? deviceManager.discoverAdbEndpoints(host) : []
  })

  ipcMain.handle(IPC_CHANNELS.devicesConnect, (_event, input: ConnectDeviceInput) => deviceManager.connectDevice(input))

  ipcMain.handle(IPC_CHANNELS.devicesDisconnect, () => deviceManager.disconnectActiveDevice())

  ipcMain.handle(IPC_CHANNELS.remoteSendKey, (_event, command: RemoteCommand) => remoteController.sendCommand(command))

  ipcMain.handle(IPC_CHANNELS.remoteSendText, (_event, input: SendTextInput) => remoteController.sendText(input.text))

  ipcMain.handle(IPC_CHANNELS.appsList, (_event, forceRefresh?: boolean) => appController.listApps(forceRefresh))

  ipcMain.handle(IPC_CHANNELS.appsLaunch, (_event, app: LaunchableApp) => appController.launchApp(app))

  ipcMain.handle(IPC_CHANNELS.appsToggleFavorite, (_event, packageName: string) =>
    appController.toggleFavorite(packageName)
  )

  ipcMain.handle(IPC_CHANNELS.appsGetForegroundApp, () => appController.getForegroundApp())

  ipcMain.handle(IPC_CHANNELS.actionsRunQuickAction, (_event, id: string) => actionController.runQuickAction(id))

  ipcMain.handle(IPC_CHANNELS.devicesUpdatePreferences, (_event, input: UpdateDevicePreferencesInput) =>
    deviceManager.updateActiveDevicePreferences(input)
  )

  ipcMain.handle(IPC_CHANNELS.adbWakeAndReconnect, () => deviceManager.wakeAndReconnect())

  ipcMain.handle(IPC_CHANNELS.scrcpyGetStatus, () => scrcpyController.getStatus())

  ipcMain.handle(IPC_CHANNELS.scrcpyLaunch, (_event, input: LaunchScrcpyInput) =>
    scrcpyController.launch(input.preset)
  )

  ipcMain.handle(IPC_CHANNELS.sideloadChooseApk, () => sideloadController.chooseApk(getMainWindow()))

  ipcMain.handle(IPC_CHANNELS.sideloadInstallApk, (_event, input: InstallApkInput) =>
    sideloadController.installApk(input.id)
  )

  ipcMain.handle(IPC_CHANNELS.diagnosticsGetStatus, async () => {
    const adbInfo = await adbLocator.locate()
    const version =
      adbInfo.available
        ? (cachedAdbVersion ??= await adbClient.version())
        : undefined
    const health = await deviceManager.getHealth(adbInfo.available)
    const quickActions = actionController.listQuickActions(health, null)

    return {
      adb: {
        available: adbInfo.available,
        path: adbInfo.path,
        version,
        installHint: adbInfo.installHint
      },
      connectionState: deviceManager.getConnectionState(),
      activeBackend: deviceManager.getActiveBackend(),
      activeDevice: deviceManager.getActiveDevice(),
      savedDevices: deviceManager.listDevices(),
      pendingNativePairing: deviceManager.getPendingNativePairing(),
      capabilities: deviceManager.getCapabilities(),
      health,
      recommendedActions: health?.recommendedActions ?? [],
      foregroundApp: null,
      quickActions,
      scrcpy: await scrcpyController.getStatus()
    }
  })

  ipcMain.handle(IPC_CHANNELS.diagnosticsGetHealth, async () => {
    const adbInfo = await adbLocator.locate()
    return deviceManager.getHealth(adbInfo.available)
  })

  ipcMain.handle(IPC_CHANNELS.diagnosticsRunAdbTroubleshooting, async () => {
    const adbInfo = await adbLocator.locate()
    return deviceManager.runAdbTroubleshooting(adbInfo.available)
  })

  deviceManager.on('connectionState', (state) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.connectionStateChanged, state)
  })

  deviceManager.on('devicesChanged', (devices) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.devicesChanged, devices)
  })
}
