import type { ConnectionState, LaunchableApp, SavedDevice } from '@shared/types'

export interface ParsedAdbDevice {
  serial: string
  state: string
}

export function parseAdbVersion(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith('android debug bridge version')) ?? 'Unknown'
}

export function parseAdbDevices(output: string): ParsedAdbDevice[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.toLowerCase().startsWith('list of devices attached'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/)
      return serial && state ? { serial, state } : null
    })
    .filter((item): item is ParsedAdbDevice => item !== null)
}

function humanizePackage(packageName: string): string {
  return packageName
    .split('.')
    .at(-1)!
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

export function parseLaunchableApps(output: string, category: 'leanback' | 'launcher'): LaunchableApp[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('/') && !line.toLowerCase().includes('no activities found'))
    .map((line) => {
      const [packageName, activityPart] = line.split('/', 2)

      if (!packageName || !activityPart) {
        return null
      }

      const activity = activityPart.startsWith('.')
        ? `${packageName}/${packageName}${activityPart}`
        : `${packageName}/${activityPart}`

      return {
        packageName,
        activity,
        displayName: humanizePackage(packageName),
        category
      } satisfies LaunchableApp
    })
    .filter((item): item is LaunchableApp => item !== null)
}

export function escapeAdbText(text: string): string {
  return text
    .replace(/\r?\n/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()<>|;&*~"'`$!#?[\]{}])/g, '\\$1')
    .replace(/ /g, '%s')
}

export function chunkAdbText(text: string, chunkLength = 32): string[] {
  if (chunkLength <= 0) {
    throw new Error('chunkLength must be greater than zero')
  }

  const escaped = escapeAdbText(text)

  if (!escaped) {
    return []
  }

  const chunks: string[] = []

  for (let cursor = 0; cursor < escaped.length; ) {
    let nextCursor = Math.min(cursor + chunkLength, escaped.length)

    if (nextCursor < escaped.length && escaped[nextCursor - 1] === '\\') {
      nextCursor -= 1
    }

    if (nextCursor === cursor) {
      nextCursor = Math.min(cursor + chunkLength, escaped.length)
    }

    chunks.push(escaped.slice(cursor, nextCursor))
    cursor = nextCursor
  }

  return chunks
}

export function buildSerial(device: Pick<SavedDevice, 'host' | 'connectPort'>): string {
  return `${device.host}:${device.connectPort}`
}

export function deriveConnectionState(
  devices: ParsedAdbDevice[],
  serial: string | undefined,
  deviceId?: string
): ConnectionState {
  if (!serial) {
    return { status: 'disconnected', deviceId }
  }

  const match = devices.find((device) => device.serial === serial)

  if (!match) {
    return { status: 'disconnected', deviceId }
  }

  if (match.state === 'device') {
    return { status: 'connected', deviceId }
  }

  if (match.state === 'unauthorized') {
    return {
      status: 'unauthorized',
      deviceId,
      message: 'Authorize this computer in the TV wireless debugging prompt and try again.'
    }
  }

  return {
    status: 'error',
    deviceId,
    message: `ADB reported device state "${match.state}".`
  }
}

export function shouldAttemptReconnect(
  activeDevice: SavedDevice | null,
  state: ConnectionState,
  isReconnectInFlight: boolean
): boolean {
  if (!activeDevice || isReconnectInFlight) {
    return false
  }

  return state.status === 'disconnected' || state.status === 'error'
}
