import { useRelay } from '../relayContext'
import { viewTabs } from '../viewModel'
import { Icon, type IconName } from './Icon'

const TAB_ICONS: Record<string, IconName> = {
  remote: 'remote',
  apps: 'apps',
  setup: 'setup',
  phone: 'phone'
}

export function Sidebar() {
  const relay = useRelay()

  return (
    <aside className="rail">
      <button
        className="rail-brand"
        type="button"
        onClick={() => relay.setTab('remote')}
        title="Relay"
      >
        <span className="rail-brand-mark" aria-hidden="true">
          <span />
        </span>
      </button>

      <nav className="rail-nav" aria-label="Views">
        {viewTabs.map((item) => {
          const locked = (item.id === 'remote' || item.id === 'apps') && !relay.isConnected

          return (
            <button
              key={item.id}
              className={`rail-item${relay.tab === item.id ? ' is-active' : ''}${locked ? ' is-locked' : ''}`}
              type="button"
              onClick={() => relay.setTab(item.id)}
              title={locked ? `${item.label} unlocks once a TV is connected.` : item.detail}
              aria-current={relay.tab === item.id ? 'page' : undefined}
            >
              <Icon name={TAB_ICONS[item.id]} size={21} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="rail-footer">
        {relay.webRemote?.running ? (
          <span className="rail-badge" title={`Phone remote is live on port ${relay.webRemote.port}`}>
            <Icon name="phone" size={15} />
            {relay.webRemote.connectedClients}
          </span>
        ) : null}
        <button
          className="rail-ghost"
          type="button"
          onClick={() => relay.setThemeMode(relay.themeMode === 'light' ? 'dark' : 'light')}
          title={`Switch to ${relay.themeMode === 'light' ? 'dark' : 'light'} theme`}
        >
          <Icon name={relay.themeMode === 'light' ? 'moon' : 'sun'} size={18} />
        </button>
      </div>
    </aside>
  )
}
