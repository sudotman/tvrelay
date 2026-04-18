import type {
  BeginNativePairingInput,
  CompleteNativePairingInput,
  ConnectDeviceInput,
  ConnectionState,
  DiagnosticsStatus,
  DiscoveredNativeDevice,
  LaunchableApp,
  PairDeviceInput,
  RemoteCommand,
  SaveDeviceInput,
  SavedDevice,
  SendTextInput
} from './types'

export interface TvRemoteApi {
  listDevices: () => Promise<SavedDevice[]>
  saveDevice: (input: SaveDeviceInput) => Promise<SavedDevice>
  pairDevice: (input: PairDeviceInput) => Promise<ConnectionState>
  beginNativePairing: (input: BeginNativePairingInput) => Promise<ConnectionState>
  completeNativePairing: (input: CompleteNativePairingInput) => Promise<ConnectionState>
  discoverNativeDevices: () => Promise<DiscoveredNativeDevice[]>
  connectDevice: (input: ConnectDeviceInput) => Promise<ConnectionState>
  disconnectDevice: () => Promise<ConnectionState>
  sendRemoteCommand: (command: RemoteCommand) => Promise<void>
  sendText: (input: SendTextInput) => Promise<void>
  listApps: () => Promise<LaunchableApp[]>
  launchApp: (packageName: string) => Promise<void>
  getDiagnostics: () => Promise<DiagnosticsStatus>
  onConnectionStateChanged: (listener: (state: ConnectionState) => void) => () => void
  onDevicesChanged: (listener: (devices: SavedDevice[]) => void) => () => void
}

export const IPC_CHANNELS = {
  devicesList: 'devices.list',
  devicesSave: 'devices.save',
  devicesPair: 'devices.pair',
  devicesBeginNativePairing: 'devices.beginNativePairing',
  devicesCompleteNativePairing: 'devices.completeNativePairing',
  devicesDiscoverNative: 'devices.discoverNative',
  devicesConnect: 'devices.connect',
  devicesDisconnect: 'devices.disconnect',
  remoteSendKey: 'remote.sendKey',
  remoteSendText: 'remote.sendText',
  appsList: 'apps.list',
  appsLaunch: 'apps.launch',
  diagnosticsGetStatus: 'diagnostics.getStatus',
  connectionStateChanged: 'events.connectionStateChanged',
  devicesChanged: 'events.devicesChanged'
} as const
