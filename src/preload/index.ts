import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type TvRemoteApi } from '@shared/ipc'
import type { ConnectionState, SavedDevice } from '@shared/types'

const api: TvRemoteApi = {
  listDevices: () => ipcRenderer.invoke(IPC_CHANNELS.devicesList),
  saveDevice: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesSave, input),
  deleteDevice: (deviceId) => ipcRenderer.invoke(IPC_CHANNELS.devicesDelete, deviceId),
  pairDevice: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesPair, input),
  beginNativePairing: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesBeginNativePairing, input),
  completeNativePairing: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesCompleteNativePairing, input),
  discoverNativeDevices: () => ipcRenderer.invoke(IPC_CHANNELS.devicesDiscoverNative),
  discoverAdbEndpoints: (host) => ipcRenderer.invoke(IPC_CHANNELS.devicesDiscoverAdb, host),
  connectDevice: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesConnect, input),
  disconnectDevice: () => ipcRenderer.invoke(IPC_CHANNELS.devicesDisconnect),
  sendRemoteCommand: (command) => ipcRenderer.invoke(IPC_CHANNELS.remoteSendKey, command),
  sendText: (input) => ipcRenderer.invoke(IPC_CHANNELS.remoteSendText, input),
  listApps: (forceRefresh) => ipcRenderer.invoke(IPC_CHANNELS.appsList, forceRefresh),
  launchApp: (app) => ipcRenderer.invoke(IPC_CHANNELS.appsLaunch, app),
  toggleFavoriteApp: (packageName) => ipcRenderer.invoke(IPC_CHANNELS.appsToggleFavorite, packageName),
  getDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetStatus),
  getHealth: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetHealth),
  runAdbTroubleshooting: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsRunAdbTroubleshooting),
  getForegroundApp: () => ipcRenderer.invoke(IPC_CHANNELS.appsGetForegroundApp),
  runQuickAction: (id) => ipcRenderer.invoke(IPC_CHANNELS.actionsRunQuickAction, id),
  updateDevicePreferences: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesUpdatePreferences, input),
  wakeAndReconnect: () => ipcRenderer.invoke(IPC_CHANNELS.adbWakeAndReconnect),
  getScrcpyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.scrcpyGetStatus),
  launchScrcpy: (input) => ipcRenderer.invoke(IPC_CHANNELS.scrcpyLaunch, input),
  chooseApkFile: () => ipcRenderer.invoke(IPC_CHANNELS.sideloadChooseApk),
  installApk: (input) => ipcRenderer.invoke(IPC_CHANNELS.sideloadInstallApk, input),
  onConnectionStateChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: ConnectionState) => listener(state)
    ipcRenderer.on(IPC_CHANNELS.connectionStateChanged, wrapped)
    return () => ipcRenderer.off(IPC_CHANNELS.connectionStateChanged, wrapped)
  },
  onDevicesChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, devices: SavedDevice[]) => listener(devices)
    ipcRenderer.on(IPC_CHANNELS.devicesChanged, wrapped)
    return () => ipcRenderer.off(IPC_CHANNELS.devicesChanged, wrapped)
  }
}

contextBridge.exposeInMainWorld('tvRemoteApi', api)
