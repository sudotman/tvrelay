import { describe, expect, it } from 'vitest'
import {
  buildCommandPaletteItems,
  canAssignFavoriteHotkey,
  getRecommendedActionMeta,
  getVisibleRemoteButtons,
  groupApps,
  keyBindings
} from './viewModel'
import type { LaunchableApp, SavedDevice } from '@shared/types'

const apps: LaunchableApp[] = [
  {
    packageName: 'com.netflix.ninja',
    activity: 'com.netflix.ninja/com.netflix.ninja.MainActivity',
    displayName: 'Netflix',
    category: 'leanback'
  },
  {
    packageName: 'com.google.android.youtube.tv',
    activity: 'com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity',
    displayName: 'YouTube',
    category: 'leanback'
  },
  {
    packageName: 'com.spotify.tv.android',
    activity: 'com.spotify.tv.android/com.spotify.tv.android.SpotifyActivity',
    displayName: 'Spotify',
    category: 'leanback'
  }
]

describe('renderer view model', () => {
  it('maps the expanded keyboard shortcuts', () => {
    expect(keyBindings.Escape).toBe('back')
    expect(keyBindings.h).toBe('home')
    expect(keyBindings.m).toBe('mute')
    expect(keyBindings['+']).toBe('volumeUp')
    expect(keyBindings['-']).toBe('volumeDown')
  })

  it('groups apps into favorites, recents, and remaining apps', () => {
    const device: SavedDevice = {
      id: 'tv-1',
      name: 'Living Room',
      host: '192.168.1.2',
      connectPort: 5555,
      mode: 'connect',
      favorites: ['com.google.android.youtube.tv'],
      recentApps: [{ packageName: 'com.netflix.ninja', launchedAt: '2026-04-18T12:00:00.000Z' }]
    }

    const grouped = groupApps(apps, device, '')

    expect(grouped.favorites.map((app) => app.packageName)).toEqual(['com.google.android.youtube.tv'])
    expect(grouped.recents.map((app) => app.packageName)).toEqual(['com.netflix.ninja'])
    expect(grouped.others.map((app) => app.packageName)).toEqual(['com.spotify.tv.android'])
  })

  it('returns readable labels for recommended actions', () => {
    expect(getRecommendedActionMeta('pair_adb').label).toBe('Pair ADB')
    expect(getRecommendedActionMeta('open_apps').detail).toContain('Browse installed apps')
  })

  it('builds disabled palette power tools when adb-backed capabilities are unavailable', () => {
    const items = buildCommandPaletteItems({
      isConnected: true,
      appsReady: false,
      typingReady: false,
      scrcpyAvailable: false,
      hasAppCache: false,
      apps: [],
      devices: [],
      quickActions: [],
      recommendedActions: []
    })

    expect(items.find((item) => item.id === 'system:wake')?.disabledReason).toContain('ADB')
    expect(items.find((item) => item.id === 'system:scrcpy')?.disabledReason).toContain('ADB')
    expect(items.find((item) => item.id === 'system:sideload')?.disabled).toBe(true)
  })

  it('filters hidden remote layout commands', () => {
    const visible = getVisibleRemoteButtons(
      [
        { label: 'Home', command: 'home' as const },
        { label: 'Power', command: 'power' as const }
      ],
      {
        remoteLayout: { pinnedCommands: ['home'], hiddenCommands: ['power'] },
        appHotkeys: {},
        scrcpyPreset: 'fast'
      }
    )

    expect(visible.map((button) => button.command)).toEqual(['home'])
  })

  it('allows number hotkeys only for favorite apps', () => {
    const device: SavedDevice = {
      id: 'tv-1',
      name: 'Living Room',
      host: '192.168.1.2',
      connectPort: 5555,
      mode: 'connect',
      favorites: ['com.netflix.ninja']
    }

    expect(canAssignFavoriteHotkey(device, 'com.netflix.ninja')).toBe(true)
    expect(canAssignFavoriteHotkey(device, 'com.spotify.tv.android')).toBe(false)
  })
})
