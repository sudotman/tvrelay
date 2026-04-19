import { EventEmitter } from 'node:events'
import { Bonjour } from 'bonjour-service'
import { AndroidRemote, RemoteDirection } from 'androidtv-remote'
import type {
  DiscoveredNativeDevice,
  NativeRemoteCertificate,
  PendingNativePairing,
  SavedDevice
} from '@shared/types'

const CLIENT_NAME = 'Android TV Remote Desktop'
const DISCOVERY_TIMEOUT_MS = 4_000
const CONNECT_TIMEOUT_MS = 10_000
const PAIRING_CONFIRM_TIMEOUT_MS = 15_000
const DISCOVERY_SERVICE_TYPES = ['androidtvremote2', 'androidtvremote'] as const

export interface NativeRemoteConnectResult {
  status: 'connected' | 'pairing'
  certificate?: NativeRemoteCertificate
}

type NativeRemoteServiceEvents = {
  unpaired: [string]
}

export class NativeRemoteService extends EventEmitter<NativeRemoteServiceEvents> {
  private activeClient: AndroidRemote | null = null
  private pendingClient: AndroidRemote | null = null
  private activeConnected = false
  private pendingDevice: Pick<SavedDevice, 'id' | 'name' | 'host'> | null = null

  async discoverDevices(timeoutMs = DISCOVERY_TIMEOUT_MS): Promise<DiscoveredNativeDevice[]> {
    const bonjour = new Bonjour()
    const found = new Map<string, DiscoveredNativeDevice>()
    const browsers = DISCOVERY_SERVICE_TYPES.map((type) => bonjour.find({ type, protocol: 'tcp' }))

    const onServiceUp = (service: {
      name: string
      type: string
      port: number
      addresses: string[]
    }) => {
      const host = service.addresses.find((address: string) => /^\d+\.\d+\.\d+\.\d+$/.test(address))

      if (!host) {
        return
      }

      const key = `${service.type}:${service.name}:${host}:${service.port}`

      found.set(key, {
        name: service.name,
        host,
        remotePort: service.port,
        pairingPort: service.port + 1,
        serviceLabel: service.name
      })
    }

    for (const browser of browsers) {
      browser.on('up', onServiceUp)
    }

    await new Promise((resolve) => setTimeout(resolve, timeoutMs))
    for (const browser of browsers) {
      browser.stop()
    }
    bonjour.destroy()

    return [...found.values()]
      .reduce<DiscoveredNativeDevice[]>((devices, current) => {
        if (devices.some((device) => device.host === current.host && device.remotePort === current.remotePort)) {
          return devices
        }

        devices.push(current)
        return devices
      }, [])
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  async connect(device: SavedDevice): Promise<NativeRemoteConnectResult> {
    if (!device.nativeRemote) {
      throw new Error('This TV does not have a native remote profile saved yet.')
    }

    this.disconnect()

    const client = new AndroidRemote(device.host, {
      pairing_port: device.nativeRemote.pairingPort,
      remote_port: device.nativeRemote.remotePort,
      name: CLIENT_NAME,
      cert: device.nativeRemote.certificate ?? {}
    })

    return new Promise((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        onError(
          new Error('Timed out waiting for native remote. If the TV never shows a code, cancel this and use ADB instead.')
        )
      }, CONNECT_TIMEOUT_MS)

      const cleanup = () => {
        clearTimeout(timeout)
        client.removeListener('ready', onReady)
        client.removeListener('secret', onSecret)
        client.removeListener('error', onError)
        client.removeListener('unpaired', onUnpaired)
      }

      const finish = (fn: () => void) => {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        fn()
      }

      const onReady = () => {
        finish(() => {
          this.activeClient = client
          this.activeConnected = true
          this.pendingClient = null
          this.pendingDevice = null
          this.attachActiveLifecycle(client)
          resolve({
            status: 'connected',
            certificate: client.getCertificate()
          })
        })
      }

      const onSecret = () => {
        finish(() => {
          this.pendingClient = client
          this.pendingDevice = {
            id: device.id,
            name: device.name,
            host: device.host
          }
          resolve({
            status: 'pairing'
          })
        })
      }

      const onError = (error: unknown) => {
        finish(() => {
          this.destroyClient(client)
          reject(this.normalizeError(error, 'Native remote connection failed.'))
        })
      }

      const onUnpaired = () => {
        finish(() => {
          this.destroyClient(client)
          reject(new Error('Saved native remote pairing is no longer valid. Pair again.'))
        })
      }

      client.once('ready', onReady)
      client.once('secret', onSecret)
      client.once('error', onError)
      client.once('unpaired', onUnpaired)

      void client.start().then((started) => {
        if (started === false) {
          onError(new Error('Native remote session did not start.'))
        }
      }).catch(onError)
    })
  }

  async completePairing(code: string): Promise<NativeRemoteCertificate> {
    const client = this.pendingClient

    if (!client || !this.pendingDevice) {
      throw new Error('There is no native pairing session waiting for a code.')
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        onError(new Error('Timed out waiting for the TV to accept the native pairing code.'))
      }, PAIRING_CONFIRM_TIMEOUT_MS)

      const cleanup = () => {
        clearTimeout(timeout)
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
        client.removeListener('unpaired', onUnpaired)
      }

      const onReady = () => {
        cleanup()
        this.pendingClient = null
        this.pendingDevice = null
        this.activeClient = client
        this.activeConnected = true
        this.attachActiveLifecycle(client)
        resolve(client.getCertificate())
      }

      const onError = (error: unknown) => {
        cleanup()
        this.destroyClient(client)
        this.pendingClient = null
        this.pendingDevice = null
        reject(this.normalizeError(error, 'Native pairing failed.'))
      }

      const onUnpaired = () => {
        cleanup()
        this.destroyClient(client)
        this.pendingClient = null
        this.pendingDevice = null
        reject(new Error('Native pairing was rejected by the TV.'))
      }

      client.once('ready', onReady)
      client.once('error', onError)
      client.once('unpaired', onUnpaired)

      const accepted = client.sendCode(code.trim().replace(/\s+/g, '').toUpperCase())

      if (!accepted) {
        onError(new Error('The pairing code did not match the TV prompt.'))
      }
    })
  }

  getPendingPairing(): PendingNativePairing | null {
    return this.pendingDevice
  }

  isConnected(): boolean {
    return this.activeConnected && this.activeClient !== null
  }

  sendKey(keyCode: number): void {
    if (!this.activeClient || !this.activeConnected) {
      throw new Error('Native remote is not connected yet.')
    }

    this.activeClient.sendKey(keyCode, RemoteDirection.SHORT)
  }

  sendAppLink(appLink: string): void {
    if (!this.activeClient || !this.activeConnected) {
      throw new Error('Native remote is not connected yet.')
    }

    this.activeClient.sendAppLink(appLink)
  }

  disconnect(): void {
    this.activeConnected = false

    if (this.activeClient) {
      this.destroyClient(this.activeClient)
      this.activeClient = null
    }

    if (this.pendingClient) {
      this.destroyClient(this.pendingClient)
      this.pendingClient = null
    }

    this.pendingDevice = null
  }

  private attachActiveLifecycle(client: AndroidRemote): void {
    client.removeAllListeners('unpaired')
    client.on('unpaired', () => {
      this.activeConnected = false
      this.activeClient = null
      this.emit('unpaired', 'Native remote pairing was cleared by the TV. Pair it again.')
    })

    client.on('error', () => {
      this.activeConnected = false
    })
  }

  private destroyClient(client: AndroidRemote): void {
    client.stop?.()
    client.remoteManager?.client?.destroy()
    client.pairingManager?.client?.destroy()
  }

  private normalizeError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof Error) {
      return error
    }

    if (typeof error === 'string' && error.trim()) {
      return new Error(error)
    }

    return new Error(fallbackMessage)
  }
}
