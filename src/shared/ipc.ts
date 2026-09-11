import type {
  ActionFeedback,
  BeginNativePairingInput,
  CompleteNativePairingInput,
  ConnectDeviceInput,
  ConnectionState,
  DiagnosticsStatus,
  DeviceHealthStatus,
  DiscoveredNativeDevice,
  ForegroundApp,
  InstallApkInput,
  LaunchableApp,
  LaunchScrcpyInput,
  PairDeviceInput,
  QuickAction,
  RemoteCommand,
  ResolvedAdbEndpoints,
  SaveDeviceInput,
  SavedDevice,
  ScrcpyStatus,
  SelectedApkFile,
  SendTextInput,
  UpdateDevicePreferencesInput,
  UpdateWebRemoteInput,
  WebRemoteStatus
} from './types'

export interface TvRemoteApi {
  listDevices: () => Promise<SavedDevice[]>
  saveDevice: (input: SaveDeviceInput) => Promise<SavedDevice>
  deleteDevice: (deviceId: string) => Promise<SavedDevice[]>
  pairDevice: (input: PairDeviceInput) => Promise<ConnectionState>
  beginNativePairing: (input: BeginNativePairingInput) => Promise<ConnectionState>
  completeNativePairing: (input: CompleteNativePairingInput) => Promise<ConnectionState>
  discoverNativeDevices: () => Promise<DiscoveredNativeDevice[]>
  discoverAdbEndpoints: (host?: string) => Promise<ResolvedAdbEndpoints[]>
  connectDevice: (input: ConnectDeviceInput) => Promise<ConnectionState>
  disconnectDevice: () => Promise<ConnectionState>
  sendRemoteCommand: (command: RemoteCommand) => Promise<ActionFeedback>
  sendText: (input: SendTextInput) => Promise<ActionFeedback>
  listApps: (forceRefresh?: boolean) => Promise<LaunchableApp[]>
  launchApp: (app: LaunchableApp) => Promise<ActionFeedback>
  toggleFavoriteApp: (packageName: string) => Promise<SavedDevice>
  getDiagnostics: () => Promise<DiagnosticsStatus>
  getHealth: () => Promise<DeviceHealthStatus | null>
  runAdbTroubleshooting: () => Promise<DeviceHealthStatus | null>
  getForegroundApp: () => Promise<ForegroundApp | null>
  runQuickAction: (id: string) => Promise<ActionFeedback>
  updateDevicePreferences: (input: UpdateDevicePreferencesInput) => Promise<SavedDevice>
  wakeAndReconnect: () => Promise<ActionFeedback>
  getScrcpyStatus: () => Promise<ScrcpyStatus>
  launchScrcpy: (input: LaunchScrcpyInput) => Promise<ActionFeedback>
  chooseApkFile: () => Promise<SelectedApkFile | null>
  installApk: (input: InstallApkInput) => Promise<ActionFeedback>
  getWebRemoteStatus: () => Promise<WebRemoteStatus>
  updateWebRemote: (input: UpdateWebRemoteInput) => Promise<WebRemoteStatus>
  onConnectionStateChanged: (listener: (state: ConnectionState) => void) => () => void
  onDevicesChanged: (listener: (devices: SavedDevice[]) => void) => () => void
  onWebRemoteStatusChanged: (listener: (status: WebRemoteStatus) => void) => () => void
}

export const IPC_CHANNELS = {
  devicesList: 'devices.list',
  devicesSave: 'devices.save',
  devicesDelete: 'devices.delete',
  devicesPair: 'devices.pair',
  devicesBeginNativePairing: 'devices.beginNativePairing',
  devicesCompleteNativePairing: 'devices.completeNativePairing',
  devicesDiscoverNative: 'devices.discoverNative',
  devicesDiscoverAdb: 'devices.discoverAdb',
  devicesConnect: 'devices.connect',
  devicesDisconnect: 'devices.disconnect',
  remoteSendKey: 'remote.sendKey',
  remoteSendText: 'remote.sendText',
  appsList: 'apps.list',
  appsLaunch: 'apps.launch',
  appsToggleFavorite: 'apps.toggleFavorite',
  diagnosticsGetStatus: 'diagnostics.getStatus',
  diagnosticsGetHealth: 'diagnostics.getHealth',
  diagnosticsRunAdbTroubleshooting: 'diagnostics.runAdbTroubleshooting',
  appsGetForegroundApp: 'apps.getForegroundApp',
  actionsRunQuickAction: 'actions.runQuickAction',
  devicesUpdatePreferences: 'devices.updatePreferences',
  adbWakeAndReconnect: 'adb.wakeAndReconnect',
  scrcpyGetStatus: 'scrcpy.getStatus',
  scrcpyLaunch: 'scrcpy.launch',
  sideloadChooseApk: 'sideload.chooseApk',
  sideloadInstallApk: 'sideload.installApk',
  webRemoteGetStatus: 'webRemote.getStatus',
  webRemoteUpdate: 'webRemote.update',
  connectionStateChanged: 'events.connectionStateChanged',
  devicesChanged: 'events.devicesChanged',
  webRemoteStatusChanged: 'events.webRemoteStatusChanged'
} as const
