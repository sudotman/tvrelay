import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import type { ActionFeedback, SelectedApkFile } from '@shared/types'
import type { AdbClient } from './adb/adbClient'
import type { DeviceManager } from './deviceManager'

function createFeedback(input: Omit<ActionFeedback, 'id' | 'createdAt'>): ActionFeedback {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...input
  }
}

export class SideloadController {
  private readonly selections = new Map<string, string>()

  constructor(
    private readonly deviceManager: DeviceManager,
    private readonly adbClient: AdbClient
  ) {}

  async chooseApk(parentWindow: BrowserWindow | null): Promise<SelectedApkFile | null> {
    const options: OpenDialogOptions = {
      title: 'Choose APK to install',
      properties: ['openFile'],
      filters: [{ name: 'Android APK', extensions: ['apk'] }]
    }
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const apkPath = result.filePaths[0]
    this.assertApkPath(apkPath)

    const stat = await fs.stat(apkPath)
    if (!stat.isFile()) {
      throw new Error('Choose a valid APK file.')
    }

    const id = randomUUID()
    this.selections.set(id, apkPath)

    return {
      id,
      name: path.basename(apkPath),
      size: stat.size
    }
  }

  async installApk(selectionId: string): Promise<ActionFeedback> {
    const apkPath = this.selections.get(selectionId)

    if (!apkPath) {
      throw new Error('Choose an APK before installing.')
    }

    this.assertApkPath(apkPath)

    await this.deviceManager.withAdbAccess((serial) => this.adbClient.installApk(serial, apkPath))
    this.selections.delete(selectionId)

    return createFeedback({
      status: 'success',
      kind: 'sideload',
      title: 'APK installed',
      detail: `${path.basename(apkPath)} was installed on the selected TV through ADB.`
    })
  }

  private assertApkPath(apkPath: string): void {
    if (path.extname(apkPath).toLowerCase() !== '.apk') {
      throw new Error('Only .apk files can be installed.')
    }
  }
}
