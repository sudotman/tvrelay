import type {
  ActionFeedback,
  AppUpdateState,
  BackendHealthSnapshot,
  ConnectionBackend,
  ConnectionState,
  DevicePreferences,
  DiagnosticsStatus,
  FavoriteAppHotkey,
  LaunchableApp,
  PreferredConnectionBackend,
  QuickAction,
  RecommendedAction,
  RemoteCommand,
  SavedDevice,
  ScrcpyPreset
} from '@shared/types'

export type TabId = 'remote' | 'apps' | 'setup' | 'phone'
export type ThemeMode = 'light' | 'dark'
export type Tone = 'neutral' | 'positive' | 'danger' | 'warning'

export interface SetupFormState {
  name: string
  host: string
  preferredBackend: PreferredConnectionBackend
  nativeRemotePort: string
  nativePairingPort: string
  nativeCode: string
  adbEnabled: boolean
  adbMode: 'pair' | 'connect'
  connectPort: string
  adbPairPort: string
  adbPairCode: string
}

export interface RemoteButton {
  label: string
  /** Used in the tight 5-up grids where the full label would wrap. */
  short?: string
  command: RemoteCommand
  accent?: boolean
}

export const initialForm: SetupFormState = {
  name: '',
  host: '',
  preferredBackend: 'adb',
  nativeRemotePort: '6466',
  nativePairingPort: '6467',
  nativeCode: '',
  adbEnabled: true,
  adbMode: 'pair',
  connectPort: '5555',
  adbPairPort: '37099',
  adbPairCode: ''
}

export const coreRemoteButtons: RemoteButton[] = [
  { label: 'Home', command: 'home' },
  { label: 'Back', command: 'back' },
  { label: 'Menu', command: 'menu' },
  { label: 'Recents', command: 'appSwitch' },
  { label: 'Power', command: 'power', accent: true },
  { label: 'Sleep', command: 'sleep' }
]

export const mediaRemoteButtons: RemoteButton[] = [
  { label: 'Previous', short: 'Prev', command: 'previous' },
  { label: 'Rewind', short: 'Rew', command: 'rewind' },
  { label: 'Play/Pause', short: 'Play', command: 'playPause', accent: true },
  { label: 'Fast Forward', short: 'Fwd', command: 'fastForward' },
  { label: 'Next', short: 'Next', command: 'next' }
]

export const soundRemoteButtons: RemoteButton[] = [
  { label: 'Vol +', command: 'volumeUp' },
  { label: 'Mute', command: 'mute' },
  { label: 'Vol -', command: 'volumeDown' }
]

export const allRemoteButtons: RemoteButton[] = [
  ...coreRemoteButtons,
  ...mediaRemoteButtons,
  ...soundRemoteButtons
]

export const favoriteHotkeys: FavoriteAppHotkey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export const scrcpyPresetLabels: Record<ScrcpyPreset, string> = {
  fast: 'Fast',
  high_quality: 'High quality',
  no_audio: 'No audio',
  record: 'Record'
}

export const viewTabs: Array<{ id: TabId; label: string; detail: string }> = [
  { id: 'remote', label: 'Remote', detail: 'Playback, typing, and transport.' },
  { id: 'apps', label: 'Apps', detail: 'Launch what is installed.' },
  { id: 'setup', label: 'Setup', detail: 'TVs, pairing, and connection.' },
  { id: 'phone', label: 'Phone', detail: 'Hand the remote to any phone on this network.' }
]

export function statusTone(status: ConnectionState['status']): Tone {
  switch (status) {
    case 'connected':
      return 'positive'
    case 'unauthorized':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function formatConnectionStatus(status: ConnectionState['status']): string {
  switch (status) {
    case 'disconnected':
      return 'Not connected'
    case 'pairing':
      return 'Pairing'
    case 'connecting':
      return 'Connecting'
    case 'connected':
      return 'Connected'
    case 'unauthorized':
      return 'Unauthorized'
    case 'error':
      return 'Connection error'
  }
}

export function backendLabel(backend: ConnectionBackend | null | undefined): string {
  if (backend === 'native') {
    return 'Native Remote'
  }

  if (backend === 'adb') {
    return 'ADB'
  }

  return 'Not connected'
}

export function applyDeviceToForm(device: SavedDevice): SetupFormState {
  return {
    name: device.name,
    host: device.host,
    preferredBackend: device.preferredBackend ?? 'adb',
    nativeRemotePort: String(device.nativeRemote?.remotePort ?? 6466),
    nativePairingPort: String(device.nativeRemote?.pairingPort ?? 6467),
    nativeCode: '',
    adbEnabled: device.adbEnabled !== false,
    adbMode: device.mode,
    connectPort: String(device.connectPort ?? 5555),
    adbPairPort: String(device.pairPort ?? 37099),
    adbPairCode: ''
  }
}

export function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return 'Never'
  }

  return new Date(timestamp).toLocaleString()
}

export function feedbackTone(status: ActionFeedback['status']): Tone {
  switch (status) {
    case 'success':
    case 'sent':
      return 'positive'
    case 'blocked':
      return 'warning'
    case 'error':
      return 'danger'
  }
}

/** Routine d-pad presses stay silent; only refusals and failures interrupt. */
export function shouldShowToast(feedback: ActionFeedback): boolean {
  return feedback.kind !== 'remote' || feedback.status === 'blocked' || feedback.status === 'error'
}

export function getBackendHealthLabel(
  snapshot: BackendHealthSnapshot | undefined,
  unavailableLabel: string
): string {
  if (!snapshot || !snapshot.available) {
    return unavailableLabel
  }

  if (snapshot.ready) {
    return 'Ready'
  }

  if (snapshot.lastError) {
    return 'Needs attention'
  }

  return 'Available'
}

export function getNativeSetupState(input: {
  hasSelectedTv: boolean
  waitingForNativeCode: boolean
  pendingNativePairing: DiagnosticsStatus['pendingNativePairing']
  isConnected: boolean
  activeBackend: ConnectionBackend | null
  nativePaired: boolean
  nativeLastError?: string
  nativeLastConnectedAt?: string
}): { badge: string; title: string; detail: string; tone: Tone } {
  if (!input.hasSelectedTv) {
    return {
      badge: 'Idle',
      title: 'Choose a TV first',
      detail: 'Native pairing stays off until you explicitly start it for a selected TV.',
      tone: 'neutral'
    }
  }

  if (input.waitingForNativeCode) {
    return {
      badge: 'Pairing',
      title: 'Waiting for the TV code',
      detail: input.pendingNativePairing
        ? `${input.pendingNativePairing.name} is waiting for a native pairing code.`
        : 'The TV should show a native pairing code before you confirm it here.',
      tone: 'warning'
    }
  }

  if (input.isConnected && input.activeBackend === 'native') {
    return {
      badge: 'Connected',
      title: 'Native remote is connected',
      detail: 'This TV is currently using the saved native pairing.',
      tone: 'positive'
    }
  }

  if (input.nativePaired) {
    return {
      badge: 'Saved',
      title: 'Native pairing is saved',
      detail: 'Use it only when you intentionally want to try the native path.',
      tone: 'positive'
    }
  }

  if (input.nativeLastError) {
    return {
      badge: 'Failed',
      title: 'Native pairing needs attention',
      detail: input.nativeLastError,
      tone: 'danger'
    }
  }

  return {
    badge: 'Optional',
    title: 'Native pairing is not saved yet',
    detail: input.nativeLastConnectedAt
      ? `Last successful native session was ${formatTimestamp(input.nativeLastConnectedAt)}. Pair again only if you want to reuse it.`
      : 'Nothing will start automatically. Start native pairing only if you want to try this optional path.',
    tone: 'neutral'
  }
}

export function filterPaletteItems(items: CommandPaletteItem[], query: string): CommandPaletteItem[] {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return items.slice(0, 18)
  }

  return items
    .filter((item) =>
      [item.label, item.detail, item.section].join(' ').toLowerCase().includes(normalized)
    )
    .slice(0, 24)
}

/** Two-letter monogram used when an app has no icon. */
export function appMonogram(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}

/** Stable per-package hue so icon-less tiles stay distinguishable. */
export function appHue(packageName: string): number {
  let hash = 0

  for (const character of packageName) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash % 360
}

export const keyBindings: Partial<Record<string, RemoteCommand>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  Escape: 'back',
  Backspace: 'back',
  MediaPlayPause: 'playPause',
  ' ': 'playPause',
  h: 'home',
  H: 'home',
  m: 'mute',
  M: 'mute',
  p: 'playPause',
  P: 'playPause',
  '+': 'volumeUp',
  '=': 'volumeUp',
  '-': 'volumeDown',
  _: 'volumeDown'
}

export const shortcutLegend = [
  { keys: 'Arrow keys', action: 'Move focus' },
  { keys: 'Enter', action: 'Select' },
  { keys: 'Esc / Backspace', action: 'Back' },
  { keys: 'Space / P', action: 'Play or pause' },
  { keys: 'H', action: 'Home' },
  { keys: 'M', action: 'Mute' },
  { keys: '+ / -', action: 'Volume' }
]

export const remoteCommandLabels: Record<RemoteCommand, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  select: 'OK',
  home: 'Home',
  back: 'Back',
  menu: 'Menu',
  appSwitch: 'Recent Apps',
  playPause: 'Play/Pause',
  rewind: 'Rewind',
  fastForward: 'Fast Forward',
  next: 'Next',
  previous: 'Previous',
  power: 'Power',
  sleep: 'Sleep',
  volumeUp: 'Volume Up',
  volumeDown: 'Volume Down',
  mute: 'Mute',
  enter: 'Enter',
  delete: 'Delete'
}

export interface CommandPaletteItem {
  id: string
  label: string
  detail: string
  section: 'Navigation' | 'Remote' | 'Apps' | 'TVs' | 'Recommended' | 'Power Tools'
  disabled?: boolean
  disabledReason?: string
}

export function shouldHandleRemoteKey(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') {
    return true
  }

  if (!(target instanceof HTMLElement)) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return tagName !== 'input' && tagName !== 'textarea' && !target.isContentEditable
}

export function getRecommendedActionMeta(action: RecommendedAction): { label: string; detail: string } {
  switch (action) {
    case 'pair_adb':
      return { label: 'Pair ADB', detail: 'Finish wireless debugging pairing for this TV.' }
    case 'connect_adb':
      return { label: 'Reconnect ADB', detail: 'Try the ADB path again.' }
    case 'switch_to_adb':
      return { label: 'Use ADB Instead', detail: 'Leave native pairing and switch back to ADB.' }
    case 'retry_native':
      return { label: 'Retry Native', detail: 'Try native remote pairing again.' }
    case 'open_remote':
      return { label: 'Open Remote', detail: 'Jump into the control view.' }
    case 'open_apps':
      return { label: 'Open Apps', detail: 'Browse installed apps for this TV.' }
  }
}

export function groupApps(
  apps: LaunchableApp[],
  activeDevice: SavedDevice | null,
  query: string
): {
  favorites: LaunchableApp[]
  recents: LaunchableApp[]
  others: LaunchableApp[]
} {
  const normalizedQuery = query.trim().toLowerCase()
  const visibleApps = normalizedQuery
    ? apps.filter(
        (app) =>
          app.displayName.toLowerCase().includes(normalizedQuery) ||
          app.packageName.toLowerCase().includes(normalizedQuery)
      )
    : apps

  const favorites = new Set(activeDevice?.favorites ?? [])
  const recentOrder = new Map(
    (activeDevice?.recentApps ?? []).map((entry, index) => [entry.packageName, index] as const)
  )

  const favoriteApps = visibleApps.filter((app) => favorites.has(app.packageName))
  const recentApps = visibleApps
    .filter((app) => !favorites.has(app.packageName) && recentOrder.has(app.packageName))
    .sort((left, right) => (recentOrder.get(left.packageName) ?? 99) - (recentOrder.get(right.packageName) ?? 99))
  const others = visibleApps.filter(
    (app) => !favorites.has(app.packageName) && !recentOrder.has(app.packageName)
  )

  return {
    favorites: favoriteApps,
    recents: recentApps,
    others
  }
}

export function getQuickActionLabel(action: QuickAction): string {
  return action.label
}

export function getVisibleRemoteButtons<T extends { command: RemoteCommand }>(
  buttons: T[],
  preferences: DevicePreferences | undefined
): T[] {
  const hidden = new Set(preferences?.remoteLayout.hiddenCommands ?? [])
  return buttons.filter((button) => !hidden.has(button.command))
}

export function getPinnedRemoteCommands(preferences: DevicePreferences | undefined): RemoteCommand[] {
  return preferences?.remoteLayout.pinnedCommands ?? []
}

export function canAssignFavoriteHotkey(device: SavedDevice | null, packageName: string): boolean {
  return Boolean(device?.favorites?.includes(packageName))
}

export function buildCommandPaletteItems(input: {
  isConnected: boolean
  appsReady: boolean
  typingReady: boolean
  scrcpyAvailable: boolean
  hasAppCache: boolean
  apps: LaunchableApp[]
  devices: SavedDevice[]
  quickActions: QuickAction[]
  recommendedActions: RecommendedAction[]
  appUpdateState: AppUpdateState
}): CommandPaletteItem[] {
  const needsConnection = input.isConnected ? undefined : 'Connect a TV first.'
  const needsApps = input.appsReady ? undefined : 'ADB app access is required.'

  const items: CommandPaletteItem[] = [
    { id: 'view:setup', label: 'Open Setup', detail: 'TVs, pairing, and connection.', section: 'Navigation' },
    { id: 'view:remote', label: 'Open Remote', detail: 'Playback, typing, and transport.', section: 'Navigation' },
    { id: 'view:apps', label: 'Open Apps', detail: 'Launch what is installed.', section: 'Navigation' },
    {
      id: 'system:wake',
      label: 'Wake and Reconnect',
      detail: 'Send ADB wake, then reconnect the selected TV.',
      section: 'Power Tools',
      disabled: Boolean(needsConnection || !input.typingReady),
      disabledReason: needsConnection ?? 'ADB fallback is required.'
    },
    {
      id: 'system:scrcpy',
      label: 'Open Screen Mirror',
      detail: 'Launch external scrcpy for this TV.',
      section: 'Power Tools',
      disabled: Boolean(needsConnection || !input.typingReady || !input.scrcpyAvailable),
      disabledReason: needsConnection ?? (!input.typingReady ? 'ADB fallback is required.' : 'Install scrcpy first.')
    },
    {
      id: 'system:sideload',
      label: 'Install APK',
      detail: 'Choose and install an APK through ADB.',
      section: 'Power Tools',
      disabled: Boolean(needsConnection || !input.typingReady),
      disabledReason: needsConnection ?? 'ADB fallback is required.'
    },
    {
      id: 'system:checkForUpdates',
      label: input.appUpdateState === 'downloaded' ? 'Restart to Finish Updating' : 'Check for Updates',
      detail: 'See if a newer version of Relay is available.',
      section: 'Power Tools',
      disabled: input.appUpdateState === 'checking' || input.appUpdateState === 'downloading'
    },
    {
      id: 'apps:fetch',
      label: input.hasAppCache ? 'Refresh Apps' : 'Fetch Apps',
      detail: 'Build the launchable app list for this TV.',
      section: 'Apps',
      disabled: Boolean(needsConnection || needsApps),
      disabledReason: needsConnection ?? needsApps
    }
  ]

  for (const command of ['home', 'back', 'mute', 'playPause', 'volumeUp', 'volumeDown'] as RemoteCommand[]) {
    items.push({
      id: `remote:${command}`,
      label: remoteCommandLabels[command],
      detail: 'Send this remote command to the active TV.',
      section: 'Remote',
      disabled: Boolean(needsConnection),
      disabledReason: needsConnection
    })
  }

  for (const action of input.quickActions) {
    items.push({
      id: `quick:${action.id}`,
      label: action.label,
      detail: action.detail,
      section: action.kind === 'app' ? 'Apps' : 'Remote',
      disabled: action.disabled,
      disabledReason: action.disabled ? action.detail : undefined
    })
  }

  for (const action of input.recommendedActions) {
    const meta = getRecommendedActionMeta(action)
    items.push({
      id: `recommended:${action}`,
      label: meta.label,
      detail: meta.detail,
      section: 'Recommended'
    })
  }

  for (const app of input.apps.slice(0, 30)) {
    items.push({
      id: `app:${app.packageName}`,
      label: app.displayName,
      detail: `Launch ${app.packageName}`,
      section: 'Apps',
      disabled: Boolean(needsConnection || needsApps),
      disabledReason: needsConnection ?? needsApps
    })
  }

  for (const device of input.devices) {
    items.push({
      id: `device:${device.id}`,
      label: `Connect ${device.name}`,
      detail: `${device.host} over ${device.preferredBackend === 'native' ? 'Native Remote' : 'ADB'}`,
      section: 'TVs'
    })
  }

  return items
}
