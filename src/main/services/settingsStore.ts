import Store from 'electron-store'

export interface WebRemoteSettings {
  enabled: boolean
  port: number
  token: string
}

interface SettingsSnapshot {
  webRemote: WebRemoteSettings
}

export const DEFAULT_WEB_REMOTE_PORT = 8479

export function createWebRemoteToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let token = ''

  for (let index = 0; index < 12; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)]
  }

  return token
}

export interface SettingsStore {
  getWebRemote(): WebRemoteSettings
  setWebRemote(settings: WebRemoteSettings): void
}

export class ElectronSettingsStore implements SettingsStore {
  private readonly store = new Store<SettingsSnapshot>({
    name: 'settings',
    defaults: {
      webRemote: {
        enabled: false,
        port: DEFAULT_WEB_REMOTE_PORT,
        token: createWebRemoteToken()
      }
    }
  })

  getWebRemote(): WebRemoteSettings {
    const stored = this.store.get('webRemote')

    return {
      enabled: Boolean(stored?.enabled),
      port: Number(stored?.port) || DEFAULT_WEB_REMOTE_PORT,
      token: stored?.token || createWebRemoteToken()
    }
  }

  setWebRemote(settings: WebRemoteSettings): void {
    this.store.set('webRemote', settings)
  }
}
