import type {
  DevicePreferences,
  LaunchableApp,
  QuickAction,
  RecommendedAction,
  RemoteCommand,
  SavedDevice
} from '@shared/types'

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
