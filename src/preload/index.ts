import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type TvRemoteApi } from '@shared/ipc'
import type { ConnectionState, SavedDevice } from '@shared/types'

const api: TvRemoteApi = {
  listDevices: () => ipcRenderer.invoke(IPC_CHANNELS.devicesList),
  saveDevice: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesSave, input),
  pairDevice: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesPair, input),
  beginNativePairing: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesBeginNativePairing, input),
  completeNativePairing: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesCompleteNativePairing, input),
  discoverNativeDevices: () => ipcRenderer.invoke(IPC_CHANNELS.devicesDiscoverNative),
  connectDevice: (input) => ipcRenderer.invoke(IPC_CHANNELS.devicesConnect, input),
  disconnectDevice: () => ipcRenderer.invoke(IPC_CHANNELS.devicesDisconnect),
  sendRemoteCommand: (command) => ipcRenderer.invoke(IPC_CHANNELS.remoteSendKey, command),
  sendText: (input) => ipcRenderer.invoke(IPC_CHANNELS.remoteSendText, input),
  listApps: () => ipcRenderer.invoke(IPC_CHANNELS.appsList),
  launchApp: (packageName) => ipcRenderer.invoke(IPC_CHANNELS.appsLaunch, packageName),
  getDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetStatus),
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
