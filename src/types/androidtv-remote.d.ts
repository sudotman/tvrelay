declare module 'androidtv-remote' {
  import { EventEmitter } from 'node:events'

  export interface AndroidRemoteCertificate {
    key?: string
    cert?: string
  }

  export interface AndroidRemoteOptions {
    pairing_port?: number
    remote_port?: number
    name?: string
    cert?: AndroidRemoteCertificate
  }

  export class AndroidRemote extends EventEmitter {
    constructor(host: string, options: AndroidRemoteOptions)
    start(): Promise<boolean | undefined>
    sendCode(code: string): boolean
    sendKey(keyCode: number, direction: number): void
    sendAppLink(appLink: string): void
    sendPower(): void
    getCertificate(): { key: string; cert: string }
    stop(): void
    remoteManager?: {
      client?: {
        destroy(): void
      }
    }
    pairingManager?: {
      client?: {
        destroy(error?: Error): void
      }
    }
  }

  export const RemoteKeyCode: Record<string, number>
  export const RemoteDirection: {
    SHORT: number
    START_LONG: number
    END_LONG: number
  }
}
