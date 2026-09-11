import type { FavoriteAppHotkey, LaunchableApp } from '@shared/types'
import { useRelay } from '../relayContext'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { appHue, appMonogram, canAssignFavoriteHotkey, favoriteHotkeys, formatTimestamp } from '../viewModel'

function AppTile({ app }: { app: LaunchableApp }) {
  const relay = useRelay()
  const isFavorite = relay.activeDevice?.favorites?.includes(app.packageName) ?? false
  const isLaunching = relay.pendingAppPackage === app.packageName
  const assignedHotkey =
    favoriteHotkeys.find((hotkey) => relay.activePreferences?.appHotkeys?.[hotkey] === app.packageName) ?? ''

  return (
    <article className={`app-tile${isLaunching ? ' is-busy' : ''}`}>
      <button
        className="app-tile-launch"
        type="button"
        onClick={() => void relay.launchApp(app)}
        disabled={isLaunching}
        title={app.packageName}
      >
        {app.iconDataUrl ? (
          <img className="app-icon" src={app.iconDataUrl} alt="" />
        ) : (
          <span className="app-icon monogram" style={{ '--hue': appHue(app.packageName) } as React.CSSProperties}>
            {appMonogram(app.displayName)}
          </span>
        )}
        <span className="app-tile-name">{app.displayName}</span>
        <span className="app-tile-kind">{app.category === 'leanback' ? 'TV app' : 'Launcher app'}</span>
      </button>

      <div className="app-tile-actions">
        <button
          className={`icon-chip${isFavorite ? ' is-on' : ''}`}
          type="button"
          onClick={() => void relay.toggleFavorite(app.packageName)}
          disabled={relay.busy === `favorite-${app.packageName}`}
          title={isFavorite ? 'Unpin this app' : 'Pin this app'}
          aria-label={isFavorite ? 'Unpin this app' : 'Pin this app'}
        >
          <Icon name="star" size={14} />
        </button>
        <select
          className="hotkey-select"
          value={assignedHotkey}
          onChange={(event) =>
            void relay.assignFavoriteHotkey(app.packageName, event.target.value as FavoriteAppHotkey | '')
          }
          disabled={!canAssignFavoriteHotkey(relay.activeDevice, app.packageName)}
          title={isFavorite ? 'Assign a number hotkey' : 'Pin this app before assigning a hotkey'}
          aria-label="Hotkey"
        >
          <option value="">—</option>
          {favoriteHotkeys.map((hotkey) => (
            <option key={hotkey} value={hotkey}>
              {hotkey}
            </option>
          ))}
        </select>
      </div>
    </article>
  )
}

function AppSection({ title, apps }: { title: string; apps: LaunchableApp[] }) {
  if (apps.length === 0) {
    return null
  }

  return (
    <section className="app-section">
      <header className="app-section-head">
        <h3>{title}</h3>
        <span className="count">{apps.length}</span>
      </header>
      <div className="app-grid">
        {apps.map((app) => (
          <AppTile key={app.packageName} app={app} />
        ))}
      </div>
    </section>
  )
}

export function AppsView() {
  const relay = useRelay()

  if (!relay.isConnected) {
    return (
      <EmptyState
        icon="apps"
        title="No TV is connected yet"
        detail="Connect with ADB in Setup before browsing installed apps."
        actionLabel="Open setup"
        onAction={() => relay.setTab('setup')}
      />
    )
  }

  if (!relay.capabilities.apps) {
    return (
      <EmptyState
        icon="apps"
        title="Installed-app browsing needs ADB"
        detail="Native remote cannot list or launch apps reliably. Connect ADB for this TV in Setup."
        actionLabel="Open setup"
        onAction={() => relay.setTab('setup')}
      />
    )
  }

  return (
    <div className="apps-layout">
      <div className="apps-toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            value={relay.appsQuery}
            onChange={(event) => relay.setAppsQuery(event.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
          />
        </div>
        <span className="muted">
          {relay.appsAreLoading
            ? relay.activeAppsCache
              ? 'Updating…'
              : 'Building the list — names and icons take a moment'
            : relay.activeAppsCache
              ? `${relay.visibleAppCount} shown · updated ${formatTimestamp(relay.activeAppsCache.updatedAt)}`
              : 'No app cache yet'}
        </span>
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.loadApps(true)}
          disabled={relay.appsAreLoading}
        >
          <Icon name="refresh" size={15} />
          {relay.activeAppsCache ? 'Refresh' : 'Fetch apps'}
        </button>
      </div>

      {relay.visibleAppCount === 0 ? (
        <EmptyState
          icon="apps"
          title={relay.activeAppsCache ? 'No apps match that search' : 'No apps cached yet'}
          detail={
            relay.activeAppsCache
              ? 'Try a broader search, or refresh the installed-app list.'
              : 'Fetch installed apps once to build the list for this TV.'
          }
          actionLabel={relay.activeAppsCache ? undefined : 'Fetch apps'}
          onAction={relay.activeAppsCache ? undefined : () => void relay.loadApps(true)}
        />
      ) : (
        <>
          <AppSection title="Pinned" apps={relay.appSections.favorites} />
          <AppSection title="Recent" apps={relay.appSections.recents} />
          <AppSection title="All apps" apps={relay.appSections.others} />
        </>
      )}
    </div>
  )
}
