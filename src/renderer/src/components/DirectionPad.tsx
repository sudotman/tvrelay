import { useRelay } from '../relayContext'
import { Icon } from './Icon'

const DIRECTIONS = [
  { command: 'up', icon: 'up' },
  { command: 'right', icon: 'right' },
  { command: 'down', icon: 'down' },
  { command: 'left', icon: 'left' }
] as const

export function DirectionPad() {
  const relay = useRelay()

  return (
    <div className="dpad" role="group" aria-label="Directional pad">
      {DIRECTIONS.map((direction) => (
        <button
          key={direction.command}
          className={`dpad-dir ${direction.command}`}
          type="button"
          onClick={() => void relay.sendRemoteCommand(direction.command)}
          disabled={!relay.isConnected}
          aria-label={direction.command}
        >
          <Icon name={direction.icon} size={20} />
        </button>
      ))}
      <button
        className="dpad-ok"
        type="button"
        onClick={() => void relay.sendRemoteCommand('select')}
        disabled={!relay.isConnected}
      >
        OK
      </button>
    </div>
  )
}
