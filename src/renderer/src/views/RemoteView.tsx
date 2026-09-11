import { useState } from 'react'
import type { ScrcpyPreset } from '@shared/types'
import { useRelay } from '../relayContext'
import { DirectionPad } from '../components/DirectionPad'
import { Icon } from '../components/Icon'
import { RemoteKey } from '../components/RemoteKey'
import { EmptyState } from '../components/EmptyState'
import {
  allRemoteButtons,
  backendLabel,
  feedbackTone,
  scrcpyPresetLabels,
  shortcutLegend
} from '../viewModel'

function NowPlaying() {
  const relay = useRelay()
  const last = relay.latestRemoteAction

  return (
    <div className="now-playing">
      <div className="now-playing-main">
        <span className="label">On screen</span>
        <strong>{relay.foregroundApp?.displayName ?? 'Unavailable'}</strong>
        <small>
          {relay.capabilities.apps
            ? relay.foregroundApp?.packageName ?? 'Polling the TV every few seconds'
            : 'Needs ADB app access'}
        </small>
      </div>
      {last ? (
        <span className={`pill tone-${feedbackTone(last.status)}`} aria-live="polite">
          {last.title}
        </span>
      ) : null}
    </div>
  )
}

function TypingCard() {
  const relay = useRelay()

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Icon name="keyboard" size={17} />
          Type on the TV
        </h3>
        <span className="muted">
          {relay.activeBackend === 'native'
            ? relay.capabilities.typing
              ? 'Uses ADB fallback'
              : 'Needs ADB'
            : 'Ready'}
        </span>
      </header>

      {!relay.capabilities.typing ? (
        <p className="notice">
          Typing runs over ADB. Connect or pair ADB for this TV in Setup first.
        </p>
      ) : null}

      <textarea
        value={relay.textInput}
        onChange={(event) => relay.setTextInput(event.target.value)}
        placeholder="Search terms, passwords, anything…"
        rows={3}
      />

      <div className="button-row">
        <button
          className="button primary"
          type="button"
          onClick={() => void relay.sendText()}
          disabled={relay.busy === 'text' || !relay.textInput || !relay.capabilities.typing}
        >
          Send text
        </button>
        <button className="button ghost" type="button" onClick={() => void relay.pasteFromClipboard()}>
          <Icon name="copy" size={15} />
          Paste
        </button>
        <button className="button ghost" type="button" onClick={() => relay.setTextInput('')}>
          Clear
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.sendRemoteCommand('enter')}
        >
          Enter
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => void relay.sendRemoteCommand('delete')}
        >
          Delete
        </button>
      </div>
    </section>
  )
}

function PowerToolsCard() {
  const relay = useRelay()

  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Icon name="screen" size={17} />
          Power tools
        </h3>
        <span className="muted">
          {relay.activeBackend === 'native' ? 'Run over ADB fallback' : 'Run over ADB'}
        </span>
      </header>

      <div className="tool-row">
        <div className="tool-copy">
          <strong>Screen mirror</strong>
          <small>
            {relay.scrcpyStatus.available
              ? relay.scrcpyStatus.version ?? 'scrcpy detected'
              : relay.scrcpyStatus.installHint}
          </small>
        </div>
        <div className="tool-actions">
          <select
            value={relay.activePreferences?.scrcpyPreset ?? 'fast'}
            onChange={(event) => void relay.setScrcpyPreset(event.target.value as ScrcpyPreset)}
            disabled={!relay.capabilities.typing}
            aria-label="scrcpy preset"
          >
            {Object.entries(scrcpyPresetLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="button ghost"
            type="button"
            onClick={() => void relay.launchScrcpy()}
            disabled={
              relay.busy === 'scrcpy' || !relay.capabilities.typing || !relay.scrcpyStatus.available
            }
          >
            Open
          </button>
        </div>
      </div>

      <div className="tool-row">
        <div className="tool-copy">
          <strong>Install an APK</strong>
          <small>
            {relay.selectedApk
              ? `${relay.selectedApk.name} ready`
              : relay.capabilities.typing
                ? 'Choose an APK, then install it over ADB'
                : 'ADB is required for sideloading'}
          </small>
        </div>
        <div className="tool-actions">
          <button
            className="button ghost"
            type="button"
            onClick={() => void relay.chooseApkFile()}
            disabled={relay.busy === 'choose-apk' || !relay.capabilities.typing}
          >
            Choose
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={() => void relay.installSelectedApk()}
            disabled={relay.busy === 'install-apk' || !relay.selectedApk || !relay.capabilities.typing}
          >
            Install
          </button>
        </div>
      </div>
    </section>
  )
}

function CustomizeCard() {
  const relay = useRelay()
  const [open, setOpen] = useState(false)

  return (
    <section className={`card collapsible${open ? ' is-open' : ''}`}>
      <button className="card-head as-button" type="button" onClick={() => setOpen((value) => !value)}>
        <h3>
          <Icon name="setup" size={17} />
          Customize the pad
        </h3>
        <Icon name="chevron" size={16} className="icon chevron" />
      </button>

      {open ? (
        <>
          <p className="muted">
            Pin the keys you use daily or hide the ones you never touch. The D-pad always stays.
          </p>
          <div className="customize-grid">
            {allRemoteButtons.map((button) => {
              const isPinned =
                relay.activePreferences?.remoteLayout.pinnedCommands.includes(button.command) ?? false
              const isHidden =
                relay.activePreferences?.remoteLayout.hiddenCommands.includes(button.command) ?? false

              return (
                <div key={button.command} className="customize-row">
                  <strong>{button.label}</strong>
                  <div className="chip-row">
                    <button
                      className={`chip${isPinned ? ' is-on' : ''}`}
                      type="button"
                      onClick={() => void relay.togglePinnedCommand(button.command)}
                    >
                      {isPinned ? 'Pinned' : 'Pin'}
                    </button>
                    <button
                      className={`chip${isHidden ? ' is-on' : ''}`}
                      type="button"
                      onClick={() => void relay.toggleHiddenCommand(button.command)}
                    >
                      {isHidden ? 'Hidden' : 'Hide'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <button className="button ghost" type="button" onClick={() => void relay.resetRemoteLayout()}>
            Reset layout
          </button>
        </>
      ) : null}
    </section>
  )
}

function ShortcutsCard() {
  return (
    <section className="card">
      <header className="card-head">
        <h3>
          <Icon name="command" size={17} />
          Keyboard
        </h3>
        <span className="muted">Active on this view</span>
      </header>
      <dl className="shortcut-list">
        {shortcutLegend.map((shortcut) => (
          <div key={shortcut.keys} className="shortcut-row">
            <dt>
              {shortcut.keys.split(' / ').map((part) => (
                <kbd key={part}>{part}</kbd>
              ))}
            </dt>
            <dd>{shortcut.action}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function RemoteView() {
  const relay = useRelay()

  if (!relay.isConnected) {
    return (
      <EmptyState
        icon="remote"
        title="No TV is connected yet"
        detail="Connect with ADB in Setup first. That path stays the most reliable one here."
        actionLabel="Open setup"
        onAction={() => relay.setTab('setup')}
      />
    )
  }

  return (
    <div className="remote-layout">
      <section className="handset">
        <div className="handset-top">
          <div>
            <span className="label">Live control</span>
            <strong>{relay.activeDevice?.name ?? 'Connected TV'}</strong>
          </div>
          <span className="pill tone-positive">{backendLabel(relay.activeBackend)}</span>
        </div>

        <NowPlaying />

        {relay.pinnedRemoteButtons.length > 0 ? (
          <div className="key-group">
            <span className="label">Pinned</span>
            <div className="key-grid compact">
              {relay.pinnedRemoteButtons.map((button) => (
                <RemoteKey key={`pinned-${button.command}`} button={button} compact />
              ))}
            </div>
          </div>
        ) : null}

        <div className="pad-stage">
          <DirectionPad />
          <div className="rocker">
            <button
              type="button"
              onClick={() => void relay.sendRemoteCommand('volumeUp')}
              aria-label="Volume up"
            >
              <Icon name="up" size={18} />
            </button>
            <span>VOL</span>
            <button
              type="button"
              onClick={() => void relay.sendRemoteCommand('volumeDown')}
              aria-label="Volume down"
            >
              <Icon name="down" size={18} />
            </button>
          </div>
        </div>

        <div className="key-group">
          <span className="label">Navigation</span>
          <div className="key-grid">
            {relay.visibleCoreRemoteButtons.map((button) => (
              <RemoteKey key={button.command} button={button} />
            ))}
          </div>
        </div>

        <div className="key-group">
          <span className="label">Playback</span>
          <div className="key-grid compact">
            {relay.visibleMediaRemoteButtons.map((button) => (
              <RemoteKey key={button.command} button={button} compact />
            ))}
          </div>
        </div>

        <div className="key-group">
          <span className="label">Sound</span>
          <div className="key-grid compact">
            {relay.visibleSoundRemoteButtons.map((button) => (
              <RemoteKey key={button.command} button={button} compact />
            ))}
          </div>
        </div>
      </section>

      <div className="remote-side">
        <TypingCard />
        <PowerToolsCard />
        <ShortcutsCard />
        <CustomizeCard />
      </div>
    </div>
  )
}
