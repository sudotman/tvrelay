import { Icon, type IconName } from './Icon'

export function EmptyState(props: {
  icon: IconName
  title: string
  detail: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <section className="empty-state">
      <span className="empty-mark" aria-hidden="true">
        <Icon name={props.icon} size={26} />
      </span>
      <h3>{props.title}</h3>
      <p>{props.detail}</p>
      {props.actionLabel && props.onAction ? (
        <button className="button primary" type="button" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </section>
  )
}
