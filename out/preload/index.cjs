"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  devicesList: "devices.list",
  devicesSave: "devices.save",
  devicesDelete: "devices.delete",
  devicesPair: "devices.pair",
  devicesBeginNativePairing: "devices.beginNativePairing",
  devicesCompleteNativePairing: "devices.completeNativePairing",
  devicesDiscoverNative: "devices.discoverNative",
  devicesDiscoverAdb: "devices.discoverAdb",
  devicesConnect: "devices.connect",
  devicesDisconnect: "devices.disconnect",
  remoteSendKey: "remote.sendKey",
  remoteSendText: "remote.sendText",
  appsList: "apps.list",
  appsLaunch: "apps.launch",
  appsToggleFavorite: "apps.toggleFavorite",
  diagnosticsGetStatus: "diagnostics.getStatus",
  diagnosticsGetHealth: "diagnostics.getHealth",
  diagnosticsRunAdbTroubleshooting: "diagnostics.runAdbTroubleshooting",
  appsGetForegroundApp: "apps.getForegroundApp",
  actionsRunQuickAction: "actions.runQuickAction",
  devicesUpdatePreferences: "devices.updatePreferences",
  adbWakeAndReconnect: "adb.wakeAndReconnect",
  scrcpyGetStatus: "scrcpy.getStatus",
  scrcpyLaunch: "scrcpy.launch",
  sideloadChooseApk: "sideload.chooseApk",
  sideloadInstallApk: "sideload.installApk",
  webRemoteGetStatus: "webRemote.getStatus",
  webRemoteUpdate: "webRemote.update",
  connectionStateChanged: "events.connectionStateChanged",
  devicesChanged: "events.devicesChanged",
  webRemoteStatusChanged: "events.webRemoteStatusChanged"
};
const api = {
  listDevices: () => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesList),
  saveDevice: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesSave, input),
  deleteDevice: (deviceId) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesDelete, deviceId),
  pairDevice: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesPair, input),
  beginNativePairing: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesBeginNativePairing, input),
  completeNativePairing: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesCompleteNativePairing, input),
  discoverNativeDevices: () => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesDiscoverNative),
  discoverAdbEndpoints: (host) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesDiscoverAdb, host),
  connectDevice: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesConnect, input),
  disconnectDevice: () => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesDisconnect),
  sendRemoteCommand: (command) => electron.ipcRenderer.invoke(IPC_CHANNELS.remoteSendKey, command),
  sendText: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.remoteSendText, input),
  listApps: (forceRefresh) => electron.ipcRenderer.invoke(IPC_CHANNELS.appsList, forceRefresh),
  launchApp: (app) => electron.ipcRenderer.invoke(IPC_CHANNELS.appsLaunch, app),
  toggleFavoriteApp: (packageName) => electron.ipcRenderer.invoke(IPC_CHANNELS.appsToggleFavorite, packageName),
  getDiagnostics: () => electron.ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetStatus),
  getHealth: () => electron.ipcRenderer.invoke(IPC_CHANNELS.diagnosticsGetHealth),
  runAdbTroubleshooting: () => electron.ipcRenderer.invoke(IPC_CHANNELS.diagnosticsRunAdbTroubleshooting),
  getForegroundApp: () => electron.ipcRenderer.invoke(IPC_CHANNELS.appsGetForegroundApp),
  runQuickAction: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS.actionsRunQuickAction, id),
  updateDevicePreferences: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.devicesUpdatePreferences, input),
  wakeAndReconnect: () => electron.ipcRenderer.invoke(IPC_CHANNELS.adbWakeAndReconnect),
  getScrcpyStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.scrcpyGetStatus),
  launchScrcpy: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.scrcpyLaunch, input),
  chooseApkFile: () => electron.ipcRenderer.invoke(IPC_CHANNELS.sideloadChooseApk),
  installApk: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.sideloadInstallApk, input),
  getWebRemoteStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.webRemoteGetStatus),
  updateWebRemote: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.webRemoteUpdate, input),
  onConnectionStateChanged: (listener) => {
    const wrapped = (_event, state) => listener(state);
    electron.ipcRenderer.on(IPC_CHANNELS.connectionStateChanged, wrapped);
    return () => electron.ipcRenderer.off(IPC_CHANNELS.connectionStateChanged, wrapped);
  },
  onDevicesChanged: (listener) => {
    const wrapped = (_event, devices) => listener(devices);
    electron.ipcRenderer.on(IPC_CHANNELS.devicesChanged, wrapped);
    return () => electron.ipcRenderer.off(IPC_CHANNELS.devicesChanged, wrapped);
  },
  onWebRemoteStatusChanged: (listener) => {
    const wrapped = (_event, status) => listener(status);
    electron.ipcRenderer.on(IPC_CHANNELS.webRemoteStatusChanged, wrapped);
    return () => electron.ipcRenderer.off(IPC_CHANNELS.webRemoteStatusChanged, wrapped);
  }
};
electron.contextBridge.exposeInMainWorld("tvRemoteApi", api);
