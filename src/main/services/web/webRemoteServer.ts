import { EventEmitter } from 'node:events'
import http from 'node:http'
import os from 'node:os'
import { createHash, timingSafeEqual } from 'node:crypto'
import type {
  ActionFeedback,
  RemoteCommand,
  UpdateWebRemoteInput,
  WebRemoteAddress,
  WebRemoteStatus
} from '@shared/types'
import type { ActionController } from '../actionController'
import type { AppController } from '../appController'
import type { DeviceManager } from '../deviceManager'
import type { RemoteController } from '../remoteController'
import type { SettingsStore, WebRemoteSettings } from '../settingsStore'
import { createWebRemoteToken, DEFAULT_WEB_REMOTE_PORT } from '../settingsStore'
import { renderQrCodeSvg } from './qrcode'
import { WEB_ASSETS } from './assets'

const MAX_BODY_BYTES = 64 * 1024
const HEARTBEAT_MS = 20_000
const ICON_CACHE_HEADER = 'public, max-age=86400'
const SESSION_COOKIE = 'relay_session'
/** A year: a paired phone should never have to be shown the code again. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

interface WebRemoteServerOptions {
  settings: SettingsStore
  deviceManager: DeviceManager
  remoteController: RemoteController
  appController: AppController
  actionController: ActionController
}

interface JsonResult {
  status: number
  body: unknown
}

function isPrivateAddress(address: string): boolean {
  return (
    address.startsWith('192.168.') ||
    address.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  )
}

/** LAN addresses this machine can be reached on, best candidate first. */
function collectAddresses(port: number): WebRemoteAddress[] {
  const interfaces = os.networkInterfaces()
  const addresses: Array<WebRemoteAddress & { rank: number }> = []

  for (const [label, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue
      }

      const isWireless = /^(en0|en1|wlan|wl)/i.test(label)
      addresses.push({
        label,
        host: entry.address,
        url: `http://${entry.address}:${port}/`,
        rank: (isPrivateAddress(entry.address) ? 0 : 2) + (isWireless ? 0 : 1)
      })
    }
  }

  return addresses
    .sort((left, right) => left.rank - right.rank || left.host.localeCompare(right.host))
    .map(({ rank: _rank, ...address }) => address)
}

function tokensMatch(expected: string, received: string): boolean {
  // Hash first so the comparison length never leaks and stays constant-time.
  const left = createHash('sha256').update(expected).digest()
  const right = createHash('sha256').update(received).digest()
  return timingSafeEqual(left, right)
}

function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {}

  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=')

    if (separator > 0) {
      jar[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim())
    }
  }

  return jar
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'))
        request.destroy()
        return
      }

      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export declare interface WebRemoteServer {
  on(event: 'status', listener: (status: WebRemoteStatus) => void): this
  emit(event: 'status', status: WebRemoteStatus): boolean
}

export class WebRemoteServer extends EventEmitter {
  private server: http.Server | null = null
  private settings: WebRemoteSettings
  private readonly clients = new Set<http.ServerResponse>()
  private heartbeat: NodeJS.Timeout | null = null
  private lastError: string | undefined
  private running = false

  constructor(private readonly options: WebRemoteServerOptions) {
    super()
    this.settings = options.settings.getWebRemote()
  }

  async init(): Promise<void> {
    this.options.deviceManager.on('connectionState', () => this.broadcastSnapshot())
    this.options.deviceManager.on('devicesChanged', () => this.broadcastSnapshot())

    if (this.settings.enabled) {
      await this.start().catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error)
      })
    }
  }

  getStatus(): WebRemoteStatus {
    const addresses = this.running ? collectAddresses(this.settings.port) : []
    const primary = addresses[0] ?? null
    const primaryUrl = primary ? `${primary.url}?t=${this.settings.token}` : null

    return {
      enabled: this.settings.enabled,
      running: this.running,
      port: this.settings.port,
      token: this.settings.token,
      addresses,
      primaryUrl,
      connectedClients: this.clients.size,
      lastError: this.lastError,
      qrSvg: primaryUrl ? renderQrCodeSvg(primaryUrl) : null
    }
  }

  async update(input: UpdateWebRemoteInput): Promise<WebRemoteStatus> {
    const nextPort =
      input.port === undefined ? this.settings.port : this.normalizePort(input.port)
    const nextEnabled = input.enabled ?? this.settings.enabled
    const nextToken = input.rotateToken ? createWebRemoteToken() : this.settings.token
    const needsRestart =
      this.running && (nextPort !== this.settings.port || nextToken !== this.settings.token)

    this.settings = { enabled: nextEnabled, port: nextPort, token: nextToken }
    this.options.settings.setWebRemote(this.settings)

    if (!nextEnabled) {
      await this.stop()
    } else if (needsRestart || !this.running) {
      await this.stop()
      await this.start().catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error)
      })
    }

    const status = this.getStatus()
    this.emit('status', status)
    return status
  }

  dispose(): void {
    void this.stop()
  }

  private normalizePort(port: number): number {
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      return DEFAULT_WEB_REMOTE_PORT
    }

    return Math.floor(port)
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const server = http.createServer((request, response) => {
        void this.handleRequest(request, response)
      })

      server.on('error', (error: NodeJS.ErrnoException) => {
        this.lastError =
          error.code === 'EADDRINUSE'
            ? `Port ${this.settings.port} is already in use. Pick another port.`
            : error.message

        // Errors after a successful listen are runtime faults, not a failed start,
        // so they must not tear down a server that is still bound.
        if (settled) {
          this.emit('status', this.getStatus())
          return
        }

        settled = true
        this.running = false
        this.server = null
        this.emit('status', this.getStatus())
        reject(error)
      })

      server.listen(this.settings.port, '0.0.0.0', () => {
        settled = true
        this.server = server
        this.running = true
        this.lastError = undefined
        this.heartbeat = setInterval(() => {
          for (const client of this.clients) {
            client.write(': ping\n\n')
          }
        }, HEARTBEAT_MS)
        this.emit('status', this.getStatus())
        resolve()
      })
    })
  }

  private async stop(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }

    for (const client of this.clients) {
      client.end()
    }
    this.clients.clear()

    const server = this.server

    if (!server) {
      this.running = false
      return
    }

    this.server = null
    this.running = false

    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
  }

  /**
   * The cookie is what keeps a paired phone signed in. The header and the query
   * parameter stay for the scanned link and for clients that keep no cookies.
   */
  private authorize(request: http.IncomingMessage, url: URL): boolean {
    const cookies = parseCookies(request.headers.cookie)
    const candidates = [
      request.headers['x-relay-token'] as string | undefined,
      url.searchParams.get('t'),
      cookies[SESSION_COOKIE]
    ]

    return candidates.some(
      (candidate) => Boolean(candidate) && tokensMatch(this.settings.token, candidate as string)
    )
  }

  /**
   * HttpOnly so page scripts can never read the code back out, and SameSite=Lax
   * so no other site can make the phone fire a command with the cookie attached.
   * Rotating the code changes the value every cookie is compared against, so
   * "New code" still signs every phone out.
   */
  private sessionCookie(token: string): string {
    return (
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; ` +
      `Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax`
    )
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const path = url.pathname

    // No cross-origin access: the phone UI is same-origin and sends its own header.
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')

    const asset = WEB_ASSETS[path === '/' ? '/index.html' : path]

    if (asset) {
      const headers: http.OutgoingHttpHeaders = {
        'Content-Type': asset.contentType,
        'Cache-Control': 'no-cache'
      }

      // A scanned link carries the code, so pair the phone on that first load
      // and it never sees the gate again.
      const scanned = url.searchParams.get('t')

      if (scanned && tokensMatch(this.settings.token, scanned)) {
        headers['Set-Cookie'] = this.sessionCookie(this.settings.token)
      }

      response.writeHead(200, headers)
      response.end(asset.body)
      return
    }

    if (!path.startsWith('/api/')) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }

    // Pairing answers ahead of the gate: it is how a phone gets past it.
    if (path === '/api/session') {
      await this.handleSession(request, response)
      return
    }

    if (!this.authorize(request, url)) {
      response.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: 'Enter the access code shown in the desktop app.' }))
      return
    }

    if (path === '/api/events') {
      this.openEventStream(response)
      return
    }

    if (path === '/api/icon') {
      this.serveIcon(url.searchParams.get('package') ?? '', response)
      return
    }

    try {
      const result = await this.routeApi(path, request, url)
      response.writeHead(result.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      response.end(JSON.stringify(result.body))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed.'
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: message }))
    }
  }

  /** Trades a typed access code for the session cookie that keeps a phone paired. */
  private async handleSession(
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    const json = (status: number, body: unknown, cookie?: string): void => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(cookie ? { 'Set-Cookie': cookie } : {})
      })
      response.end(JSON.stringify(body))
    }

    if (request.method !== 'POST') {
      json(405, { error: 'Method not allowed.' })
      return
    }

    let code = ''

    try {
      const raw = await readBody(request)
      const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      code = String(payload.code ?? '').trim().toUpperCase()
    } catch {
      json(400, { error: 'Could not read that request.' })
      return
    }

    if (!code || !tokensMatch(this.settings.token, code)) {
      json(401, { error: 'That code was not accepted.' })
      return
    }

    json(200, { paired: true }, this.sessionCookie(this.settings.token))
  }

  private async routeApi(
    path: string,
    request: http.IncomingMessage,
    _url: URL
  ): Promise<JsonResult> {
    if (request.method === 'GET' && path === '/api/snapshot') {
      return { status: 200, body: this.buildSnapshot() }
    }

    if (request.method !== 'POST') {
      return { status: 405, body: { error: 'Method not allowed.' } }
    }

    const raw = await readBody(request)
    const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}

    switch (path) {
      case '/api/key':
        return this.withFeedback(() =>
          this.options.remoteController.sendCommand(String(payload.command) as RemoteCommand)
        )
      case '/api/text':
        return this.withFeedback(() =>
          this.options.remoteController.sendText(String(payload.text ?? ''))
        )
      case '/api/launch':
        return this.withFeedback(() =>
          this.options.appController.launchPackage(String(payload.packageName))
        )
      case '/api/quick-action':
        return this.withFeedback(() =>
          this.options.actionController.runQuickAction(String(payload.id))
        )
      case '/api/wake':
        return this.withFeedback(() => this.options.deviceManager.wakeAndReconnect())
      case '/api/apps/refresh': {
        await this.options.appController.listApps(true)
        this.broadcastSnapshot()
        return { status: 200, body: this.buildSnapshot() }
      }
      case '/api/favorite': {
        await this.options.appController.toggleFavorite(String(payload.packageName))
        this.broadcastSnapshot()
        return { status: 200, body: this.buildSnapshot() }
      }
      case '/api/connect': {
        const state = await this.options.deviceManager.connectDevice({ id: String(payload.id) })
        return { status: 200, body: { connectionState: state } }
      }
      case '/api/disconnect': {
        const state = await this.options.deviceManager.disconnectActiveDevice()
        return { status: 200, body: { connectionState: state } }
      }
      default:
        return { status: 404, body: { error: 'Unknown endpoint.' } }
    }
  }

  private async withFeedback(run: () => Promise<ActionFeedback>): Promise<JsonResult> {
    try {
      const feedback = await run()
      return { status: 200, body: { feedback } }
    } catch (error) {
      return {
        status: 409,
        body: { error: error instanceof Error ? error.message : 'Action failed.' }
      }
    }
  }

  private serveIcon(packageName: string, response: http.ServerResponse): void {
    const apps = this.options.deviceManager.getActiveDevice()?.cachedApps?.apps ?? []
    const match = apps.find((app) => app.packageName === packageName)
    const parsed = match?.iconDataUrl?.match(/^data:([^;]+);base64,(.+)$/)

    if (!parsed) {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, {
      'Content-Type': parsed[1],
      'Cache-Control': ICON_CACHE_HEADER
    })
    response.end(Buffer.from(parsed[2], 'base64'))
  }

  private openEventStream(response: http.ServerResponse): void {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    })
    response.write('retry: 3000\n\n')
    response.write(`data: ${JSON.stringify(this.buildSnapshot())}\n\n`)

    this.clients.add(response)
    this.emit('status', this.getStatus())

    response.on('close', () => {
      this.clients.delete(response)
      this.emit('status', this.getStatus())
    })
  }

  private broadcastSnapshot(): void {
    if (this.clients.size === 0) {
      return
    }

    const payload = `data: ${JSON.stringify(this.buildSnapshot())}\n\n`

    for (const client of this.clients) {
      client.write(payload)
    }
  }

  private buildSnapshot() {
    const { deviceManager } = this.options
    const activeDevice = deviceManager.getActiveDevice()
    const capabilities = deviceManager.getCapabilities()
    const connectionState = deviceManager.getConnectionState()
    const favorites = new Set(activeDevice?.favorites ?? [])

    // Icons are fetched lazily from /api/icon so the snapshot stays small.
    const apps = (activeDevice?.cachedApps?.apps ?? []).map((app) => ({
      packageName: app.packageName,
      displayName: app.displayName,
      category: app.category,
      hasIcon: Boolean(app.iconDataUrl),
      favorite: favorites.has(app.packageName)
    }))

    return {
      connectionState,
      activeBackend: deviceManager.getActiveBackend(),
      device: activeDevice
        ? { id: activeDevice.id, name: activeDevice.name, host: activeDevice.host }
        : null,
      devices: deviceManager.listDevices().map((device) => ({
        id: device.id,
        name: device.name,
        host: device.host
      })),
      capabilities,
      apps,
      // Whatever the desktop poll last saw. Never issues a fresh ADB call here.
      foregroundApp: this.options.appController.getCachedForegroundApp(),
      recentApps: (activeDevice?.recentApps ?? []).map((entry) => entry.packageName),
      updatedAt: new Date().toISOString()
    }
  }
}
