import { useState } from 'react'
import type { ScrcpyPreset } from '@shared/types'
import { useRelay } from '../relayContext'
import { DirectionPad } from '../components/DirectionPad'
import { Icon } from '../components/Icon'
import { RemoteKey } from '../components/RemoteKey'
import { EmptyState } from '../components/EmptyState'
import { Sheet } from '../components/Sheet'
import {
  allRemoteButtons,
  appHue,
  appMonogram,
  feedbackTone,
  scrcpyPresetLabels,
  shortcutLegend
} from '../viewModel'

type SheetTab = 'keys' | 'type' | 'tools' | 'shortcuts'

const SHEET_TABS: Array<{ id: SheetTab; label: string }> = [
  { id: 'keys', label: 'Keys' },
  { id: 'type', label: 'Type' },
  { id: 'tools', label: 'Tools' },
  { id: 'shortcuts', label: 'Shortcuts' }
]

/**
 * Ambient builds the layout around what is on the TV rather than around the
 * key grid, so this is the first thing in the glass panel.
 */
function NowPlaying() {
  const relay = useRelay()
  const app = relay.foregroundApp
  const last = relay.latestRemoteAction

  return (
    <div className="now-playing">
      {app ? (
        <span
          className="now-playing-art"
          style={{ '--hue': appHue(app.packageName) } as React.CSSProperties}
          aria-hidden="true"
        >
          {appMonogram(app.displayName)}
        </span>
      ) : (
        <span className="now-playing-art is-idle" aria-hidden="true">
          <Icon name="screen" size={26} />
        </span>
      )}

      <span className="now-playing-copy">
        <span className="label">Now playing</span>
        <strong>{app?.displayName ?? 'Nothing detected'}</strong>
        <small>
          {relay.capabilities.apps
            ? app?.packageName ?? 'Polling the TV every few seconds'
            : 'Needs ADB app access'}
        </small>
      </span>

      {last ? (
        <span className={`pill tone-${feedbackTone(last.status)} now-playing-feedback`} aria-live="polite">
          {last.title}
        </span>
      ) : null}
    </div>
  )
}

/**
 * ADB only moves volume up and down — it never reports a level — so this stays
 * a rocker rather than a slider that would have to invent a number.
 */
function VolumeColumn() {
  const relay = useRelay()

  return (
    <div className="vol-column">
      <div className="vol-stack">
        <button
          type="button"
          onClick={() => void relay.sendRemoteCommand('volumeUp')}
          disabled={!relay.isConnected}
          aria-label="Volume up"
        >
          <Icon name="plus" size={19} />
        </button>
        <span>VOL</span>
        <button
          type="button"
          onClick={() => void relay.sendRemoteCommand('volumeDown')}
          disabled={!relay.isConnected}
          aria-label="Volume down"
        >
          <Icon name="minus" size={19} />
        </button>
      </div>
      <button
        className="vol-mute"
        type="button"
        onClick={() => void relay.sendRemoteCommand('mute')}
        disabled={!relay.isConnected}
        aria-label="Mute"
        title="Mute"
      >
        <Icon name="mute" size={18} />
      </button>
    </div>
  )
}

function KeysPanel() {
  const relay = useRelay()

  return (
    <>
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
        <div className="key-grid">
          {relay.visibleMediaRemoteButtons.map((button) => (
            <RemoteKey key={button.command} button={button} />
          ))}
        </div>
      </div>

      <div className="key-group">
        <span className="label">Sound</span>
        <div className="key-grid">
          {relay.visibleSoundRemoteButtons.map((button) => (
            <RemoteKey key={button.command} button={button} />
          ))}
        </div>
      </div>

      <div className="key-group">
        <span className="label">Pin or hide</span>
        <p className="muted fine-print">
          Pinned keys sit on the remote stage next to Back and Home. Hidden ones drop out of this
          sheet. The pad always stays.
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
        <div className="button-row">
          <button className="button ghost" type="button" onClick={() => void relay.resetRemoteLayout()}>
            Reset layout
          </button>
        </div>
      </div>
    </>
  )
}

function TypePanel() {
  const relay = useRelay()

  return (
    <>
      {!relay.capabilities.typing ? (
        <p className="notice tone-warning">
          Typing runs over ADB. Connect or pair ADB for this TV in Setup first.
        </p>
      ) : (
        <p className="muted fine-print">
          {relay.activeBackend === 'native'
            ? 'Native Remote is active, so text still goes out over the ADB fallback.'
            : 'Text goes to whatever field the TV has focused.'}
        </p>
      )}

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
    </>
  )
}

function ToolsPanel() {
  const relay = useRelay()

  return (
    <>
      <p className="muted fine-print">
        {relay.activeBackend === 'native'
          ? 'Both of these run over the ADB fallback, not Native Remote.'
          : 'Both of these run over ADB.'}
      </p>

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
    </>
  )
}

function ShortcutsPanel() {
  return (
    <>
      <p className="muted fine-print">Active while the Remote view has focus.</p>
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
        <div className="shortcut-row">
          <dt>
            <kbd>⌘K</kbd>
          </dt>
          <dd>Command palette</dd>
        </div>
      </dl>
    </>
  )
}

export function RemoteView() {
  const relay = useRelay()
  const [sheetTab, setSheetTab] = useState<SheetTab | null>(null)

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
    <div className="remote-stage">
      <section className="stage-glass">
        <NowPlaying />

        <div className="pad-column">
          <DirectionPad />
          <p className="pad-hint">Tap an edge, or flick anywhere on the pad</p>
        </div>

        <VolumeColumn />
      </section>

      <div className="quick-row">
        <button
          className="quick"
          type="button"
          onClick={() => void relay.sendRemoteCommand('back')}
        >
          <Icon name="back" size={16} />
          Back
        </button>
        <button
          className="quick"
          type="button"
          onClick={() => void relay.sendRemoteCommand('home')}
        >
          <Icon name="home" size={16} />
          Home
        </button>
        <button
          className="quick accent"
          type="button"
          onClick={() => void relay.sendRemoteCommand('playPause')}
        >
          <Icon name="play" size={17} />
          Play or pause
        </button>

        {relay.pinnedRemoteButtons.map((button) => (
          <RemoteKey key={`pinned-${button.command}`} button={button} variant="quick" />
        ))}

        <button className="quick" type="button" onClick={() => setSheetTab('type')}>
          <Icon name="keyboard" size={16} />
          Type
        </button>
        <button
          className="quick"
          type="button"
          onClick={() => void relay.launchScrcpy()}
          disabled={
            relay.busy === 'scrcpy' || !relay.capabilities.typing || !relay.scrcpyStatus.available
          }
          title={relay.scrcpyStatus.available ? 'Open the scrcpy mirror' : relay.scrcpyStatus.installHint}
        >
          <Icon name="screen" size={16} />
          Mirror
        </button>
        <button className="quick" type="button" onClick={() => setSheetTab('keys')}>
          <Icon name="more" size={16} />
          More
        </button>
      </div>

      <p className="stage-note">
        Every key, typing, sideloading and the shortcut list live under More · <kbd>⌘K</kbd> for
        anything
      </p>

      {sheetTab ? (
        <Sheet
          label="More controls"
          onClose={() => setSheetTab(null)}
          head={
            <div className="sheet-tabs" role="tablist">
              {SHEET_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`sheet-tab${sheetTab === tab.id ? ' is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={sheetTab === tab.id}
                  onClick={() => setSheetTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          }
        >
          {sheetTab === 'keys' ? <KeysPanel /> : null}
          {sheetTab === 'type' ? <TypePanel /> : null}
          {sheetTab === 'tools' ? <ToolsPanel /> : null}
          {sheetTab === 'shortcuts' ? <ShortcutsPanel /> : null}
        </Sheet>
      ) : null}
    </div>
  )
}
