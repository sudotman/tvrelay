import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface AdbBinaryInfo {
  available: boolean
  path?: string
  installHint: string
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate)
    return true
  } catch {
    return false
  }
}

function installHintForPlatform(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Install Android Platform Tools with Homebrew (`brew install android-platform-tools`) or Android Studio.'
    case 'win32':
      return 'Install Android Platform Tools from Google or through Android Studio, then reopen the app.'
    default:
      return 'Install Android Platform Tools and make sure `adb` is available on PATH.'
  }
}

export class AdbLocator {
  async locate(): Promise<AdbBinaryInfo> {
    const executableName = process.platform === 'win32' ? 'adb.exe' : 'adb'
    const candidates = new Set<string>()

    if (process.env.ADB_PATH) {
      candidates.add(process.env.ADB_PATH)
    }

    // Release packages include the official portable scrcpy bundle, which also
    // contains a matching adb binary. Prefer it over a GUI process's incomplete PATH.
    candidates.add(path.join(process.resourcesPath, 'scrcpy', executableName))

    for (const segment of (process.env.PATH ?? '').split(path.delimiter)) {
      if (segment) {
        candidates.add(path.join(segment, executableName))
      }
    }

    if (process.platform === 'darwin') {
      candidates.add('/opt/homebrew/bin/adb')
      candidates.add('/usr/local/bin/adb')
      candidates.add(path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'))
    }

    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA
      if (localAppData) {
        candidates.add(path.join(localAppData, 'Android/Sdk/platform-tools/adb.exe'))
      }
    }

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        return {
          available: true,
          path: candidate,
          installHint: installHintForPlatform()
        }
      }
    }

    return {
      available: false,
      installHint: installHintForPlatform()
    }
  }
}
