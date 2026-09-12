import { useEffect } from 'react'
import type { FavoriteAppHotkey } from '@shared/types'
import { RelayContext, useRelay } from './relayContext'
import { useRelayState } from './useRelayState'
import { CommandPalette } from './components/CommandPalette'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { AppsView } from './views/AppsView'
import { PhoneView } from './views/PhoneView'
import { RemoteView } from './views/RemoteView'
import { SetupView } from './views/SetupView'
import { favoriteHotkeys, keyBindings, shouldHandleRemoteKey } from './viewModel'

function Workspace() {
  const relay = useRelay()

  // Keyed on the tab so the entrance replays on every switch.
  return (
    <main className="workspace">
      <div className="view" key={relay.tab}>
        {relay.tab === 'remote' ? <RemoteView /> : null}
        {relay.tab === 'apps' ? <AppsView /> : null}
        {relay.tab === 'setup' ? <SetupView /> : null}
        {relay.tab === 'phone' ? <PhoneView /> : null}
      </div>
    </main>
  )
}

/** Ambient has no status bar. One quiet line keeps the last outcome on screen. */
function StatusLine() {
  const relay = useRelay()

  // Keyed on the message so a new outcome fades in instead of swapping.
  return (
    <p className="statusline">
      <span key={relay.statusMessage}>{relay.statusMessage}</span>
    </p>
  )
}

export function App() {
  const relay = useRelayState()

  // Remote keys only fire on the remote view, and never while typing in a field.
  useEffect(() => {
    if (relay.tab !== 'remote') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleRemoteKey(event.target)) {
        return
      }

      const command = keyBindings[event.key]

      if (!command || relay.connectionState.status !== 'connected') {
        return
      }

      event.preventDefault()
      void relay.sendRemoteCommand(command)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [relay.connectionState.status, relay.tab])

  // The command palette and the number-key app shortcuts stay global.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        relay.setPaletteOpen(true)
        relay.setPaletteQuery('')
        return
      }

      if (
        relay.paletteOpen ||
        !shouldHandleRemoteKey(event.target) ||
        relay.connectionState.status !== 'connected'
      ) {
        return
      }

      if (!favoriteHotkeys.includes(event.key as FavoriteAppHotkey)) {
        return
      }

      const packageName = relay.activePreferences?.appHotkeys?.[event.key as FavoriteAppHotkey]

      if (!packageName) {
        return
      }

      event.preventDefault()
      void relay.launchPackageShortcut(packageName)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [relay.activePreferences, relay.connectionState.status, relay.paletteOpen])

  return (
    <RelayContext.Provider value={relay}>
      <div className="shell">
        <div className="shell-wash" aria-hidden="true" />
        <TopBar />
        <Workspace />
        <StatusLine />
        <CommandPalette />
        <Toasts />
      </div>
    </RelayContext.Provider>
  )
}
