import { useRelay } from '../relayContext'
import { Icon } from './Icon'

/**
 * Only rendered once there is something to say — a fresh 'idle'/'checking'/'not-available'
 * status stays invisible so the banner never nags after every silent startup check.
 */
export function UpdateBanner() {
  const relay = useRelay()
  const status = relay.appUpdate

  if (!status || status.state === 'idle' || status.state === 'checking' || status.state === 'not-available') {
    return null
  }

  if (status.state === 'error') {
    return null
  }

  const version = status.latestVersion ? `v${status.latestVersion}` : 'A new version'

  return (
    <div className="update-banner" role="status">
      <Icon name={status.state === 'downloaded' ? 'up' : 'refresh'} size={16} />

      <div className="update-banner-copy">
        {status.state === 'available' ? (
          <>
            <strong>{version} of Relay is available</strong>
            <span>You're on {status.currentVersion}. Download the update from GitHub.</span>
          </>
        ) : status.state === 'downloading' ? (
          <>
            <strong>Downloading {version}…</strong>
            <span>{status.progressPercent ?? 0}% complete</span>
          </>
        ) : (
          <>
            <strong>{version} is ready to install</strong>
            <span>Restart Relay to finish updating.</span>
          </>
        )}
      </div>

      {status.state === 'available' ? (
        <button className="button primary" type="button" onClick={() => void relay.openAppUpdateReleasePage()}>
          Download
        </button>
      ) : null}

      {status.state === 'downloaded' ? (
        <button className="button primary" type="button" onClick={() => void relay.quitAndInstallAppUpdate()}>
          Restart Now
        </button>
      ) : null}
    </div>
  )
}
