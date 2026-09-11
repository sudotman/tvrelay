import { useRelay } from '../relayContext'
import type { RemoteButton } from '../viewModel'
import { Icon, remoteCommandIcons } from './Icon'

/**
 * `key` is the sheet treatment, `quick` is the pill that sits on the remote
 * stage. Both are the same control, so cooldown and pending state stay shared.
 */
export function RemoteKey({
  button,
  variant = 'key'
}: {
  button: RemoteButton
  variant?: 'key' | 'quick'
}) {
  const relay = useRelay()
  const remainingMs = relay.commandCooldownRemaining(button.command)
  const isCoolingDown = remainingMs > 0
  const isPending = relay.pendingRemoteCommand === button.command

  return (
    <button
      type="button"
      className={[
        variant,
        button.accent ? 'accent' : '',
        isPending ? 'is-pending' : '',
        isCoolingDown ? 'is-cooling' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => void relay.sendRemoteCommand(button.command)}
      disabled={!relay.isConnected || isPending || isCoolingDown}
      title={isCoolingDown ? `Cooling down for ${Math.ceil(remainingMs / 1000)}s` : button.label}
    >
      <Icon name={remoteCommandIcons[button.command]} size={variant === 'quick' ? 16 : 18} />
      <span>
        {isCoolingDown ? `${Math.ceil(remainingMs / 1000)}s` : button.label}
      </span>
    </button>
  )
}
