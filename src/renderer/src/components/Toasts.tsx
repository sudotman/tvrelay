import { useRelay } from '../relayContext'
import { feedbackTone } from '../viewModel'
import { Icon, type IconName } from './Icon'

const TONE_ICONS: Record<string, IconName> = {
  positive: 'check',
  warning: 'alert',
  danger: 'alert',
  neutral: 'check'
}

export function Toasts() {
  const relay = useRelay()

  return (
    <div className="toast-stack" aria-live="polite">
      {relay.actionToasts.map((toast) => {
        const tone = feedbackTone(toast.status)

        return (
          <div key={toast.id} className={`toast tone-${tone}`}>
            <Icon name={TONE_ICONS[tone]} size={16} />
            <div>
              <strong>{toast.title}</strong>
              <span>{toast.detail}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
