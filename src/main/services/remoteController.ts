import { buildSerial } from './adb/parsers'
import type { DeviceManager } from './deviceManager'
import type { RemoteCommand } from '@shared/types'
import type { AdbClient } from './adb/adbClient'
import type { NativeRemoteService } from './native/nativeRemoteService'

const KEYCODES: Record<RemoteCommand, number> = {
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  select: 23,
  home: 3,
  back: 4,
  menu: 82,
  appSwitch: 187,
  playPause: 85,
  rewind: 89,
  fastForward: 90,
  next: 87,
  previous: 88,
  power: 26,
  sleep: 223,
  volumeUp: 24,
  volumeDown: 25,
  mute: 164,
  enter: 66,
  delete: 67
}

export class RemoteController {
  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly adbClient: AdbClient,
    private readonly nativeRemoteService: NativeRemoteService
  ) {}

  async sendCommand(command: RemoteCommand): Promise<void> {
    const activeDevice = this.deviceManager.getActiveDevice()
    if (!activeDevice) {
      throw new Error('Connect to a TV before using the remote.')
    }

    if (this.deviceManager.getActiveBackend() === 'native') {
      this.nativeRemoteService.sendKey(KEYCODES[command])
      return
    }

    const serial = buildSerial(activeDevice)
    await this.adbClient.sendKey(serial, KEYCODES[command])
  }

  async sendText(text: string): Promise<void> {
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.sendText(serial, text))
  }
}
