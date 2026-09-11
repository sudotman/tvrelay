import { useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useRelay } from '../relayContext'
import { Icon } from './Icon'

const DIRECTIONS = [
  { command: 'up', icon: 'up', label: 'Up' },
  { command: 'right', icon: 'right', label: 'Right' },
  { command: 'down', icon: 'down', label: 'Down' },
  { command: 'left', icon: 'left', label: 'Left' }
] as const

/** Below this the gesture is a tap, and the direction buttons own it. */
const SWIPE_DISTANCE = 38
const SWIPE_TIMEOUT_MS = 700

/**
 * The pad takes taps on its four edges and flicks anywhere on its face, so it
 * works the same under a mouse, a trackpad, and a finger.
 */
export function DirectionPad() {
  const relay = useRelay()
  const origin = useRef<{ x: number; y: number; at: number } | null>(null)
  const swiped = useRef(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!relay.isConnected) {
      return
    }

    origin.current = { x: event.clientX, y: event.clientY, at: Date.now() }
    swiped.current = false
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = origin.current
    origin.current = null

    if (!start || !relay.isConnected) {
      return
    }

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y

    if (Math.hypot(deltaX, deltaY) < SWIPE_DISTANCE || Date.now() - start.at > SWIPE_TIMEOUT_MS) {
      return
    }

    swiped.current = true

    const command =
      Math.abs(deltaX) > Math.abs(deltaY)
        ? deltaX > 0
          ? 'right'
          : 'left'
        : deltaY > 0
          ? 'down'
          : 'up'

    void relay.sendRemoteCommand(command)
  }

  // A flick that happens to end on a button must not also fire that button.
  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swiped.current) {
      return
    }

    swiped.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      className={`softpad${relay.isConnected ? '' : ' is-disabled'}`}
      role="group"
      aria-label="Directional pad"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        origin.current = null
      }}
      onPointerLeave={() => {
        origin.current = null
      }}
      onClickCapture={onClickCapture}
    >
      {DIRECTIONS.map((direction) => (
        <button
          key={direction.command}
          className={`softpad-dir ${direction.command}`}
          type="button"
          onClick={() => void relay.sendRemoteCommand(direction.command)}
          disabled={!relay.isConnected}
          aria-label={direction.label}
        >
          <Icon name={direction.icon} size={20} />
        </button>
      ))}
      <button
        className="softpad-ok"
        type="button"
        onClick={() => void relay.sendRemoteCommand('select')}
        disabled={!relay.isConnected}
      >
        OK
      </button>
    </div>
  )
}
