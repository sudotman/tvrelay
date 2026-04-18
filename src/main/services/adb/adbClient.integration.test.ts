import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AdbClient } from './adbClient'
import { DeviceManager } from '../deviceManager'
import type { DeviceStore, DeviceStoreSnapshot } from '../deviceStore'
import type { NativeRemoteService } from '../native/nativeRemoteService'

interface MockState {
  pairSuccess: boolean
  connectSuccess: boolean
  serialState: 'device' | 'unauthorized' | 'missing'
}

function createStore(): DeviceStore {
  let snapshot: DeviceStoreSnapshot = { savedDevices: [], activeDeviceId: null }
  return {
    load: () => snapshot,
    save: (next) => {
      snapshot = next
    }
  }
}

function createNativeRemoteService(): NativeRemoteService {
  return {
    on: () => createNativeRemoteService() as any,
    disconnect: () => undefined,
    discoverDevices: async () => [],
    connect: async () => {
      throw new Error('Not used in ADB integration tests.')
    },
    completePairing: async () => ({ key: '', cert: '' }),
    isConnected: () => false,
    getPendingPairing: () => null,
    sendKey: () => undefined,
    sendAppLink: () => undefined
  } as unknown as NativeRemoteService
}

async function createMockAdb(initialState: MockState): Promise<{ adbPath: string; statePath: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mock-adb-'))
  const adbPath = path.join(tempDir, 'adb')
  const statePath = path.join(tempDir, 'state.json')
  await fs.writeFile(statePath, JSON.stringify(initialState), 'utf8')

  const script = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const statePath = path.join(__dirname, 'state.json')
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
const args = process.argv.slice(2)

function writeState(next) {
  fs.writeFileSync(statePath, JSON.stringify(next), 'utf8')
}

if (args[0] === 'version') {
  console.log('Android Debug Bridge version 1.0.41')
  process.exit(0)
}

if (args[0] === 'pair') {
  if (state.pairSuccess) {
    console.log('Successfully paired to 192.168.1.5:37099 [guid=mock]')
    process.exit(0)
  }
  console.error('Failed: wrong code')
  process.exit(1)
}

if (args[0] === 'connect') {
  if (state.connectSuccess) {
    console.log('connected to 192.168.1.5:5555')
    process.exit(0)
  }
  console.error('failed to connect to 192.168.1.5:5555')
  process.exit(1)
}

if (args[0] === 'disconnect') {
  const next = { ...state, serialState: 'missing' }
  writeState(next)
  console.log('disconnected')
  process.exit(0)
}

if (args[0] === 'devices') {
  console.log('List of devices attached')
  if (state.serialState !== 'missing') {
    console.log('192.168.1.5:5555\\t' + state.serialState)
  }
  process.exit(0)
}

if (args[0] === '-s' && args[2] === 'shell' && args[3] === 'cmd' && args[4] === 'package') {
  console.log('com.netflix.ninja/.MainActivity')
  process.exit(0)
}

if (args[0] === '-s' && args[2] === 'shell' && args[3] === 'am' && args[4] === 'start') {
  console.log('Starting: ' + args[6])
  process.exit(0)
}

if (args[0] === '-s' && args[2] === 'shell' && args[3] === 'input') {
  process.exit(0)
}

console.error('Unsupported args: ' + args.join(' '))
process.exit(1)
`

  await fs.writeFile(adbPath, script, { mode: 0o755 })
  return { adbPath, statePath }
}

afterEach(() => {
  // no-op: temp directories can be cleaned by the OS
})

describe('AdbClient integration', () => {
  it('handles pair success and launchable app parsing', async () => {
    const { adbPath } = await createMockAdb({
      pairSuccess: true,
      connectSuccess: true,
      serialState: 'device'
    })
    const client = new AdbClient(adbPath)

    await expect(client.pair('192.168.1.5', 37099, '654321')).resolves.toBeUndefined()
    await expect(client.connect('192.168.1.5', 5555)).resolves.toBeUndefined()
    await expect(client.listLaunchableApps('192.168.1.5:5555')).resolves.toHaveLength(1)
  })

  it('surfaces unauthorized devices through the manager', async () => {
    const { adbPath } = await createMockAdb({
      pairSuccess: true,
      connectSuccess: true,
      serialState: 'unauthorized'
    })

    const manager = new DeviceManager(createStore(), new AdbClient(adbPath), createNativeRemoteService())
    await manager.init()
    const state = await manager.connectDevice({
      name: 'Bedroom TV',
      host: '192.168.1.5',
      connectPort: 5555,
      mode: 'connect'
    })

    expect(state.status).toBe('unauthorized')
    manager.dispose()
  })

  it('reports stale hosts as connection errors', async () => {
    const { adbPath } = await createMockAdb({
      pairSuccess: true,
      connectSuccess: false,
      serialState: 'missing'
    })

    const manager = new DeviceManager(createStore(), new AdbClient(adbPath), createNativeRemoteService())
    await manager.init()

    await expect(
      manager.connectDevice({
        name: 'Bedroom TV',
        host: '192.168.1.5',
        connectPort: 5555,
        mode: 'connect'
      })
    ).rejects.toThrow(/failed to connect/i)
    manager.dispose()
  })

  it('recovers from a dropped connection on health check', async () => {
    const { adbPath, statePath } = await createMockAdb({
      pairSuccess: true,
      connectSuccess: true,
      serialState: 'device'
    })

    const manager = new DeviceManager(createStore(), new AdbClient(adbPath), createNativeRemoteService())
    await manager.init()
    await manager.connectDevice({
      id: 'tv-1',
      name: 'Bedroom TV',
      host: '192.168.1.5',
      connectPort: 5555,
      mode: 'connect'
    })

    await fs.writeFile(
      statePath,
      JSON.stringify({
        pairSuccess: true,
        connectSuccess: true,
        serialState: 'missing'
      }),
      'utf8'
    )

    await fs.writeFile(
      statePath,
      JSON.stringify({
        pairSuccess: true,
        connectSuccess: true,
        serialState: 'device'
      }),
      'utf8'
    )

    const state = await manager.performHealthCheck()
    expect(state.status).toBe('connected')
    manager.dispose()
  })
})
