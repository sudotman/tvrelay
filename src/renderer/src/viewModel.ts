import type {
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
