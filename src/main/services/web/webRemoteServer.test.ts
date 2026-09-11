import http from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebRemoteServer } from './webRemoteServer'
import type { ActionController } from '../actionController'
import type { AppController } from '../appController'
import type { DeviceManager } from '../deviceManager'
import type { RemoteController } from '../remoteController'
import type { SettingsStore, WebRemoteSettings } from '../settingsStore'
import type { ActionFeedback, SavedDevice } from '@shared/types'

const TOKEN = 'TESTTOKEN123'

function createFeedback(title: string): ActionFeedback {
  return {
    id: 'feedback-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    status: 'sent',
    kind: 'remote',
    title,
    detail: 'ok'
  }
}

const activeDevice = {
  id: 'tv-1',
  name: 'Bedroom TV',
  host: '192.168.1.40',
  connectPort: 5555,
  mode: 'connect',
  favorites: ['com.netflix.ninja'],
  recentApps: [{ packageName: 'com.plex', launchedAt: '2024-01-01T00:00:00.000Z' }],
  cachedApps: {
    updatedAt: '2024-01-01T00:00:00.000Z',
    apps: [
      {
        packageName: 'com.netflix.ninja',
        activity: '.MainActivity',
        displayName: 'Netflix',
        category: 'leanback' as const,
        iconDataUrl: `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`
      },
      {
        packageName: 'com.plex',
        activity: '.MainActivity',
        displayName: 'Plex',
        category: 'leanback' as const
      }
    ]
  }
} as unknown as SavedDevice

function createHarness() {
  const listeners = new Map<string, Array<(payload: unknown) => void>>()
  const stored: WebRemoteSettings = { enabled: false, port: 0, token: TOKEN }

  const settings: SettingsStore = {
    getWebRemote: () => stored,
    setWebRemote: (next) => Object.assign(stored, next)
  }

  const deviceManager = {
    on: (event: string, listener: (payload: unknown) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    getActiveDevice: () => activeDevice,
    getActiveBackend: () => 'adb' as const,
    getConnectionState: () => ({ status: 'connected' as const, deviceId: 'tv-1' }),
    getCapabilities: () => ({ nativeRemote: false, adbFallback: true, typing: true, apps: true }),
    listDevices: () => [activeDevice],
    wakeAndReconnect: vi.fn(async () => createFeedback('Woke the TV')),
    connectDevice: vi.fn(async () => ({ status: 'connected' as const })),
    disconnectActiveDevice: vi.fn(async () => ({ status: 'disconnected' as const }))
  } as unknown as DeviceManager

  const remoteController = {
    sendCommand: vi.fn(async () => createFeedback('Home signal sent')),
    sendText: vi.fn(async () => createFeedback('Text sent'))
  } as unknown as RemoteController

  const appController = {
    launchPackage: vi.fn(async () => createFeedback('Launch requested')),
    listApps: vi.fn(async () => activeDevice.cachedApps!.apps),
    toggleFavorite: vi.fn(async () => activeDevice),
    getCachedForegroundApp: vi.fn(() => ({
      packageName: 'com.netflix.ninja',
      displayName: 'Netflix'
    }))
  } as unknown as AppController

  const actionController = {
    runQuickAction: vi.fn(async () => createFeedback('Quick action'))
  } as unknown as ActionController

  const server = new WebRemoteServer({
    settings,
    deviceManager,
    remoteController,
    appController,
    actionController
  })

  return { server, deviceManager, remoteController, appController, actionController, listeners }
}

describe('WebRemoteServer', () => {
  let harness: ReturnType<typeof createHarness>
  let origin: string

  beforeEach(async () => {
    harness = createHarness()
    await harness.server.init()
    // Port 0 asks the OS for a free port; read back what it actually bound.
    await harness.server.update({ enabled: true, port: 45_871 })
    origin = `http://127.0.0.1:45871`
  })

  afterEach(async () => {
    await harness.server.update({ enabled: false })
  })

  it('serves the phone UI without a token', async () => {
    const response = await fetch(`${origin}/`)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(body).toContain('Relay Remote')
  })

  it('rejects api calls that do not present the token', async () => {
    const response = await fetch(`${origin}/api/snapshot`)

    expect(response.status).toBe(401)
    expect(harness.remoteController.sendCommand).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    const response = await fetch(`${origin}/api/snapshot`, {
      headers: { 'X-Relay-Token': 'WRONGTOKEN99' }
    })

    expect(response.status).toBe(401)
  })

  it('returns a snapshot that omits icon payloads but flags which apps have one', async () => {
    const response = await fetch(`${origin}/api/snapshot`, {
      headers: { 'X-Relay-Token': TOKEN }
    })
    const snapshot = await response.json()

    expect(response.status).toBe(200)
    expect(snapshot.device).toEqual({ id: 'tv-1', name: 'Bedroom TV', host: '192.168.1.40' })
    expect(snapshot.apps).toEqual([
      {
        packageName: 'com.netflix.ninja',
        displayName: 'Netflix',
        category: 'leanback',
        hasIcon: true,
        favorite: true
      },
      {
        packageName: 'com.plex',
        displayName: 'Plex',
        category: 'leanback',
        hasIcon: false,
        favorite: false
      }
    ])
    expect(snapshot.foregroundApp).toEqual({
      packageName: 'com.netflix.ninja',
      displayName: 'Netflix'
    })
    expect(JSON.stringify(snapshot)).not.toContain('base64')
  })

  it('forwards remote commands to the remote controller', async () => {
    const response = await fetch(`${origin}/api/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Token': TOKEN },
      body: JSON.stringify({ command: 'home' })
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(harness.remoteController.sendCommand).toHaveBeenCalledWith('home')
    expect(payload.feedback.title).toBe('Home signal sent')
  })

  it('reports a controller failure as a conflict instead of a crash', async () => {
    vi.mocked(harness.remoteController.sendCommand).mockRejectedValueOnce(
      new Error('Connect to a TV before using the remote.')
    )

    const response = await fetch(`${origin}/api/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Token': TOKEN },
      body: JSON.stringify({ command: 'home' })
    })

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/Connect to a TV/)
  })

  it('accepts the token as a query parameter so EventSource can stream', async () => {
    const controller = new AbortController()
    const response = await fetch(`${origin}/api/events?t=${TOKEN}`, { signal: controller.signal })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const reader = response.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain('retry:')

    controller.abort()
  })

  it('decodes cached icons into real images', async () => {
    const response = await fetch(
      `${origin}/api/icon?package=com.netflix.ninja&t=${TOKEN}`
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('fake-png')
  })

  it('404s an icon the active device does not have', async () => {
    const response = await fetch(`${origin}/api/icon?package=com.plex&t=${TOKEN}`)

    expect(response.status).toBe(404)
  })

  it('rotates the token and stops accepting the old one', async () => {
    const before = harness.server.getStatus().token
    const after = (await harness.server.update({ rotateToken: true })).token

    expect(after).not.toBe(before)

    const response = await fetch(`http://127.0.0.1:45871/api/snapshot`, {
      headers: { 'X-Relay-Token': before }
    })
    expect(response.status).toBe(401)
  })

  it('stops listening once disabled', async () => {
    await harness.server.update({ enabled: false })

    expect(harness.server.getStatus().running).toBe(false)
    await expect(fetch(`${origin}/api/snapshot`)).rejects.toThrow()
  })

  it('reports a busy port instead of throwing, and stays not running', async () => {
    await harness.server.update({ enabled: false })

    const squatter = http.createServer()
    await new Promise<void>((resolve) => squatter.listen(45_871, '0.0.0.0', resolve))

    try {
      const status = await harness.server.update({ enabled: true, port: 45_871 })

      expect(status.running).toBe(false)
      expect(status.lastError).toMatch(/already in use/i)
      expect(status.primaryUrl).toBeNull()
    } finally {
      await new Promise<void>((resolve) => squatter.close(() => resolve()))
    }
  })

  it('exposes a scannable url and matching qr code while running', () => {
    const status = harness.server.getStatus()

    expect(status.running).toBe(true)
    expect(status.primaryUrl).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:45871\/\?t=/)
    expect(status.qrSvg).toContain('<svg')
  })
})
