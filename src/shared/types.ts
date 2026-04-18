export type DeviceConnectionMode = 'pair' | 'connect'
export type ConnectionBackend = 'native' | 'adb'
export type PreferredConnectionBackend = 'auto' | 'native' | 'adb'

export interface NativeRemoteCertificate {
  key: string
  cert: string
}

export interface NativeRemoteConfig {
  serviceLabel?: string
  remotePort: number
  pairingPort: number
  certificate?: NativeRemoteCertificate
}

export interface SavedDevice {
  id: string
  name: string
  host: string
  connectPort: number
  pairPort?: number
  mode: DeviceConnectionMode
  adbEnabled?: boolean
  preferredBackend?: PreferredConnectionBackend
  nativeRemote?: NativeRemoteConfig
  lastConnectedAt?: string
  lastConnectedBackend?: ConnectionBackend
  cachedApps?: CachedAppsSnapshot
}

export type ConnectionStatus =
  | 'disconnected'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'unauthorized'
  | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  deviceId?: string
  backend?: ConnectionBackend
  message?: string
}

export interface LaunchableApp {
  packageName: string
  activity: string
  displayName: string
  category: 'leanback' | 'launcher'
  iconDataUrl?: string
}

export interface CachedAppsSnapshot {
  updatedAt: string
  apps: LaunchableApp[]
}

export interface DiscoveredNativeDevice {
  name: string
  host: string
  remotePort: number
  pairingPort: number
  serviceLabel?: string
}

export interface PendingNativePairing {
  deviceId?: string
  name: string
  host: string
}

export type RemoteCommand =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'home'
  | 'back'
  | 'menu'
  | 'appSwitch'
  | 'playPause'
  | 'rewind'
  | 'fastForward'
  | 'next'
  | 'previous'
  | 'power'
  | 'sleep'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'enter'
  | 'delete'

export interface DiagnosticsStatus {
  adb: {
    available: boolean
    path?: string
    version?: string
    installHint?: string
  }
  connectionState: ConnectionState
  activeBackend: ConnectionBackend | null
  activeDevice: SavedDevice | null
  savedDevices: SavedDevice[]
  pendingNativePairing: PendingNativePairing | null
  capabilities: {
    nativeRemote: boolean
    adbFallback: boolean
    typing: boolean
    apps: boolean
  }
}

export interface PairDeviceInput {
  name: string
  host: string
  connectPort: number
  pairPort: number
  code: string
  preferredBackend?: PreferredConnectionBackend
  nativeRemote?: NativeRemoteConfig
  adbEnabled?: boolean
  mode?: DeviceConnectionMode
}

export interface BeginNativePairingInput {
  id?: string
  name: string
  host: string
  remotePort: number
  pairingPort: number
  serviceLabel?: string
  preferredBackend?: PreferredConnectionBackend
  adbEnabled?: boolean
  connectPort?: number
  pairPort?: number
  mode?: DeviceConnectionMode
}

export interface CompleteNativePairingInput {
  code: string
}

export interface ConnectDeviceInput {
  id?: string
  name?: string
  host?: string
  connectPort?: number
  mode?: DeviceConnectionMode
  pairPort?: number
  preferredBackend?: PreferredConnectionBackend
  nativeRemote?: NativeRemoteConfig
  adbEnabled?: boolean
}

export interface SaveDeviceInput {
  id?: string
  name: string
  host: string
  connectPort?: number
  pairPort?: number
  mode?: DeviceConnectionMode
  preferredBackend?: PreferredConnectionBackend
  nativeRemote?: NativeRemoteConfig
  adbEnabled?: boolean
}

export interface SendTextInput {
  text: string
}
