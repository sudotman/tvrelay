import { useEffect } from 'react'
import type { FavoriteAppHotkey } from '@shared/types'
import { RelayContext, useRelay } from './relayContext'
import { useRelayState } from './useRelayState'
import { CommandPalette } from './components/CommandPalette'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { TopBar } from './components/TopBar'
import { AppsView } from './views/AppsView'
import { PhoneView } from './views/PhoneView'
import { RemoteView } from './views/RemoteView'
import { SetupView } from './views/SetupView'
import { favoriteHotkeys, keyBindings, shouldHandleRemoteKey } from './viewModel'

function Workspace() {
  const relay = useRelay()

  return (
    <main className="workspace">
      {relay.tab === 'remote' ? <RemoteView /> : null}
      {relay.tab === 'apps' ? <AppsView /> : null}
      {relay.tab === 'setup' ? <SetupView /> : null}
      {relay.tab === 'phone' ? <PhoneView /> : null}
    </main>
  )
}

function StatusBar() {
  const relay = useRelay()

  return (
    <footer className="statusbar">
      <span>{relay.statusMessage}</span>
    </footer>
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
        <Sidebar />
        <div className="shell-main">
          <TopBar />
          <Workspace />
          <StatusBar />
        </div>
        <CommandPalette />
        <Toasts />
      </div>
    </RelayContext.Provider>
  )
}
