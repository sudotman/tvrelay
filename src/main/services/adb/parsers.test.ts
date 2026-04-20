import { describe, expect, it } from 'vitest'
import {
  chunkAdbText,
  deriveConnectionState,
  parseAdbMdnsServices,
  parseForegroundApp,
  parseAdbDevices,
  parseLaunchableApps,
  shouldAttemptReconnect
} from './parsers'
import type { SavedDevice } from '@shared/types'

describe('adb parsers', () => {
  it('parses devices output', () => {
    const parsed = parseAdbDevices(`
      List of devices attached
      192.168.1.2:5555\tdevice
      192.168.1.3:5555\tunauthorized
    `)

    expect(parsed).toEqual([
      { serial: '192.168.1.2:5555', state: 'device' },
      { serial: '192.168.1.3:5555', state: 'unauthorized' }
    ])
  })

  it('parses adb mdns services output', () => {
    const parsed = parseAdbMdnsServices(`
      List of discovered mdns services
      adb-14141FDF600081-QXjCrW  _adb-tls-pairing._tcp  192.168.86.38:33861
      adb-14141FDF600081-TnSdi9  _adb-tls-connect._tcp  192.168.86.38:33015
      adb-legacy                 _adb._tcp              192.168.86.38:5555
    `)

    expect(parsed).toEqual([
      {
        name: 'adb-14141FDF600081-QXjCrW',
        host: '192.168.86.38',
        port: 33861,
        serviceType: 'pairing'
      },
      {
        name: 'adb-14141FDF600081-TnSdi9',
        host: '192.168.86.38',
        port: 33015,
        serviceType: 'connect'
      },
      {
        name: 'adb-legacy',
        host: '192.168.86.38',
        port: 5555,
        serviceType: 'legacy'
      }
    ])
  })

  it('parses launchable apps and normalizes dotted activity names', () => {
    const apps = parseLaunchableApps(
      `
      com.netflix.ninja/.MainActivity
      com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity
      `,
      'leanback'
    )

    expect(apps).toEqual([
      {
        packageName: 'com.netflix.ninja',
        activity: 'com.netflix.ninja/com.netflix.ninja.MainActivity',
        displayName: 'Netflix',
        category: 'leanback'
      },
      {
        packageName: 'com.google.android.youtube.tv',
        activity:
          'com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity',
        displayName: 'YouTube',
        category: 'leanback'
      }
    ])
  })

  it('uses friendlier titles for known or compound package names', () => {
    const apps = parseLaunchableApps(
      `
      com.apple.atve.androidtv.appletv/.MainActivity
      com.xiaomi.mitv.manualhelp/.MainActivity
      `,
      'launcher'
    )

    expect(apps).toEqual([
      {
        packageName: 'com.apple.atve.androidtv.appletv',
        activity: 'com.apple.atve.androidtv.appletv/com.apple.atve.androidtv.appletv.MainActivity',
        displayName: 'Apple TV',
        category: 'launcher'
      },
      {
        packageName: 'com.xiaomi.mitv.manualhelp',
        activity: 'com.xiaomi.mitv.manualhelp/com.xiaomi.mitv.manualhelp.MainActivity',
        displayName: 'Manual Help',
        category: 'launcher'
      }
    ])
  })

  it('escapes and chunks text for adb input', () => {
    const chunks = chunkAdbText('Hello TV & chill', 12)
    expect(chunks).toEqual(['Hello%sTV%s', '\\&%schill'])
  })

  it('derives connection status for active serials', () => {
    expect(
      deriveConnectionState([{ serial: '192.168.1.2:5555', state: 'device' }], '192.168.1.2:5555', 'tv-1')
    ).toEqual({
      status: 'connected',
      deviceId: 'tv-1'
    })
  })

  it('parses the foreground app from dumpsys output', () => {
    expect(
      parseForegroundApp(
        'mCurrentFocus=Window{123456 u0 com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity}'
      )
    ).toEqual({
      packageName: 'com.google.android.youtube.tv',
      activity: 'com.google.android.apps.youtube.tv.activity.ShellActivity',
      displayName: 'YouTube'
    })
  })

  it('determines whether reconnect should run', () => {
    const device: SavedDevice = {
      id: 'tv-1',
      name: 'Living Room',
      host: '192.168.1.2',
      connectPort: 5555,
      mode: 'connect'
    }

    expect(shouldAttemptReconnect(device, { status: 'error' }, false)).toBe(true)
    expect(shouldAttemptReconnect(device, { status: 'connected' }, false)).toBe(false)
    expect(shouldAttemptReconnect(device, { status: 'disconnected' }, true)).toBe(false)
  })
})
