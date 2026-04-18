import { buildSerial } from './adb/parsers'
import type { DeviceManager } from './deviceManager'
import type { ActionFeedback, RemoteCommand } from '@shared/types'
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

const COMMAND_LABELS: Record<RemoteCommand, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  select: 'OK',
  home: 'Home',
  back: 'Back',
  menu: 'Menu',
  appSwitch: 'Recent Apps',
  playPause: 'Play/Pause',
  rewind: 'Rewind',
  fastForward: 'Fast Forward',
  next: 'Next',
  previous: 'Previous',
  power: 'Power',
  sleep: 'Sleep',
  volumeUp: 'Volume Up',
  volumeDown: 'Volume Down',
  mute: 'Mute',
  enter: 'Enter',
  delete: 'Delete'
}

const COMMAND_COOLDOWNS_MS: Partial<Record<RemoteCommand, number>> = {
  power: 5000,
  sleep: 4000
}

export class RemoteController {
  private readonly cooldowns = new Map<RemoteCommand, number>()

  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly adbClient: AdbClient,
    private readonly nativeRemoteService: NativeRemoteService
  ) {}

  async sendCommand(command: RemoteCommand): Promise<ActionFeedback> {
    const activeDevice = this.deviceManager.getActiveDevice()
    if (!activeDevice) {
      throw new Error('Connect to a TV before using the remote.')
    }

    const blockedFeedback = this.getBlockedFeedback(command)

    if (blockedFeedback) {
      return blockedFeedback
    }

    if (this.deviceManager.getActiveBackend() === 'native') {
      this.nativeRemoteService.sendKey(KEYCODES[command])
    } else {
      const serial = buildSerial(activeDevice)
      await this.adbClient.sendKey(serial, KEYCODES[command])
    }

    const cooldownMs = COMMAND_COOLDOWNS_MS[command]

    if (cooldownMs) {
      this.cooldowns.set(command, Date.now() + cooldownMs)
    }

    return this.createFeedback({
      status: 'sent',
      kind: 'remote',
      title: `${COMMAND_LABELS[command]} signal sent`,
      detail: cooldownMs
        ? `The ${COMMAND_LABELS[command].toLowerCase()} key was sent. Waiting a few seconds before allowing another press.`
        : `The ${COMMAND_LABELS[command].toLowerCase()} key was sent to the connected TV.`,
      command,
      cooldownMs
    })
  }

  async sendText(text: string): Promise<ActionFeedback> {
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.sendText(serial, text))
    return this.createFeedback({
      status: 'success',
      kind: 'text',
      title: 'Text sent',
      detail: 'The text input request was delivered to the connected TV.'
    })
  }

  private getBlockedFeedback(command: RemoteCommand): ActionFeedback | null {
    const cooldownUntil = this.cooldowns.get(command)

    if (!cooldownUntil || cooldownUntil <= Date.now()) {
      return null
    }

    return this.createFeedback({
      status: 'blocked',
      kind: 'remote',
      title: `${COMMAND_LABELS[command]} cooling down`,
      detail: `Wait a moment before sending ${COMMAND_LABELS[command].toLowerCase()} again so we do not spam the TV.`,
      command,
      cooldownMs: cooldownUntil - Date.now()
    })
  }

  private createFeedback(input: Omit<ActionFeedback, 'id' | 'createdAt'>): ActionFeedback {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      ...input
    }
  }
}
