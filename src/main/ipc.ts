import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  BeginNativePairingInput,
  CompleteNativePairingInput,
  ConnectDeviceInput,
  LaunchableApp,
  PairDeviceInput,
  RemoteCommand,
  SaveDeviceInput,
  SendTextInput
} from '@shared/types'
import type { AppController } from './services/appController'
import type { DeviceManager } from './services/deviceManager'
import type { RemoteController } from './services/remoteController'
import type { AdbLocator } from './services/adb/adbLocator'
import type { AdbClient } from './services/adb/adbClient'

interface RegisterIpcOptions {
  deviceManager: DeviceManager
  remoteController: RemoteController
  appController: AppController
  adbLocator: AdbLocator
  adbClient: AdbClient
  getMainWindow: () => BrowserWindow | null
}

export function registerIpc(options: RegisterIpcOptions): void {
  const { deviceManager, remoteController, appController, adbLocator, adbClient, getMainWindow } = options

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

  ipcMain.handle(IPC_CHANNELS.devicesConnect, (_event, input: ConnectDeviceInput) => deviceManager.connectDevice(input))

  ipcMain.handle(IPC_CHANNELS.devicesDisconnect, () => deviceManager.disconnectActiveDevice())

  ipcMain.handle(IPC_CHANNELS.remoteSendKey, (_event, command: RemoteCommand) => remoteController.sendCommand(command))

  ipcMain.handle(IPC_CHANNELS.remoteSendText, (_event, input: SendTextInput) => remoteController.sendText(input.text))

  ipcMain.handle(IPC_CHANNELS.appsList, (_event, forceRefresh?: boolean) => appController.listApps(forceRefresh))

  ipcMain.handle(IPC_CHANNELS.appsLaunch, (_event, app: LaunchableApp) => appController.launchApp(app))

  ipcMain.handle(IPC_CHANNELS.diagnosticsGetStatus, async () => {
    const adbInfo = await adbLocator.locate()
    const version = adbInfo.available ? await adbClient.version() : undefined
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
      capabilities: deviceManager.getCapabilities()
    }
  })

  deviceManager.on('connectionState', (state) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.connectionStateChanged, state)
  })

  deviceManager.on('devicesChanged', (devices) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.devicesChanged, devices)
  })
}
