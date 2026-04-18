"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  devicesList: "devices.list",
  devicesSave: "devices.save",
  devicesPair: "devices.pair",
  devicesBeginNativePairing: "devices.beginNativePairing",
  devicesCompleteNativePairing: "devices.completeNativePairing",
  devicesDiscoverNative: "devices.discoverNative",
  devicesConnect: "devices.connect",
  devicesDisconnect: "devices.disconnect",
  remoteSendKey: "remote.sendKey",
  remoteSendText: "remote.sendText",
  appsList: "apps.list",
  appsLaunch: "apps.launch",
  diagnosticsGetStatus: "diagnostics.getStatus",
  connectionStateChanged: "events.connectionStateChanged",
  devicesChanged: "events.devicesChanged"
};
const api = {
  listDevices: () => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesList),
  saveDevice: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesSave, input),
  pairDevice: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesPair, input),
  beginNativePairing: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesBeginNativePairing, input),
  completeNativePairing: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesCompleteNativePairing, input),
  discoverNativeDevices: () => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesDiscoverNative),
  connectDevice: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesConnect, input),
  disconnectDevice: () => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesDisconnect),
  sendRemoteCommand: (command) => electron.ipcRenderer.invoke(IPC_CHANNELS.remoteSendKey, command),
  sendText: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.remoteSendText, input),
  listApps: () => electron.ipcRenderer.invoke(IPC_CHANNELS.appsList),
  launchApp: (packageName) => electron.ipcRenderer.invoke(IPC_CHANNELS.appsLaunch, packageName),
  getDiagnostics: () => electron.ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetStatus),
  onConnectionStateChanged: (listener) => {
    const wrapped = (_event, state) => listener(state);
    electron.ipcRenderer.on(IPC_CHANNELS.connectionStateChanged, wrapped);
    return () => electron.ipcRenderer.off(IPC_CHANNELS.connectionStateChanged, wrapped);
  },
  onDevicesChanged: (listener) => {
    const wrapped = (_event, devices) => listener(devices);
    electron.ipcRenderer.on(IPC_CHANNELS.devicesChanged, wrapped);
    return () => electron.ipcRenderer.off(IPC_CHANNELS.devicesChanged, wrapped);
  }
};
electron.contextBridge.exposeInMainWorld("tvRemoteApi", api);
