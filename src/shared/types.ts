export type DeviceConnectionMode = 'pair' | 'connect'
export type ConnectionBackend = 'native' | 'adb'
export type PreferredConnectionBackend = 'auto' | 'native' | 'adb'
export type ActionFeedbackStatus = 'sent' | 'success' | 'blocked' | 'error'
export type ActionFeedbackKind = 'remote' | 'app' | 'text' | 'favorite' | 'quick_action' | 'system'
export type HealthIssueCode =
  | 'adb_missing'
  | 'adb_disabled_for_tv'
  | 'adb_pair_required'
  | 'adb_unauthorized'
  | 'adb_connect_failed'
  | 'native_pairing_stalled'
  | 'ready'
export type RecommendedAction =
  | 'pair_adb'
  | 'connect_adb'
  | 'switch_to_adb'
  | 'retry_native'
  | 'open_remote'
  | 'open_apps'
export type BackendHealthState =
  | ConnectionStatus
  | 'disabled'
  | 'not_configured'
  | 'missing'
  | 'ready'
  | 'degraded'

export interface RecentAppLaunch {
  packageName: string
  launchedAt: string
}

export interface ActionFeedback {
  id: string
  createdAt: string
  status: ActionFeedbackStatus
  kind: ActionFeedbackKind
  title: string
  detail: string
  command?: RemoteCommand
  appPackage?: string
  actionId?: string
  cooldownMs?: number
}

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

export interface BackendHealthSnapshot {
  available: boolean
  ready: boolean
  lastCheckedAt?: string
  lastConnectedAt?: string
  lastError?: string
  lastState?: BackendHealthState
}

export interface HealthIssue {
  code: HealthIssueCode
  severity: 'neutral' | 'warning' | 'danger' | 'positive'
  summary: string
  detail: string
  backend?: ConnectionBackend | 'system'
}

export interface DeviceHealthStatus {
  deviceId?: string
  summary: string
  detail: string
  issues: HealthIssue[]
  adb: BackendHealthSnapshot
  native: BackendHealthSnapshot
  recommendedActions: RecommendedAction[]
}

export interface ForegroundApp {
  packageName: string
  activity?: string
  displayName: string
}

export interface QuickAction {
  id: string
  label: string
  detail: string
  kind: 'remote' | 'app' | 'system'
  disabled?: boolean
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
  favorites?: string[]
  recentApps?: RecentAppLaunch[]
  backendHealth?: {
    adb: BackendHealthSnapshot
    native: BackendHealthSnapshot
  }
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

export interface DiscoveredAdbService {
  name: string
  host: string
  port: number
  serviceType: 'pairing' | 'connect' | 'legacy'
}

export interface ResolvedAdbEndpoints {
  host: string
  pairPort?: number
  connectPort?: number
  services: DiscoveredAdbService[]
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
  health: DeviceHealthStatus | null
  recommendedActions: RecommendedAction[]
  foregroundApp: ForegroundApp | null
  quickActions: QuickAction[]
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
