import { useRelay } from '../relayContext'
import type { RemoteButton } from '../viewModel'
import { Icon, remoteCommandIcons } from './Icon'

export function RemoteKey({ button, compact }: { button: RemoteButton; compact?: boolean }) {
  const relay = useRelay()
  const remainingMs = relay.commandCooldownRemaining(button.command)
  const isCoolingDown = remainingMs > 0
  const isPending = relay.pendingRemoteCommand === button.command

  return (
    <button
      type="button"
      className={[
        'key',
        compact ? 'compact' : '',
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
      <Icon name={remoteCommandIcons[button.command]} size={compact ? 18 : 20} />
      <span>
        {isCoolingDown
          ? `${Math.ceil(remainingMs / 1000)}s`
          : compact
            ? button.short ?? button.label
            : button.label}
      </span>
    </button>
  )
}
