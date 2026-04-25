import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { AdbLocator } from './services/adb/adbLocator'
import { AdbClient } from './services/adb/adbClient'
import { ElectronDeviceStore } from './services/deviceStore'
import { DeviceManager } from './services/deviceManager'
import { RemoteController } from './services/remoteController'
import { AppController } from './services/appController'
import { ActionController } from './services/actionController'
import { NativeRemoteService } from './services/native/nativeRemoteService'
import { ScrcpyController } from './services/scrcpyController'
import { SideloadController } from './services/sideloadController'

let mainWindow: BrowserWindow | null = null
let deviceManager: DeviceManager | null = null
let bootstrapPromise: Promise<void> | null = null

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, '../preload/index.cjs'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/index.js')
  ]

  const preloadPath = candidates.find((candidate) => fs.existsSync(candidate))

  if (!preloadPath) {
    throw new Error(`Unable to find preload bundle. Checked: ${candidates.join(', ')}`)
  }

  return preloadPath
}

async function createMainWindow(): Promise<void> {
  const preload = resolvePreloadPath()

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#f4ede1',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load', {
      errorCode,
      errorDescription,
      validatedURL
    })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process exited unexpectedly', details)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function bootstrap(): Promise<void> {
  const adbLocator = new AdbLocator()
  const adbInfo = await adbLocator.locate()
  const adbClient = new AdbClient(adbInfo.path ?? 'adb')
  const store = new ElectronDeviceStore()
  const nativeRemoteService = new NativeRemoteService()
  deviceManager = new DeviceManager(store, adbClient, nativeRemoteService)

  const remoteController = new RemoteController(deviceManager, adbClient, nativeRemoteService)
  const appController = new AppController(deviceManager, adbClient)
  const actionController = new ActionController(deviceManager, remoteController, appController)
  const scrcpyController = new ScrcpyController(deviceManager)
  const sideloadController = new SideloadController(deviceManager, adbClient)

  registerIpc({
    deviceManager,
    remoteController,
    appController,
    actionController,
    scrcpyController,
    sideloadController,
    adbLocator,
    adbClient,
    getMainWindow: () => mainWindow
  })

  await deviceManager.init().catch((error) => {
    console.error('Device manager init failed, continuing with empty runtime state.', error)
  })

  await createMainWindow()
}

function ensureBootstrapped(): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = bootstrap().catch((error) => {
    console.error('Application bootstrap failed.', error)
    bootstrapPromise = null
    throw error
  })

  return bootstrapPromise
}

app.whenReady().then(() => {
  void ensureBootstrapped()
})

app.on('activate', () => {
  void ensureBootstrapped().then(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  }).catch((error) => {
    console.error('Could not restore application window.', error)
  })
})

app.on('window-all-closed', () => {
  deviceManager?.dispose()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
