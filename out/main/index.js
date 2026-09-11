import path from "node:path";
import fs$1 from "node:fs";
import { ipcMain, app, dialog, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import pkg from "node-apk";
import Store from "electron-store";
import { EventEmitter } from "node:events";
import { Bonjour } from "bonjour-service";
import { AndroidRemote, RemoteDirection } from "androidtv-remote";
import http from "node:http";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const IPC_CHANNELS = {
  devicesList: "devices.list",
  devicesSave: "devices.save",
  devicesDelete: "devices.delete",
  devicesPair: "devices.pair",
  devicesBeginNativePairing: "devices.beginNativePairing",
  devicesCompleteNativePairing: "devices.completeNativePairing",
  devicesDiscoverNative: "devices.discoverNative",
  devicesDiscoverAdb: "devices.discoverAdb",
  devicesConnect: "devices.connect",
  devicesDisconnect: "devices.disconnect",
  remoteSendKey: "remote.sendKey",
  remoteSendText: "remote.sendText",
  appsList: "apps.list",
  appsLaunch: "apps.launch",
  appsToggleFavorite: "apps.toggleFavorite",
  diagnosticsGetStatus: "diagnostics.getStatus",
  diagnosticsGetHealth: "diagnostics.getHealth",
  diagnosticsRunAdbTroubleshooting: "diagnostics.runAdbTroubleshooting",
  appsGetForegroundApp: "apps.getForegroundApp",
  actionsRunQuickAction: "actions.runQuickAction",
  devicesUpdatePreferences: "devices.updatePreferences",
  adbWakeAndReconnect: "adb.wakeAndReconnect",
  scrcpyGetStatus: "scrcpy.getStatus",
  scrcpyLaunch: "scrcpy.launch",
  sideloadChooseApk: "sideload.chooseApk",
  sideloadInstallApk: "sideload.installApk",
  webRemoteGetStatus: "webRemote.getStatus",
  webRemoteUpdate: "webRemote.update",
  connectionStateChanged: "events.connectionStateChanged",
  devicesChanged: "events.devicesChanged",
  webRemoteStatusChanged: "events.webRemoteStatusChanged"
};
function registerIpc(options) {
  const {
    deviceManager: deviceManager2,
    remoteController,
    appController,
    actionController,
    scrcpyController,
    sideloadController,
    webRemoteServer: webRemoteServer2,
    adbLocator,
    adbClient,
    getMainWindow
  } = options;
  let cachedAdbVersion;
  ipcMain.handle(IPC_CHANNELS.devicesList, () => deviceManager2.listDevices());
  ipcMain.handle(IPC_CHANNELS.devicesSave, (_event, input) => deviceManager2.saveDevice(input));
  ipcMain.handle(IPC_CHANNELS.devicesDelete, (_event, deviceId) => deviceManager2.deleteDevice(deviceId));
  ipcMain.handle(IPC_CHANNELS.devicesPair, (_event, input) => deviceManager2.pairAndConnect(input));
  ipcMain.handle(
    IPC_CHANNELS.devicesBeginNativePairing,
    (_event, input) => deviceManager2.beginNativePairing(input)
  );
  ipcMain.handle(
    IPC_CHANNELS.devicesCompleteNativePairing,
    (_event, input) => deviceManager2.completeNativePairing(input.code)
  );
  ipcMain.handle(IPC_CHANNELS.devicesDiscoverNative, () => deviceManager2.discoverNativeDevices());
  ipcMain.handle(IPC_CHANNELS.devicesDiscoverAdb, async (_event, host) => {
    const adbInfo = await adbLocator.locate();
    return adbInfo.available ? deviceManager2.discoverAdbEndpoints(host) : [];
  });
  ipcMain.handle(IPC_CHANNELS.devicesConnect, (_event, input) => deviceManager2.connectDevice(input));
  ipcMain.handle(IPC_CHANNELS.devicesDisconnect, () => deviceManager2.disconnectActiveDevice());
  ipcMain.handle(IPC_CHANNELS.remoteSendKey, (_event, command) => remoteController.sendCommand(command));
  ipcMain.handle(IPC_CHANNELS.remoteSendText, (_event, input) => remoteController.sendText(input.text));
  ipcMain.handle(IPC_CHANNELS.appsList, (_event, forceRefresh) => appController.listApps(forceRefresh));
  ipcMain.handle(IPC_CHANNELS.appsLaunch, (_event, app2) => appController.launchApp(app2));
  ipcMain.handle(
    IPC_CHANNELS.appsToggleFavorite,
    (_event, packageName) => appController.toggleFavorite(packageName)
  );
  ipcMain.handle(IPC_CHANNELS.appsGetForegroundApp, () => appController.getForegroundApp());
  ipcMain.handle(IPC_CHANNELS.actionsRunQuickAction, (_event, id) => actionController.runQuickAction(id));
  ipcMain.handle(
    IPC_CHANNELS.devicesUpdatePreferences,
    (_event, input) => deviceManager2.updateActiveDevicePreferences(input)
  );
  ipcMain.handle(IPC_CHANNELS.adbWakeAndReconnect, () => deviceManager2.wakeAndReconnect());
  ipcMain.handle(IPC_CHANNELS.scrcpyGetStatus, () => scrcpyController.getStatus());
  ipcMain.handle(
    IPC_CHANNELS.scrcpyLaunch,
    (_event, input) => scrcpyController.launch(input.preset)
  );
  ipcMain.handle(IPC_CHANNELS.sideloadChooseApk, () => sideloadController.chooseApk(getMainWindow()));
  ipcMain.handle(
    IPC_CHANNELS.sideloadInstallApk,
    (_event, input) => sideloadController.installApk(input.id)
  );
  ipcMain.handle(IPC_CHANNELS.webRemoteGetStatus, () => webRemoteServer2.getStatus());
  ipcMain.handle(
    IPC_CHANNELS.webRemoteUpdate,
    (_event, input) => webRemoteServer2.update(input)
  );
  ipcMain.handle(IPC_CHANNELS.diagnosticsGetStatus, async () => {
    const adbInfo = await adbLocator.locate();
    const version = adbInfo.available ? cachedAdbVersion ??= await adbClient.version() : void 0;
    const health = await deviceManager2.getHealth(adbInfo.available);
    const quickActions = actionController.listQuickActions(health, null);
    return {
      adb: {
        available: adbInfo.available,
        path: adbInfo.path,
        version,
        installHint: adbInfo.installHint
      },
      connectionState: deviceManager2.getConnectionState(),
      activeBackend: deviceManager2.getActiveBackend(),
      activeDevice: deviceManager2.getActiveDevice(),
      savedDevices: deviceManager2.listDevices(),
      pendingNativePairing: deviceManager2.getPendingNativePairing(),
      capabilities: deviceManager2.getCapabilities(),
      health,
      recommendedActions: health?.recommendedActions ?? [],
      foregroundApp: null,
      quickActions,
      scrcpy: await scrcpyController.getStatus()
    };
  });
  ipcMain.handle(IPC_CHANNELS.diagnosticsGetHealth, async () => {
    const adbInfo = await adbLocator.locate();
    return deviceManager2.getHealth(adbInfo.available);
  });
  ipcMain.handle(IPC_CHANNELS.diagnosticsRunAdbTroubleshooting, async () => {
    const adbInfo = await adbLocator.locate();
    return deviceManager2.runAdbTroubleshooting(adbInfo.available);
  });
  deviceManager2.on("connectionState", (state) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.connectionStateChanged, state);
  });
  deviceManager2.on("devicesChanged", (devices) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.devicesChanged, devices);
  });
  webRemoteServer2.on("status", (status) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.webRemoteStatusChanged, status);
  });
}
async function fileExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}
function installHintForPlatform() {
  switch (process.platform) {
    case "darwin":
      return "Install Android Platform Tools with Homebrew (`brew install android-platform-tools`) or Android Studio.";
    case "win32":
      return "Install Android Platform Tools from Google or through Android Studio, then reopen the app.";
    default:
      return "Install Android Platform Tools and make sure `adb` is available on PATH.";
  }
}
class AdbLocator {
  async locate() {
    const executableName = process.platform === "win32" ? "adb.exe" : "adb";
    const candidates = /* @__PURE__ */ new Set();
    if (process.env.ADB_PATH) {
      candidates.add(process.env.ADB_PATH);
    }
    candidates.add(path.join(process.resourcesPath, "scrcpy", executableName));
    for (const segment of (process.env.PATH ?? "").split(path.delimiter)) {
      if (segment) {
        candidates.add(path.join(segment, executableName));
      }
    }
    if (process.platform === "darwin") {
      candidates.add("/opt/homebrew/bin/adb");
      candidates.add("/usr/local/bin/adb");
      candidates.add(path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb"));
    }
    if (process.platform === "win32") {
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        candidates.add(path.join(localAppData, "Android/Sdk/platform-tools/adb.exe"));
      }
    }
    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        return {
          available: true,
          path: candidate,
          installHint: installHintForPlatform()
        };
      }
    }
    return {
      available: false,
      installHint: installHintForPlatform()
    };
  }
}
const APP_TITLE_ALIASES = {
  "com.apple.atve.androidtv.appletv": "Apple TV",
  "com.disney.disneyplus": "Disney+",
  "com.google.android.play.games": "Google Play Games",
  "com.google.android.youtube.tv": "YouTube",
  "com.netflix.ninja": "Netflix",
  "com.amazon.amazonvideo.livingroom": "Prime Video",
  "com.alphainventor.filemanager": "File Manager",
  "com.mxtech.videoplayer.ad": "MX Player",
  "com.spotify.tv.android": "Spotify",
  "in.startv.hotstar": "Hotstar",
  "com.xiaomi.mitv.manualhelp": "Manual Help",
  "com.xiaomi.mitv.mediaexplorer": "Media Explorer",
  "org.localsend.localsend_app": "LocalSend"
};
function parseAdbVersion(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).find((line) => line.toLowerCase().startsWith("android debug bridge version")) ?? "Unknown";
}
function parseAdbDevices(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.toLowerCase().startsWith("list of devices attached")).map((line) => {
    const [serial, state] = line.split(/\s+/);
    return serial && state ? { serial, state } : null;
  }).filter((item) => item !== null);
}
function parseAdbMdnsServices(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.toLowerCase().startsWith("list of discovered mdns services")).map((line) => {
    const match = line.match(/^(.+?)\s+(_adb(?:-tls-(?:pairing|connect))?\._tcp)\s+(\d+\.\d+\.\d+\.\d+):(\d+)$/);
    if (!match) {
      return null;
    }
    const [, name, rawType, host, portText] = match;
    const serviceType = rawType === "_adb-tls-pairing._tcp" ? "pairing" : rawType === "_adb-tls-connect._tcp" ? "connect" : "legacy";
    return {
      name: name.trim(),
      host,
      port: Number(portText),
      serviceType
    };
  }).filter((item) => item !== null);
}
function humanizePackage(packageName) {
  if (APP_TITLE_ALIASES[packageName]) {
    return APP_TITLE_ALIASES[packageName];
  }
  const segments = packageName.split(".").filter(Boolean);
  const preferredSegment = [...segments].reverse().find((segment) => !["android", "tv", "app", "mobile"].includes(segment.toLowerCase())) ?? segments.at(-1) ?? packageName;
  const normalized = preferredSegment.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([a-zA-Z])(\d)/g, "$1 $2").replace(/(\d)([a-zA-Z])/g, "$1 $2").replace(/[-_]/g, " ").trim();
  const acronymized = normalized.split(/\s+/).filter(Boolean).map((token) => {
    const lower = token.toLowerCase();
    if (lower === "tv") {
      return "TV";
    }
    if (lower === "atv") {
      return "ATV";
    }
    if (lower === "mitv") {
      return "Mi TV";
    }
    if (lower === "appletv") {
      return "Apple TV";
    }
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  }).join(" ");
  return acronymized || packageName;
}
function parseLaunchableApps(output, category) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.includes("/") && !line.toLowerCase().includes("no activities found")).map((line) => {
    const [packageName, activityPart] = line.split("/", 2);
    if (!packageName || !activityPart) {
      return null;
    }
    const activity = activityPart.startsWith(".") ? `${packageName}/${packageName}${activityPart}` : `${packageName}/${activityPart}`;
    return {
      packageName,
      activity,
      displayName: humanizePackage(packageName),
      category
    };
  }).filter((item) => item !== null);
}
function parseForegroundApp(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = [
    /u\d+\s+([A-Za-z0-9._$]+)\/([A-Za-z0-9._$]+)/,
    /mCurrentFocus=Window\{[^}]+\s+u\d+\s+([A-Za-z0-9._$]+)\/([A-Za-z0-9._$]+)/,
    /topResumedActivity=.*? ([A-Za-z0-9._$]+)\/([A-Za-z0-9._$]+)/
  ];
  for (const line of lines) {
    for (const pattern of candidates) {
      const match = line.match(pattern);
      if (!match) {
        continue;
      }
      const [, packageName, activityPart] = match;
      const activity = activityPart.startsWith(".") ? `${packageName}${activityPart}` : activityPart;
      return {
        packageName,
        activity,
        displayName: humanizePackage(packageName)
      };
    }
  }
  return null;
}
function escapeAdbText(text) {
  return text.replace(/\r?\n/g, " ").replace(/[^\x20-\x7E]/g, "?").replace(/([\\()<>|;&*~"'`$!#?[\]{}])/g, "\\$1").replace(/ /g, "%s");
}
function chunkAdbText(text, chunkLength = 32) {
  if (chunkLength <= 0) {
    throw new Error("chunkLength must be greater than zero");
  }
  const escaped = escapeAdbText(text);
  if (!escaped) {
    return [];
  }
  const chunks = [];
  for (let cursor = 0; cursor < escaped.length; ) {
    let nextCursor = Math.min(cursor + chunkLength, escaped.length);
    if (nextCursor < escaped.length && escaped[nextCursor - 1] === "\\") {
      nextCursor -= 1;
    }
    if (nextCursor === cursor) {
      nextCursor = Math.min(cursor + chunkLength, escaped.length);
    }
    chunks.push(escaped.slice(cursor, nextCursor));
    cursor = nextCursor;
  }
  return chunks;
}
function buildSerial(device) {
  return `${device.host}:${device.connectPort}`;
}
function deriveConnectionState(devices, serial, deviceId) {
  if (!serial) {
    return { status: "disconnected", deviceId };
  }
  const match = devices.find((device) => device.serial === serial);
  if (!match) {
    return { status: "disconnected", deviceId };
  }
  if (match.state === "device") {
    return { status: "connected", deviceId };
  }
  if (match.state === "unauthorized") {
    return {
      status: "unauthorized",
      deviceId,
      message: "Authorize this computer in the TV wireless debugging prompt and try again."
    };
  }
  return {
    status: "error",
    deviceId,
    message: `ADB reported device state "${match.state}".`
  };
}
function shouldAttemptReconnect(activeDevice, state, isReconnectInFlight) {
  if (!activeDevice || isReconnectInFlight) {
    return false;
  }
  return state.status === "disconnected" || state.status === "error";
}
const { Apk } = pkg;
const execFileAsync$1 = promisify(execFile);
class AdbClient {
  constructor(adbPath, defaultTimeoutMs = 8e3) {
    this.adbPath = adbPath;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }
  async version() {
    const { stdout } = await this.runRaw(["version"]);
    return parseAdbVersion(stdout);
  }
  async listDevices() {
    const { stdout } = await this.runRaw(["devices"]);
    return parseAdbDevices(stdout);
  }
  async getConnectionState(device) {
    const devices = await this.listDevices();
    return deriveConnectionState(devices, buildSerial(device), device.id);
  }
  async pair(host, pairPort, code) {
    const { stdout, stderr } = await this.runRaw(["pair", `${host}:${pairPort}`, code], { timeoutMs: 15e3 });
    const joined = `${stdout}
${stderr}`.toLowerCase();
    if (!joined.includes("successfully paired")) {
      throw new Error((stdout || stderr || "Pairing failed.").trim());
    }
  }
  async connect(host, connectPort) {
    const { stdout, stderr } = await this.runRaw(["connect", `${host}:${connectPort}`], { timeoutMs: 12e3 });
    const joined = `${stdout}
${stderr}`.toLowerCase();
    if (!joined.includes("connected to") && !joined.includes("already connected")) {
      throw new Error((stdout || stderr || "Unable to connect to device.").trim());
    }
  }
  async killServer() {
    await this.runRaw(["kill-server"], { timeoutMs: 5e3 });
  }
  async startServer() {
    await this.runRaw(["start-server"], { timeoutMs: 8e3 });
  }
  async restartServer() {
    await this.killServer();
    await this.startServer();
  }
  async listMdnsServices() {
    const { stdout } = await this.runRaw(["mdns", "services"], { timeoutMs: 8e3 });
    return parseAdbMdnsServices(stdout);
  }
  async disconnect(serial) {
    const args = ["disconnect"];
    if (serial) {
      args.push(serial);
    }
    await this.runRaw(args);
  }
  async sendKey(serial, keyCode) {
    await this.runSerial(serial, ["shell", "input", "keyevent", String(keyCode)]);
  }
  async wakeUp(serial) {
    await this.sendKey(serial, 224);
  }
  async sendText(serial, text) {
    const chunks = chunkAdbText(text);
    for (const chunk of chunks) {
      await this.runSerial(serial, ["shell", "input", "text", chunk], { timeoutMs: 1e4 });
    }
  }
  async listLaunchableApps(serial) {
    const categories = [
      { androidCategory: "android.intent.category.LEANBACK_LAUNCHER", category: "leanback" },
      { androidCategory: "android.intent.category.LAUNCHER", category: "launcher" }
    ];
    const appsByPackage = /* @__PURE__ */ new Map();
    const failures = [];
    for (const { androidCategory, category } of categories) {
      try {
        const apps2 = await this.listAppsForCategory(serial, androidCategory, category);
        for (const app2 of apps2) {
          if (!appsByPackage.has(app2.packageName) || category === "leanback") {
            appsByPackage.set(app2.packageName, app2);
          }
        }
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error("App discovery failed."));
      }
    }
    if (appsByPackage.size === 0 && failures.length > 0) {
      throw failures[0];
    }
    const apps = [...appsByPackage.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
    return this.enrichAppsMetadata(serial, apps);
  }
  async launchApp(serial, app2) {
    await this.runSerial(serial, ["shell", "am", "start", "-n", app2.activity]);
  }
  async launchPackage(serial, packageName) {
    await this.runSerial(serial, ["shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"]);
  }
  async openAppInfo(serial, packageName) {
    await this.runSerial(serial, [
      "shell",
      "am",
      "start",
      "-a",
      "android.settings.APPLICATION_DETAILS_SETTINGS",
      "-d",
      `package:${packageName}`
    ]);
  }
  async installApk(serial, apkPath) {
    const { stdout, stderr } = await this.runRaw(["-s", serial, "install", "-r", apkPath], {
      timeoutMs: 18e4
    });
    const joined = `${stdout}
${stderr}`.toLowerCase();
    if (!joined.includes("success")) {
      throw new Error((stdout || stderr || "APK install failed.").trim());
    }
  }
  async getForegroundApp(serial) {
    const windowDump = await this.runSerial(serial, ["shell", "dumpsys", "window", "windows"], {
      timeoutMs: 12e3
    });
    const parsed = parseForegroundApp(windowDump.stdout);
    if (parsed) {
      return parsed;
    }
    const activityDump = await this.runSerial(serial, ["shell", "dumpsys", "activity", "activities"], {
      timeoutMs: 12e3
    });
    return parseForegroundApp(activityDump.stdout);
  }
  async runSerial(serial, args, options) {
    return this.runRaw(["-s", serial, ...args], options);
  }
  async enrichAppsMetadata(serial, apps) {
    const enriched = [];
    for (const app2 of apps) {
      enriched.push(await this.enrichAppMetadata(serial, app2));
    }
    return enriched.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }
  async enrichAppMetadata(serial, app2) {
    let tempDir = null;
    let apkPath = null;
    try {
      const remoteApkPath = await this.getRemoteApkPath(serial, app2.packageName);
      if (!remoteApkPath) {
        return app2;
      }
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "android-tv-remote-apk-"));
      apkPath = path.join(tempDir, `${randomUUID()}.apk`);
      await this.runRaw(["-s", serial, "pull", remoteApkPath, apkPath], {
        timeoutMs: 12e4
      });
      const apk = new Apk(apkPath);
      try {
        const [manifest2, resources] = await Promise.all([apk.getManifestInfo(), apk.getResources()]);
        const displayName = this.resolveAppLabel(manifest2.applicationLabel, resources) ?? app2.displayName;
        const iconDataUrl = await this.resolveAppIconDataUrl(apk, manifest2.applicationIcon, resources);
        return {
          ...app2,
          displayName,
          iconDataUrl: iconDataUrl ?? app2.iconDataUrl
        };
      } finally {
        apk.close();
      }
    } catch {
      return app2;
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      } else if (apkPath) {
        await fs.rm(apkPath, { force: true });
      }
    }
  }
  async getRemoteApkPath(serial, packageName) {
    try {
      const { stdout } = await this.runSerial(serial, ["shell", "pm", "path", packageName], {
        timeoutMs: 1e4
      });
      const apkPaths = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("package:")).map((line) => line.slice("package:".length));
      return apkPaths.find((item) => item.endsWith("base.apk")) ?? apkPaths[0] ?? null;
    } catch {
      return null;
    }
  }
  resolveAppLabel(labelValue, resources) {
    if (typeof labelValue === "string" && labelValue.trim()) {
      return labelValue.trim();
    }
    if (typeof labelValue !== "number") {
      return null;
    }
    const resource = this.pickBestStringResource(resources.resolve(labelValue));
    return typeof resource?.value === "string" && resource.value.trim() ? resource.value.trim() : null;
  }
  async resolveAppIconDataUrl(apk, iconResourceId, resources) {
    if (!iconResourceId) {
      return null;
    }
    const resource = this.pickBestIconResource(resources.resolve(iconResourceId));
    if (!resource || typeof resource.value !== "string") {
      return null;
    }
    const mimeType = this.getIconMimeType(resource.value);
    if (!mimeType) {
      return null;
    }
    const iconBytes = await apk.extract(resource.value);
    return `data:${mimeType};base64,${iconBytes.toString("base64")}`;
  }
  pickBestStringResource(resources) {
    const englishResource = resources.find((resource) => typeof resource.value === "string" && resource.locale?.language === "en") ?? resources.find((resource) => typeof resource.value === "string" && !resource.locale?.language) ?? resources.find((resource) => typeof resource.value === "string");
    return englishResource ?? null;
  }
  pickBestIconResource(resources) {
    const ranked = resources.filter((resource) => typeof resource.value === "string").sort((left, right) => this.rankIconPath(String(right.value)) - this.rankIconPath(String(left.value)));
    return ranked[0] ?? null;
  }
  rankIconPath(resourcePath) {
    const normalized = resourcePath.toLowerCase();
    if (normalized.endsWith(".png")) {
      return 90 + this.rankIconDensity(normalized);
    }
    if (normalized.endsWith(".webp")) {
      return 80 + this.rankIconDensity(normalized);
    }
    if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
      return 70 + this.rankIconDensity(normalized);
    }
    return this.rankIconDensity(normalized);
  }
  rankIconDensity(resourcePath) {
    if (resourcePath.includes("xxxhdpi")) return 60;
    if (resourcePath.includes("xxhdpi")) return 50;
    if (resourcePath.includes("xhdpi")) return 40;
    if (resourcePath.includes("hdpi")) return 30;
    if (resourcePath.includes("mdpi")) return 20;
    if (resourcePath.includes("drawable")) return 10;
    return 0;
  }
  getIconMimeType(resourcePath) {
    const normalized = resourcePath.toLowerCase();
    if (normalized.endsWith(".png")) {
      return "image/png";
    }
    if (normalized.endsWith(".webp")) {
      return "image/webp";
    }
    if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    return null;
  }
  async listAppsForCategory(serial, androidCategory, category) {
    let lastError = null;
    for (const args of this.getCategoryQueryCommands(androidCategory)) {
      try {
        const { stdout } = await this.runSerial(serial, args, { timeoutMs: 12e3 });
        return parseLaunchableApps(stdout, category);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("App discovery failed.");
      }
    }
    try {
      return await this.listAppsByResolvingPackages(serial, androidCategory, category);
    } catch (error) {
      throw lastError ?? (error instanceof Error ? error : new Error("App discovery failed."));
    }
  }
  getCategoryQueryCommands(androidCategory) {
    return [
      [
        "shell",
        "cmd",
        "package",
        "query-intent-activities",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        androidCategory
      ],
      [
        "shell",
        "pm",
        "query-intent-activities",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        androidCategory
      ]
    ];
  }
  async listAppsByResolvingPackages(serial, androidCategory, category) {
    const packages = await this.listInstalledPackages(serial);
    const apps = [];
    for (const packageName of packages) {
      const app2 = await this.resolveLaunchableActivity(serial, packageName, androidCategory, category);
      if (app2) {
        apps.push(app2);
      }
    }
    return apps;
  }
  async listInstalledPackages(serial) {
    const { stdout } = await this.runSerial(serial, ["shell", "pm", "list", "packages"], { timeoutMs: 2e4 });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("package:")).map((line) => line.slice("package:".length));
  }
  async resolveLaunchableActivity(serial, packageName, androidCategory, category) {
    for (const args of [
      [
        "shell",
        "cmd",
        "package",
        "resolve-activity",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        androidCategory,
        packageName
      ],
      [
        "shell",
        "pm",
        "resolve-activity",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        androidCategory,
        packageName
      ]
    ]) {
      try {
        const { stdout } = await this.runSerial(serial, args, { timeoutMs: 5e3 });
        return parseLaunchableApps(stdout, category)[0] ?? null;
      } catch {
      }
    }
    return null;
  }
  async runRaw(args, options) {
    try {
      return await execFileAsync$1(this.adbPath, args, {
        timeout: options?.timeoutMs ?? this.defaultTimeoutMs,
        maxBuffer: 2 * 1024 * 1024
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ADB command failed.";
      throw new Error(message);
    }
  }
}
class ElectronDeviceStore {
  store = new Store({
    name: "devices",
    defaults: {
      savedDevices: [],
      activeDeviceId: null
    }
  });
  load() {
    return this.store.store;
  }
  save(snapshot) {
    this.store.set(snapshot);
  }
}
const RECENT_APPS_LIMIT = 8;
const HOTKEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DEFAULT_SCRCPY_PRESET = "fast";
const REMOTE_COMMANDS = /* @__PURE__ */ new Set([
  "up",
  "down",
  "left",
  "right",
  "select",
  "home",
  "back",
  "menu",
  "appSwitch",
  "playPause",
  "rewind",
  "fastForward",
  "next",
  "previous",
  "power",
  "sleep",
  "volumeUp",
  "volumeDown",
  "mute",
  "enter",
  "delete"
]);
function normalizeHostKey(host) {
  const normalized = host?.trim().toLowerCase();
  return normalized ? normalized : null;
}
function hasNativeProfile(device) {
  return Boolean(device.nativeRemote);
}
function hasNativeCertificate(device) {
  return Boolean(device.nativeRemote?.certificate?.key && device.nativeRemote?.certificate?.cert);
}
function canConnectViaNative(device) {
  return hasNativeProfile(device) && hasNativeCertificate(device);
}
function canUseAdb(device) {
  return device.adbEnabled !== false;
}
function filterRemoteCommands(commands = []) {
  const unique = /* @__PURE__ */ new Set();
  for (const command of commands) {
    if (typeof command === "string" && REMOTE_COMMANDS.has(command)) {
      unique.add(command);
    }
  }
  return [...unique];
}
function normalizeDevicePreferences(preferences, favorites = []) {
  const favoriteSet = new Set(favorites);
  const appHotkeys = {};
  for (const hotkey of HOTKEYS) {
    const packageName = preferences?.appHotkeys?.[hotkey];
    if (packageName && favoriteSet.has(packageName)) {
      appHotkeys[hotkey] = packageName;
    }
  }
  return {
    remoteLayout: {
      pinnedCommands: filterRemoteCommands(preferences?.remoteLayout?.pinnedCommands),
      hiddenCommands: filterRemoteCommands(preferences?.remoteLayout?.hiddenCommands)
    },
    appHotkeys,
    scrcpyPreset: preferences?.scrcpyPreset ?? DEFAULT_SCRCPY_PRESET
  };
}
function getBackendOrder(device) {
  const preferred = device.preferredBackend ?? "adb";
  const nativeReady = canConnectViaNative(device);
  const adbReady = canUseAdb(device);
  if (preferred === "native") {
    if (nativeReady) {
      return ["native"];
    }
    return adbReady ? ["adb"] : ["native"];
  }
  if (preferred === "adb") {
    return ["adb"];
  }
  if (nativeReady && adbReady) {
    return ["native", "adb"];
  }
  if (nativeReady) {
    return ["native"];
  }
  if (adbReady) {
    return ["adb"];
  }
  return ["native"];
}
function createBackendHealthSnapshot(overrides) {
  return {
    available: false,
    ready: false,
    ...overrides
  };
}
function shouldSuggestAdbPairing(device, message) {
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  const isReachabilityError = normalized.includes("no route to host") || normalized.includes("network is unreachable") || normalized.includes("connection refused") || normalized.includes("failed to connect");
  return isReachabilityError && (device.mode === "pair" || device.connectPort === 5555);
}
function formatAdbConnectError(device, error) {
  const message = error instanceof Error ? error.message.trim() : "ADB connection failed.";
  if (shouldSuggestAdbPairing(device, message)) {
    if (device.mode === "pair") {
      return `${message} The TV is not reachable on saved ADB connect port ${device.connectPort}. Open Wireless Debugging on the TV, confirm the current connect port, then pair and connect again.`;
    }
    if (device.connectPort === 5555) {
      return `${message} Port 5555 is usually not the Wireless Debugging port on Android TV. Switch to "Pair then connect" and use the current connect port shown on the TV instead of 5555.`;
    }
  }
  const normalized = message.toLowerCase();
  const isReachabilityError = normalized.includes("no route to host") || normalized.includes("network is unreachable") || normalized.includes("connection refused");
  if (isReachabilityError) {
    return `${message} ${device.host}:${device.connectPort} is not reachable right now. If this TV uses Wireless Debugging, reopen that screen and verify the current connect port on the TV.`;
  }
  return message;
}
function shouldRetryAdbAfterServerRestart(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("no route to host") || message.includes("cannot assign requested address") || message.includes("network is unreachable");
}
class DeviceManager extends EventEmitter {
  constructor(store, adbClient, nativeRemoteService) {
    super();
    this.store = store;
    this.adbClient = adbClient;
    this.nativeRemoteService = nativeRemoteService;
  }
  savedDevices = [];
  activeDeviceId = null;
  activeBackend = null;
  connectionState = { status: "disconnected" };
  reconnectInFlight = false;
  healthCheckTimer = null;
  async init() {
    const snapshot = this.store.load();
    const normalizedDevices = snapshot.savedDevices.map(
      (device) => this.normalizeDevice({
        ...device
      })
    );
    const deduped = this.dedupeSavedDevices(normalizedDevices, snapshot.activeDeviceId);
    this.savedDevices = deduped.devices;
    this.activeDeviceId = deduped.activeDeviceId;
    this.nativeRemoteService.on("unpaired", (message) => {
      const activeDevice = this.getActiveDevice();
      if (activeDevice) {
        this.updateBackendHealth(activeDevice.id, "native", {
          available: hasNativeProfile(activeDevice),
          ready: false,
          lastState: "error",
          lastError: message
        });
      }
      this.activeBackend = null;
      this.updateConnectionState({
        status: "error",
        deviceId: activeDevice?.id,
        message
      });
    });
    this.emitDevicesChanged();
    this.persist();
    this.healthCheckTimer = setInterval(() => {
      void this.performHealthCheck();
    }, 7e3);
    if (this.getActiveDevice()) {
      queueMicrotask(() => {
        void this.attemptReconnect().catch((error) => {
          const activeDevice = this.getActiveDevice();
          this.activeBackend = null;
          this.updateConnectionState({
            status: "error",
            deviceId: activeDevice?.id,
            message: error instanceof Error ? error.message : "Reconnect failed."
          });
        });
      });
    }
  }
  dispose() {
    this.nativeRemoteService.disconnect();
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
  listDevices() {
    return [...this.savedDevices].sort((left, right) => left.name.localeCompare(right.name));
  }
  getActiveDevice() {
    return this.savedDevices.find((device) => device.id === this.activeDeviceId) ?? null;
  }
  getActiveBackend() {
    return this.activeBackend;
  }
  getConnectionState() {
    return this.connectionState;
  }
  getPendingNativePairing() {
    return this.nativeRemoteService.getPendingPairing();
  }
  getCapabilities() {
    const activeDevice = this.getActiveDevice();
    const adbReady = Boolean(
      activeDevice && canUseAdb(activeDevice) && (this.activeBackend === "adb" ? this.connectionState.status === "connected" : activeDevice.backendHealth?.adb.ready)
    );
    return {
      nativeRemote: Boolean(activeDevice && canConnectViaNative(activeDevice)),
      adbFallback: adbReady,
      typing: this.activeBackend === "adb" || adbReady,
      apps: this.activeBackend === "adb" || adbReady
    };
  }
  async getHealth(adbAvailable) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      return null;
    }
    const pendingNativePairing = this.getPendingNativePairing();
    const adbSnapshot = this.resolveAdbHealth(activeDevice, adbAvailable);
    const nativeSnapshot = this.resolveNativeHealth(activeDevice);
    const issues = [];
    if (!adbAvailable) {
      issues.push({
        code: "adb_missing",
        severity: "danger",
        summary: "ADB is not available on this computer.",
        detail: "Install Android platform-tools so this app can connect reliably and power typing plus installed apps.",
        backend: "system"
      });
    } else if (!canUseAdb(activeDevice)) {
      issues.push({
        code: "adb_disabled_for_tv",
        severity: "warning",
        summary: "ADB is turned off for this TV profile.",
        detail: "Enable ADB for this TV to unlock typing, installed apps, and the most reliable connection path.",
        backend: "adb"
      });
    } else if (this.connectionState.status === "unauthorized" && this.connectionState.backend === "adb") {
      issues.push({
        code: "adb_unauthorized",
        severity: "warning",
        summary: "ADB needs authorization on the TV.",
        detail: "Accept the wireless debugging prompt on the TV, then retry the ADB connection.",
        backend: "adb"
      });
    } else if (activeDevice.mode === "pair" && !adbSnapshot.ready && !activeDevice.backendHealth?.adb.lastConnectedAt) {
      issues.push({
        code: "adb_pair_required",
        severity: "warning",
        summary: "ADB pairing still needs to be completed for this TV.",
        detail: "Use the pairing code from the TV before trying to use ADB-backed features.",
        backend: "adb"
      });
    } else if (adbSnapshot.lastError && this.connectionState.status !== "connected") {
      issues.push({
        code: "adb_connect_failed",
        severity: "danger",
        summary: "ADB is enabled but not ready yet.",
        detail: adbSnapshot.lastError,
        backend: "adb"
      });
    }
    if (pendingNativePairing && pendingNativePairing.deviceId === activeDevice.id) {
      issues.push({
        code: "native_pairing_stalled",
        severity: "warning",
        summary: "Native remote is waiting for a TV code.",
        detail: "If the TV never shows the code prompt, stop here and switch back to ADB.",
        backend: "native"
      });
    }
    if (issues.length === 0) {
      issues.push({
        code: "ready",
        severity: "positive",
        summary: "This TV is ready to use.",
        detail: this.connectionState.status === "connected" ? `Connected over ${this.activeBackend === "native" ? "Native Remote" : "ADB"}.` : "ADB is configured and the setup state looks healthy."
      });
    }
    const recommendedActions = this.buildRecommendedActions(activeDevice, issues);
    const primaryIssue = issues[0];
    return {
      deviceId: activeDevice.id,
      summary: primaryIssue.summary,
      detail: primaryIssue.detail,
      issues,
      adb: adbSnapshot,
      native: nativeSnapshot,
      recommendedActions
    };
  }
  async runAdbTroubleshooting(adbAvailable) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      return null;
    }
    if (!adbAvailable) {
      this.updateBackendHealth(activeDevice.id, "adb", {
        available: false,
        ready: false,
        lastState: "missing",
        lastError: "ADB was not detected on this computer."
      });
      return this.getHealth(adbAvailable);
    }
    if (!canUseAdb(activeDevice)) {
      this.updateBackendHealth(activeDevice.id, "adb", {
        available: false,
        ready: false,
        lastState: "disabled",
        lastError: "ADB is disabled for this TV profile."
      });
      return this.getHealth(adbAvailable);
    }
    if (this.getPendingNativePairing()?.deviceId === activeDevice.id) {
      this.updateBackendHealth(activeDevice.id, "native", {
        available: hasNativeProfile(activeDevice),
        ready: false,
        lastState: "pairing",
        lastError: "Native pairing is still waiting for a code from the TV."
      });
      return this.getHealth(adbAvailable);
    }
    try {
      const discovered = await this.getResolvedAdbEndpoint(activeDevice.host);
      const resolvedDevice = discovered ? this.normalizeDevice({
        ...activeDevice,
        connectPort: discovered.connectPort ?? activeDevice.connectPort,
        pairPort: discovered.pairPort ?? activeDevice.pairPort
      }) : activeDevice;
      const devices = await this.adbClient.listDevices();
      const liveState = deriveConnectionState(devices, buildSerial(resolvedDevice), activeDevice.id);
      if (liveState.status === "connected") {
        this.updateBackendHealth(activeDevice.id, "adb", {
          available: true,
          ready: true,
          lastState: "ready",
          lastError: void 0,
          lastConnectedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return this.getHealth(adbAvailable);
      }
      if (liveState.status === "unauthorized") {
        this.updateBackendHealth(activeDevice.id, "adb", {
          available: true,
          ready: false,
          lastState: "unauthorized",
          lastError: liveState.message
        });
        return this.getHealth(adbAvailable);
      }
      if (resolvedDevice.mode === "pair" && resolvedDevice.pairPort) {
        this.updateBackendHealth(activeDevice.id, "adb", {
          available: true,
          ready: false,
          lastState: "pairing",
          lastError: `Pair ADB with ${resolvedDevice.host}:${resolvedDevice.pairPort} before reconnecting.`
        });
        return this.getHealth(adbAvailable);
      }
      await this.connectAdbWithRecovery(resolvedDevice);
      const nextState = await this.adbClient.getConnectionState(resolvedDevice);
      if (nextState.status === "connected") {
        this.updateBackendHealth(activeDevice.id, "adb", {
          available: true,
          ready: true,
          lastState: "ready",
          lastError: void 0,
          lastConnectedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        this.updateBackendHealth(activeDevice.id, "adb", {
          available: true,
          ready: false,
          lastState: nextState.status,
          lastError: nextState.message ?? "ADB is still not ready for this TV."
        });
      }
    } catch (error) {
      this.updateBackendHealth(activeDevice.id, "adb", {
        available: true,
        ready: false,
        lastState: "error",
        lastError: error instanceof Error ? error.message : "ADB troubleshooting failed."
      });
    }
    return this.getHealth(adbAvailable);
  }
  async discoverNativeDevices() {
    return this.nativeRemoteService.discoverDevices();
  }
  async discoverAdbEndpoints(host) {
    const client = this.adbClient;
    let services = [];
    if (typeof client.listMdnsServices === "function") {
      try {
        services = await client.listMdnsServices();
      } catch {
        services = [];
      }
    }
    if (services.length === 0) {
      services = await this.discoverAdbBonjourServices();
    }
    const grouped = /* @__PURE__ */ new Map();
    for (const service of services) {
      const key = normalizeHostKey(service.host);
      if (!key) {
        continue;
      }
      const current = grouped.get(key) ?? {
        host: service.host,
        services: []
      };
      current.services.push(service);
      if (service.serviceType === "pairing") {
        current.pairPort = service.port;
      }
      if (service.serviceType === "connect" || !current.connectPort && service.serviceType === "legacy") {
        current.connectPort = service.port;
      }
      grouped.set(key, current);
    }
    const targetHostKey = normalizeHostKey(host);
    const endpoints = [...grouped.values()].sort((left, right) => left.host.localeCompare(right.host));
    return targetHostKey ? endpoints.filter((item) => normalizeHostKey(item.host) === targetHostKey) : endpoints;
  }
  async saveDevice(input) {
    const { device: existing } = this.findSavedDevice(input);
    const device = this.normalizeDevice({
      ...existing,
      ...input,
      id: existing?.id ?? input.id ?? randomUUID()
    });
    const deviceHostKey = normalizeHostKey(device.host);
    this.savedDevices = this.savedDevices.filter((item) => {
      if (item.id === device.id) {
        return false;
      }
      if (deviceHostKey && normalizeHostKey(item.host) === deviceHostKey) {
        return false;
      }
      return true;
    });
    this.savedDevices.push(device);
    this.persist();
    this.emitDevicesChanged();
    return device;
  }
  async deleteDevice(deviceId) {
    const device = this.savedDevices.find((item) => item.id === deviceId);
    if (!device) {
      return this.listDevices();
    }
    const pendingNativePairing = this.nativeRemoteService.getPendingPairing();
    const shouldTearDownSession = this.activeDeviceId === deviceId || pendingNativePairing?.deviceId === deviceId;
    if (shouldTearDownSession) {
      if (this.activeBackend === "native" || pendingNativePairing) {
        this.nativeRemoteService.disconnect();
      }
      if (this.activeBackend === "adb") {
        await this.adbClient.disconnect(buildSerial(device));
      }
      this.activeDeviceId = null;
      this.activeBackend = null;
      this.updateConnectionState({
        status: "disconnected",
        message: `${device.name} was removed from saved TVs.`
      });
    }
    this.savedDevices = this.savedDevices.filter((item) => item.id !== deviceId);
    this.persist();
    this.emitDevicesChanged();
    return this.listDevices();
  }
  async updateDeviceAppsCache(deviceId, apps) {
    const existing = this.savedDevices.find((item) => item.id === deviceId);
    if (!existing) {
      throw new Error("Cannot update apps for a TV that is no longer saved.");
    }
    const updated = this.normalizeDevice({
      ...existing,
      cachedApps: {
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        apps
      }
    });
    this.savedDevices = this.savedDevices.map((item) => item.id === deviceId ? updated : item);
    this.persist();
    this.emitDevicesChanged();
    return updated;
  }
  async toggleFavoriteApp(packageName) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before pinning favorite apps.");
    }
    const favorites = new Set(activeDevice.favorites ?? []);
    const preferences = normalizeDevicePreferences(activeDevice.preferences, activeDevice.favorites);
    if (favorites.has(packageName)) {
      favorites.delete(packageName);
      for (const hotkey of HOTKEYS) {
        if (preferences.appHotkeys[hotkey] === packageName) {
          delete preferences.appHotkeys[hotkey];
        }
      }
    } else {
      favorites.add(packageName);
    }
    return this.replaceDevice(activeDevice.id, {
      favorites: [...favorites].sort(),
      preferences
    });
  }
  async updateActiveDevicePreferences(input) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before updating remote preferences.");
    }
    const favorites = activeDevice.favorites ?? [];
    const current = normalizeDevicePreferences(activeDevice.preferences, favorites);
    const next = {
      ...current,
      remoteLayout: {
        pinnedCommands: input.remoteLayout?.pinnedCommands ? filterRemoteCommands(input.remoteLayout.pinnedCommands) : current.remoteLayout.pinnedCommands,
        hiddenCommands: input.remoteLayout?.hiddenCommands ? filterRemoteCommands(input.remoteLayout.hiddenCommands) : current.remoteLayout.hiddenCommands
      },
      appHotkeys: {
        ...current.appHotkeys
      },
      scrcpyPreset: input.scrcpyPreset ?? current.scrcpyPreset
    };
    for (const [hotkey, packageName] of Object.entries(input.appHotkeys ?? {})) {
      if (!HOTKEYS.includes(hotkey)) {
        continue;
      }
      if (!packageName) {
        delete next.appHotkeys[hotkey];
        continue;
      }
      if (!favorites.includes(packageName)) {
        throw new Error("Only pinned apps can be assigned to number hotkeys.");
      }
      for (const existingHotkey of HOTKEYS) {
        if (next.appHotkeys[existingHotkey] === packageName) {
          delete next.appHotkeys[existingHotkey];
        }
      }
      next.appHotkeys[hotkey] = packageName;
    }
    return this.replaceDevice(activeDevice.id, { preferences: normalizeDevicePreferences(next, favorites) });
  }
  async wakeAndReconnect() {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before using wake and reconnect.");
    }
    await this.withAdbAccess((serial) => this.adbClient.wakeUp(serial));
    const state = await this.connectDevice({ id: activeDevice.id });
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: state.status === "connected" ? "success" : "error",
      kind: "system",
      title: state.status === "connected" ? "Wake and reconnect finished" : "Wake sent, reconnect needs attention",
      detail: state.status === "connected" ? `${activeDevice.name} is awake and connected over ${state.backend === "native" ? "Native Remote" : "ADB"}.` : state.message ?? "Wake was sent, but the TV did not reconnect cleanly."
    };
  }
  async recordAppLaunch(packageName) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before recording app launches.");
    }
    const launchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const recentApps = [
      { packageName, launchedAt },
      ...(activeDevice.recentApps ?? []).filter((entry) => entry.packageName !== packageName)
    ].slice(0, RECENT_APPS_LIMIT);
    return this.replaceDevice(activeDevice.id, { recentApps });
  }
  async beginNativePairing(input) {
    const saved = await this.saveDevice({
      id: input.id,
      name: input.name,
      host: input.host,
      connectPort: input.connectPort,
      pairPort: input.pairPort,
      mode: input.mode,
      preferredBackend: input.preferredBackend ?? "auto",
      adbEnabled: input.adbEnabled,
      nativeRemote: {
        serviceLabel: input.serviceLabel,
        remotePort: input.remotePort,
        pairingPort: input.pairingPort
      }
    });
    this.activeDeviceId = saved.id;
    this.persist();
    this.updateBackendHealth(saved.id, "native", {
      available: true,
      ready: false,
      lastState: "pairing",
      lastError: "Waiting for the TV to show a pairing code."
    });
    this.updateConnectionState({
      status: "pairing",
      backend: "native",
      deviceId: saved.id,
      message: `Start the pairing prompt on ${saved.name}, then enter the code shown on the TV.`
    });
    try {
      const result = await this.nativeRemoteService.connect(saved);
      if (result.status === "pairing") {
        this.activeBackend = null;
        return this.connectionState;
      }
      return this.finalizeNativeConnection(saved, result.certificate);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start native pairing.";
      this.activeBackend = null;
      this.updateBackendHealth(saved.id, "native", {
        available: true,
        ready: false,
        lastState: "error",
        lastError: message
      });
      this.updateConnectionState({
        status: "error",
        backend: "native",
        deviceId: saved.id,
        message
      });
      throw error;
    }
  }
  async completeNativePairing(code) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      throw new Error("No TV is currently waiting for a native remote pairing code.");
    }
    try {
      const certificate = await this.nativeRemoteService.completePairing(code);
      return this.finalizeNativeConnection(activeDevice, certificate);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Native pairing confirmation failed.";
      this.activeBackend = null;
      this.updateBackendHealth(activeDevice.id, "native", {
        available: hasNativeProfile(activeDevice),
        ready: false,
        lastState: "error",
        lastError: message
      });
      this.updateConnectionState({
        status: "error",
        backend: "native",
        deviceId: activeDevice.id,
        message
      });
      throw error;
    }
  }
  async pairAndConnect(input) {
    const discovered = await this.getResolvedAdbEndpoint(input.host);
    const connectPort = discovered?.connectPort ?? input.connectPort;
    const pairPort = discovered?.pairPort ?? input.pairPort;
    this.updateConnectionState({
      status: "pairing",
      backend: "adb",
      message: `Pairing ADB with ${input.host}:${pairPort}...`
    });
    await this.adbClient.pair(input.host, pairPort, input.code);
    const saved = await this.saveDevice({
      name: input.name,
      host: input.host,
      connectPort,
      pairPort,
      mode: input.mode ?? "pair",
      preferredBackend: input.preferredBackend,
      nativeRemote: input.nativeRemote,
      adbEnabled: input.adbEnabled ?? true
    });
    this.updateBackendHealth(saved.id, "adb", {
      available: true,
      ready: false,
      lastState: "pairing",
      lastError: void 0
    });
    return this.connectViaAdb(saved);
  }
  async connectDevice(input) {
    const { device: existing } = this.findSavedDevice(input);
    const baseDeviceDraft = existing ? this.normalizeDevice({
      ...existing,
      ...input,
      id: existing.id
    }) : this.normalizeDevice({
      id: randomUUID(),
      name: input.name?.trim() || input.host || "Android TV",
      host: input.host,
      connectPort: input.connectPort,
      pairPort: input.pairPort,
      mode: input.mode,
      preferredBackend: input.preferredBackend,
      nativeRemote: input.nativeRemote,
      adbEnabled: input.adbEnabled
    });
    if (existing) {
      this.activeDeviceId = existing.id;
      this.persist();
    }
    const discovered = await this.getResolvedAdbEndpoint(baseDeviceDraft.host);
    if (discovered?.connectPort) {
      baseDeviceDraft.connectPort = discovered.connectPort;
    }
    if (discovered?.pairPort) {
      baseDeviceDraft.pairPort = discovered.pairPort;
    }
    let nativeError = null;
    for (const backend of getBackendOrder(baseDeviceDraft)) {
      if (backend === "native" && canConnectViaNative(baseDeviceDraft)) {
        try {
          const result = await this.connectViaNative(baseDeviceDraft);
          if (result.status === "pairing") {
            return this.connectionState;
          }
          return result;
        } catch (error) {
          nativeError = error instanceof Error ? error : new Error("Native remote connection failed.");
          baseDeviceDraft.backendHealth = {
            adb: createBackendHealthSnapshot(baseDeviceDraft.backendHealth?.adb),
            native: createBackendHealthSnapshot({
              ...baseDeviceDraft.backendHealth?.native,
              available: true,
              ready: false,
              lastState: "error",
              lastError: nativeError.message
            })
          };
          if (existing) {
            this.updateBackendHealth(existing.id, "native", {
              available: true,
              ready: false,
              lastState: "error",
              lastError: nativeError.message
            });
          }
        }
      }
      if (backend === "adb" && canUseAdb(baseDeviceDraft)) {
        try {
          return await this.connectViaAdb(baseDeviceDraft, nativeError);
        } catch (error) {
          const adbError = error instanceof Error ? error : new Error("ADB connection failed.");
          if (existing) {
            this.updateBackendHealth(existing.id, "adb", {
              available: true,
              ready: false,
              lastState: "error",
              lastError: adbError.message
            });
          }
          if (nativeError) {
            throw new Error(`${nativeError.message} ADB fallback also failed: ${adbError.message}`);
          }
          throw adbError;
        }
      }
    }
    if (nativeError) {
      throw nativeError;
    }
    throw new Error("This TV has no usable connection path yet. Pair native remote or enable ADB fallback in Setup.");
  }
  async disconnectActiveDevice() {
    const activeDevice = this.getActiveDevice();
    const pendingNativePairing = this.nativeRemoteService.getPendingPairing();
    if (this.activeBackend === "native" || pendingNativePairing) {
      this.nativeRemoteService.disconnect();
    }
    if (this.activeBackend === "adb" && activeDevice) {
      await this.adbClient.disconnect(buildSerial(activeDevice));
    }
    if (activeDevice && this.activeBackend) {
      this.updateBackendHealth(activeDevice.id, this.activeBackend, {
        available: this.activeBackend === "adb" ? canUseAdb(activeDevice) : hasNativeProfile(activeDevice),
        ready: false,
        lastState: "disconnected"
      });
    }
    this.activeBackend = null;
    this.updateConnectionState({
      status: "disconnected",
      deviceId: activeDevice?.id,
      message: pendingNativePairing ? `Cancelled native pairing for ${pendingNativePairing.name}.` : activeDevice ? `Disconnected from ${activeDevice.name}.` : "No device connected."
    });
    return this.connectionState;
  }
  async attemptReconnect() {
    const activeDevice = this.getActiveDevice();
    if (!shouldAttemptReconnect(activeDevice, this.connectionState, this.reconnectInFlight)) {
      return this.connectionState;
    }
    if (!activeDevice) {
      return this.connectionState;
    }
    this.reconnectInFlight = true;
    try {
      return await this.connectDevice({ id: activeDevice.id });
    } catch (error) {
      this.activeBackend = null;
      this.updateConnectionState({
        status: "error",
        deviceId: activeDevice.id,
        message: error instanceof Error ? error.message : "Reconnect failed."
      });
      return this.connectionState;
    } finally {
      this.reconnectInFlight = false;
    }
  }
  async performHealthCheck() {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      return this.connectionState;
    }
    if (this.activeBackend === "native") {
      if (this.nativeRemoteService.isConnected()) {
        this.updateBackendHealth(activeDevice.id, "native", {
          available: true,
          ready: true,
          lastState: "ready",
          lastError: void 0
        });
        return this.connectionState;
      }
      this.updateBackendHealth(activeDevice.id, "native", {
        available: true,
        ready: false,
        lastState: "error",
        lastError: `Native remote session dropped for ${activeDevice.name}.`
      });
      this.updateConnectionState({
        status: "error",
        backend: "native",
        deviceId: activeDevice.id,
        message: `Native remote session dropped for ${activeDevice.name}. Reconnecting...`
      });
      return this.attemptReconnect();
    }
    if (this.activeBackend === "adb") {
      try {
        const liveState = await this.adbClient.getConnectionState(activeDevice);
        if (liveState.status === "connected") {
          this.updateBackendHealth(activeDevice.id, "adb", {
            available: true,
            ready: true,
            lastState: "ready",
            lastError: void 0
          });
          if (this.connectionState.status !== "connected") {
            this.updateConnectionState({
              status: "connected",
              backend: "adb",
              deviceId: activeDevice.id,
              message: `Connected to ${activeDevice.name} over ADB.`
            });
          }
          return this.connectionState;
        }
        this.updateBackendHealth(activeDevice.id, "adb", {
          available: true,
          ready: false,
          lastState: liveState.status,
          lastError: liveState.message
        });
        this.updateConnectionState({
          ...liveState,
          backend: "adb"
        });
        return this.attemptReconnect();
      } catch (error) {
        this.updateBackendHealth(activeDevice.id, "adb", {
          available: true,
          ready: false,
          lastState: "error",
          lastError: error instanceof Error ? error.message : "Unable to refresh ADB state."
        });
        this.updateConnectionState({
          status: "error",
          backend: "adb",
          deviceId: activeDevice.id,
          message: error instanceof Error ? error.message : "Unable to refresh ADB state."
        });
        return this.connectionState;
      }
    }
    return this.connectionState;
  }
  async withAdbAccess(callback) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before using ADB-backed features.");
    }
    if (!canUseAdb(activeDevice)) {
      throw new Error("This TV is using native remote only. Enable ADB fallback in Setup to unlock typing and installed-app launching.");
    }
    const discovered = await this.getResolvedAdbEndpoint(activeDevice.host);
    const resolvedDevice = discovered ? this.normalizeDevice({
      ...activeDevice,
      connectPort: discovered.connectPort ?? activeDevice.connectPort,
      pairPort: discovered.pairPort ?? activeDevice.pairPort
    }) : activeDevice;
    const initialState = await this.adbClient.getConnectionState(resolvedDevice);
    if (initialState.status === "unauthorized") {
      this.updateBackendHealth(activeDevice.id, "adb", {
        available: true,
        ready: false,
        lastState: "unauthorized",
        lastError: initialState.message
      });
      throw new Error(initialState.message ?? "Authorize this computer in the TV wireless debugging prompt first.");
    }
    if (initialState.status !== "connected") {
      await this.connectAdbWithRecovery(resolvedDevice);
    }
    const state = initialState.status === "connected" ? initialState : await this.adbClient.getConnectionState(resolvedDevice);
    if (state.status !== "connected") {
      this.updateBackendHealth(activeDevice.id, "adb", {
        available: true,
        ready: false,
        lastState: state.status,
        lastError: state.message ?? "ADB fallback is not ready for this TV yet."
      });
      throw new Error("ADB fallback is not ready for this TV yet. Pair or reconnect ADB in Setup first.");
    }
    this.updateBackendHealth(activeDevice.id, "adb", {
      available: true,
      ready: true,
      lastState: "ready",
      lastError: void 0
    });
    return callback(buildSerial(resolvedDevice));
  }
  async connectAdbWithRecovery(device) {
    try {
      await this.adbClient.connect(device.host, device.connectPort);
      return;
    } catch (error) {
      if (shouldRetryAdbAfterServerRestart(error)) {
        const client = this.adbClient;
        if (typeof client.restartServer === "function") {
          await client.restartServer();
          await this.adbClient.connect(device.host, device.connectPort);
          return;
        }
      }
      throw new Error(formatAdbConnectError(device, error));
    }
  }
  async connectViaNative(device) {
    this.updateConnectionState({
      status: "connecting",
      backend: "native",
      deviceId: device.id,
      message: `Connecting to ${device.name} via native remote...`
    });
    this.updateBackendHealth(device.id, "native", {
      available: true,
      ready: false,
      lastState: "connecting",
      lastError: void 0
    });
    const result = await this.nativeRemoteService.connect(device);
    if (result.status === "pairing") {
      this.activeBackend = null;
      this.updateBackendHealth(device.id, "native", {
        available: true,
        ready: false,
        lastState: "pairing",
        lastError: "Waiting for the TV to show and accept a pairing code."
      });
      this.updateConnectionState({
        status: "pairing",
        backend: "native",
        deviceId: device.id,
        message: `Enter the pairing code shown on ${device.name} to finish native remote setup.`
      });
      return this.connectionState;
    }
    return this.finalizeNativeConnection(device, result.certificate);
  }
  async connectViaAdb(device, nativeError) {
    this.nativeRemoteService.disconnect();
    this.updateConnectionState({
      status: "connecting",
      backend: "adb",
      deviceId: device.id,
      message: nativeError ? `${nativeError.message} Falling back to ADB...` : `Connecting to ${device.name} via ADB...`
    });
    this.updateBackendHealth(device.id, "adb", {
      available: true,
      ready: false,
      lastState: "connecting",
      lastError: void 0
    });
    await this.connectAdbWithRecovery(device);
    const nextState = await this.adbClient.getConnectionState(device);
    if (nextState.status !== "connected") {
      this.updateBackendHealth(device.id, "adb", {
        available: true,
        ready: false,
        lastState: nextState.status,
        lastError: nextState.message
      });
      this.updateConnectionState({
        ...nextState,
        backend: "adb"
      });
      return this.connectionState;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const adbHealthBase = createBackendHealthSnapshot(device.backendHealth?.adb);
    const nativeHealthBase = createBackendHealthSnapshot(device.backendHealth?.native);
    const saved = await this.saveDevice({
      id: device.id,
      name: device.name,
      host: device.host,
      connectPort: device.connectPort,
      pairPort: device.pairPort,
      mode: device.mode,
      preferredBackend: device.preferredBackend,
      nativeRemote: device.nativeRemote,
      adbEnabled: device.adbEnabled
    });
    saved.lastConnectedAt = now;
    saved.lastConnectedBackend = "adb";
    saved.backendHealth = {
      ...saved.backendHealth,
      adb: createBackendHealthSnapshot({
        ...adbHealthBase,
        available: true,
        ready: true,
        lastCheckedAt: now,
        lastConnectedAt: now,
        lastError: void 0,
        lastState: "ready"
      }),
      native: createBackendHealthSnapshot({
        ...nativeHealthBase,
        available: hasNativeProfile(saved),
        ready: false,
        lastCheckedAt: now,
        lastState: nativeHealthBase.lastState ?? "disconnected",
        lastConnectedAt: nativeHealthBase.lastConnectedAt,
        lastError: nativeHealthBase.lastError
      })
    };
    this.savedDevices = this.savedDevices.map((item) => item.id === saved.id ? saved : item);
    this.activeDeviceId = saved.id;
    this.activeBackend = "adb";
    this.persist();
    this.emitDevicesChanged();
    this.updateConnectionState({
      status: "connected",
      backend: "adb",
      deviceId: saved.id,
      message: `Connected to ${saved.name} over ADB.`
    });
    return this.connectionState;
  }
  async finalizeNativeConnection(device, certificate) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const adbHealthBase = createBackendHealthSnapshot(device.backendHealth?.adb);
    const nativeHealthBase = createBackendHealthSnapshot(device.backendHealth?.native);
    const saved = await this.saveDevice({
      id: device.id,
      name: device.name,
      host: device.host,
      connectPort: device.connectPort,
      pairPort: device.pairPort,
      mode: device.mode,
      preferredBackend: device.preferredBackend,
      adbEnabled: device.adbEnabled,
      nativeRemote: this.mergeNativeRemote(device.nativeRemote, certificate)
    });
    saved.lastConnectedAt = now;
    saved.lastConnectedBackend = "native";
    saved.backendHealth = {
      ...saved.backendHealth,
      adb: createBackendHealthSnapshot({
        ...adbHealthBase,
        available: canUseAdb(saved),
        ready: adbHealthBase.ready,
        lastCheckedAt: now,
        lastConnectedAt: adbHealthBase.lastConnectedAt,
        lastState: adbHealthBase.lastState,
        lastError: adbHealthBase.lastError
      }),
      native: createBackendHealthSnapshot({
        ...nativeHealthBase,
        available: true,
        ready: true,
        lastCheckedAt: now,
        lastConnectedAt: now,
        lastError: void 0,
        lastState: "ready"
      })
    };
    this.savedDevices = this.savedDevices.map((item) => item.id === saved.id ? saved : item);
    this.activeDeviceId = saved.id;
    this.activeBackend = "native";
    this.persist();
    this.emitDevicesChanged();
    this.updateConnectionState({
      status: "connected",
      backend: "native",
      deviceId: saved.id,
      message: `Connected to ${saved.name} via native remote service.`
    });
    return this.connectionState;
  }
  buildRecommendedActions(device, issues) {
    const actions = [];
    const primaryIssue = issues[0];
    switch (primaryIssue?.code) {
      case "adb_pair_required":
        actions.push("pair_adb");
        break;
      case "adb_unauthorized":
        actions.push("connect_adb");
        break;
      case "adb_connect_failed":
        actions.push(shouldSuggestAdbPairing(device, primaryIssue.detail) ? "pair_adb" : "connect_adb");
        break;
      case "native_pairing_stalled":
        actions.push(canUseAdb(device) ? "switch_to_adb" : "retry_native");
        break;
      case "ready":
        if (this.connectionState.status === "connected") {
          actions.push("open_remote");
          if (canUseAdb(device)) {
            actions.push("open_apps");
          }
        } else if (canUseAdb(device)) {
          actions.push(device.mode === "pair" ? "pair_adb" : "connect_adb");
        }
        break;
    }
    if (actions.length === 0 && primaryIssue?.code === "ready" && this.connectionState.status === "connected") {
      actions.push("open_remote");
    }
    return [...new Set(actions)].slice(0, 2);
  }
  resolveAdbHealth(device, adbAvailable) {
    const saved = createBackendHealthSnapshot(device.backendHealth?.adb);
    if (!adbAvailable) {
      return createBackendHealthSnapshot({
        ...saved,
        available: false,
        ready: false,
        lastState: "missing"
      });
    }
    if (!canUseAdb(device)) {
      return createBackendHealthSnapshot({
        ...saved,
        available: false,
        ready: false,
        lastState: "disabled"
      });
    }
    return createBackendHealthSnapshot({
      ...saved,
      available: true,
      ready: this.activeBackend === "adb" ? this.connectionState.status === "connected" : saved.ready
    });
  }
  resolveNativeHealth(device) {
    const saved = createBackendHealthSnapshot(device.backendHealth?.native);
    if (!hasNativeProfile(device)) {
      return createBackendHealthSnapshot({
        ...saved,
        available: false,
        ready: false,
        lastState: "not_configured"
      });
    }
    return createBackendHealthSnapshot({
      ...saved,
      available: true,
      ready: this.activeBackend === "native" ? this.connectionState.status === "connected" : saved.ready
    });
  }
  mergeNativeRemote(nativeRemote, certificate) {
    if (!nativeRemote) {
      return void 0;
    }
    return {
      ...nativeRemote,
      certificate: certificate ?? nativeRemote.certificate
    };
  }
  normalizeDevice(input) {
    if (!input.host) {
      throw new Error("A host or IP address is required.");
    }
    const adbEnabled = input.adbEnabled ?? true;
    const nativeRemote = input.nativeRemote;
    return {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      host: input.host.trim(),
      connectPort: input.connectPort ?? 5555,
      pairPort: input.pairPort,
      mode: input.mode ?? "connect",
      preferredBackend: input.preferredBackend ?? "adb",
      adbEnabled,
      nativeRemote,
      lastConnectedAt: input.lastConnectedAt,
      lastConnectedBackend: input.lastConnectedBackend,
      cachedApps: input.cachedApps,
      favorites: [...new Set(input.favorites ?? [])],
      recentApps: (input.recentApps ?? []).slice(0, RECENT_APPS_LIMIT),
      preferences: normalizeDevicePreferences(input.preferences, input.favorites),
      backendHealth: {
        adb: createBackendHealthSnapshot({
          ...input.backendHealth?.adb,
          available: adbEnabled
        }),
        native: createBackendHealthSnapshot({
          ...input.backendHealth?.native,
          available: Boolean(nativeRemote)
        })
      }
    };
  }
  async getResolvedAdbEndpoint(host) {
    if (!host) {
      return null;
    }
    try {
      const [match] = await this.discoverAdbEndpoints(host);
      return match ?? null;
    } catch {
      return null;
    }
  }
  async discoverAdbBonjourServices(timeoutMs = 4e3) {
    const bonjour = new Bonjour();
    const found = /* @__PURE__ */ new Map();
    const services = [
      { type: "pairing", bonjourType: "adb-tls-pairing" },
      { type: "connect", bonjourType: "adb-tls-connect" },
      { type: "legacy", bonjourType: "adb" }
    ];
    const browsers = services.map((service) => bonjour.find({ type: service.bonjourType, protocol: "tcp" }));
    services.forEach((service, index) => {
      browsers[index].on("up", (entry) => {
        const host = entry.addresses.find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address));
        if (!host) {
          return;
        }
        found.set(`${service.type}:${entry.name}:${host}:${entry.port}`, {
          name: entry.name,
          host,
          port: entry.port,
          serviceType: service.type
        });
      });
    });
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    for (const browser of browsers) {
      browser.stop();
    }
    bonjour.destroy();
    return [...found.values()];
  }
  findSavedDevice(input) {
    if (input.id) {
      const byId = this.savedDevices.find((item) => item.id === input.id) ?? null;
      if (byId) {
        return {
          device: byId,
          matchedBy: "id"
        };
      }
    }
    const hostKey = normalizeHostKey(input.host);
    if (!hostKey) {
      return {
        device: null,
        matchedBy: null
      };
    }
    const byHost = this.savedDevices.find((item) => normalizeHostKey(item.host) === hostKey) ?? null;
    return {
      device: byHost,
      matchedBy: byHost ? "host" : null
    };
  }
  dedupeSavedDevices(devices, activeDeviceId) {
    const deduped = /* @__PURE__ */ new Map();
    const idRemap = /* @__PURE__ */ new Map();
    for (const device of devices) {
      const hostKey = normalizeHostKey(device.host);
      if (!hostKey) {
        deduped.set(device.id, device);
        continue;
      }
      const existing = deduped.get(hostKey);
      if (!existing) {
        deduped.set(hostKey, device);
        continue;
      }
      const preferred = this.choosePreferredDuplicate(existing, device, activeDeviceId);
      const discarded = preferred.id === existing.id ? device : existing;
      deduped.set(hostKey, preferred);
      idRemap.set(discarded.id, preferred.id);
    }
    return {
      devices: [...deduped.values()],
      activeDeviceId: activeDeviceId ? idRemap.get(activeDeviceId) ?? activeDeviceId : null
    };
  }
  choosePreferredDuplicate(left, right, activeDeviceId) {
    if (left.id === activeDeviceId) {
      return left;
    }
    if (right.id === activeDeviceId) {
      return right;
    }
    const leftTime = left.lastConnectedAt ? new Date(left.lastConnectedAt).getTime() : 0;
    const rightTime = right.lastConnectedAt ? new Date(right.lastConnectedAt).getTime() : 0;
    if (leftTime !== rightTime) {
      return rightTime > leftTime ? right : left;
    }
    const leftScore = Number(Boolean(left.cachedApps)) + Number((left.favorites?.length ?? 0) > 0);
    const rightScore = Number(Boolean(right.cachedApps)) + Number((right.favorites?.length ?? 0) > 0);
    return rightScore > leftScore ? right : left;
  }
  replaceDevice(deviceId, patch, options) {
    const existing = this.savedDevices.find((item) => item.id === deviceId);
    if (!existing) {
      throw new Error("That TV profile no longer exists.");
    }
    const updated = this.normalizeDevice({
      ...existing,
      ...patch
    });
    this.savedDevices = this.savedDevices.map((item) => item.id === deviceId ? updated : item);
    this.persist();
    if (options?.emitDevicesChanged !== false) {
      this.emitDevicesChanged();
    }
    return updated;
  }
  updateBackendHealth(deviceId, backend, patch) {
    const existing = this.savedDevices.find((item) => item.id === deviceId);
    if (!existing) {
      return null;
    }
    const currentSnapshot = backend === "adb" ? createBackendHealthSnapshot(existing.backendHealth?.adb) : createBackendHealthSnapshot(existing.backendHealth?.native);
    const nextSnapshot = createBackendHealthSnapshot({
      ...currentSnapshot,
      ...patch,
      lastCheckedAt: patch.lastCheckedAt ?? (/* @__PURE__ */ new Date()).toISOString()
    });
    return this.replaceDevice(
      deviceId,
      {
        backendHealth: {
          adb: backend === "adb" ? nextSnapshot : createBackendHealthSnapshot(existing.backendHealth?.adb),
          native: backend === "native" ? nextSnapshot : createBackendHealthSnapshot(existing.backendHealth?.native)
        }
      },
      { emitDevicesChanged: false }
    );
  }
  updateConnectionState(nextState) {
    this.connectionState = nextState;
    this.emit("connectionState", nextState);
  }
  emitDevicesChanged() {
    this.emit("devicesChanged", this.listDevices());
  }
  persist() {
    this.store.save({
      savedDevices: this.savedDevices,
      activeDeviceId: this.activeDeviceId
    });
  }
}
const KEYCODES = {
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  select: 23,
  home: 3,
  back: 4,
  menu: 82,
  appSwitch: 187,
  playPause: 85,
  rewind: 89,
  fastForward: 90,
  next: 87,
  previous: 88,
  power: 26,
  sleep: 223,
  volumeUp: 24,
  volumeDown: 25,
  mute: 164,
  enter: 66,
  delete: 67
};
const COMMAND_LABELS = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  select: "OK",
  home: "Home",
  back: "Back",
  menu: "Menu",
  appSwitch: "Recent Apps",
  playPause: "Play/Pause",
  rewind: "Rewind",
  fastForward: "Fast Forward",
  next: "Next",
  previous: "Previous",
  power: "Power",
  sleep: "Sleep",
  volumeUp: "Volume Up",
  volumeDown: "Volume Down",
  mute: "Mute",
  enter: "Enter",
  delete: "Delete"
};
const COMMAND_COOLDOWNS_MS = {
  power: 5e3,
  sleep: 4e3
};
class RemoteController {
  constructor(deviceManager2, adbClient, nativeRemoteService) {
    this.deviceManager = deviceManager2;
    this.adbClient = adbClient;
    this.nativeRemoteService = nativeRemoteService;
  }
  cooldowns = /* @__PURE__ */ new Map();
  async sendCommand(command) {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before using the remote.");
    }
    const blockedFeedback = this.getBlockedFeedback(command);
    if (blockedFeedback) {
      return blockedFeedback;
    }
    if (this.deviceManager.getActiveBackend() === "native") {
      this.nativeRemoteService.sendKey(KEYCODES[command]);
    } else {
      await this.deviceManager.withAdbAccess((serial) => this.adbClient.sendKey(serial, KEYCODES[command]));
    }
    const cooldownMs = COMMAND_COOLDOWNS_MS[command];
    if (cooldownMs) {
      this.cooldowns.set(command, Date.now() + cooldownMs);
    }
    return this.createFeedback({
      status: "sent",
      kind: "remote",
      title: `${COMMAND_LABELS[command]} signal sent`,
      detail: cooldownMs ? `The ${COMMAND_LABELS[command].toLowerCase()} key was sent. Waiting a few seconds before allowing another press.` : `The ${COMMAND_LABELS[command].toLowerCase()} key was sent to the connected TV.`,
      command,
      cooldownMs
    });
  }
  async sendText(text) {
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.sendText(serial, text));
    return this.createFeedback({
      status: "success",
      kind: "text",
      title: "Text sent",
      detail: "The text input request was delivered to the connected TV."
    });
  }
  getBlockedFeedback(command) {
    const cooldownUntil = this.cooldowns.get(command);
    if (!cooldownUntil || cooldownUntil <= Date.now()) {
      return null;
    }
    return this.createFeedback({
      status: "blocked",
      kind: "remote",
      title: `${COMMAND_LABELS[command]} cooling down`,
      detail: `Wait a moment before sending ${COMMAND_LABELS[command].toLowerCase()} again so we do not spam the TV.`,
      command,
      cooldownMs: cooldownUntil - Date.now()
    });
  }
  createFeedback(input) {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...input
    };
  }
}
const FOREGROUND_CACHE_TTL_MS = 2e4;
class AppController {
  constructor(deviceManager2, adbClient) {
    this.deviceManager = deviceManager2;
    this.adbClient = adbClient;
  }
  /**
   * Last value the desktop poll saw. Clients that must not create their own ADB
   * traffic (the phone remote) read this instead of asking the TV again.
   */
  lastForegroundApp = null;
  async listApps(forceRefresh = false) {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before browsing installed apps.");
    }
    if (!forceRefresh && activeDevice.cachedApps) {
      return activeDevice.cachedApps.apps;
    }
    const apps = await this.deviceManager.withAdbAccess((serial) => this.adbClient.listLaunchableApps(serial));
    const updated = await this.deviceManager.updateDeviceAppsCache(activeDevice.id, apps);
    return updated.cachedApps?.apps ?? apps;
  }
  async launchApp(app2) {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before launching an app.");
    }
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.launchApp(serial, app2));
    await this.deviceManager.recordAppLaunch(app2.packageName);
    return this.createFeedback({
      status: "sent",
      kind: "app",
      title: `Launch requested for ${app2.displayName}`,
      detail: "The app launch intent was sent to the TV.",
      appPackage: app2.packageName
    });
  }
  async toggleFavorite(packageName) {
    return this.deviceManager.toggleFavoriteApp(packageName);
  }
  async getForegroundApp() {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      this.lastForegroundApp = null;
      return null;
    }
    const app2 = await this.deviceManager.withAdbAccess(
      (serial) => this.adbClient.getForegroundApp(serial)
    );
    this.lastForegroundApp = { app: app2, at: Date.now() };
    return app2;
  }
  /** Goes stale rather than lying: past the TTL this reports nothing. */
  getCachedForegroundApp() {
    if (!this.lastForegroundApp || !this.deviceManager.getActiveDevice()) {
      return null;
    }
    if (Date.now() - this.lastForegroundApp.at > FOREGROUND_CACHE_TTL_MS) {
      return null;
    }
    return this.lastForegroundApp.app;
  }
  async launchPackage(packageName) {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before launching an app.");
    }
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.launchPackage(serial, packageName));
    await this.deviceManager.recordAppLaunch(packageName);
    return this.createFeedback({
      status: "sent",
      kind: "app",
      title: "Launch requested",
      detail: `The app launch intent for ${packageName} was sent to the TV.`,
      appPackage: packageName
    });
  }
  async openAppInfo(packageName) {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before opening app details.");
    }
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.openAppInfo(serial, packageName));
    return this.createFeedback({
      status: "sent",
      kind: "quick_action",
      title: "App info opened",
      detail: `Android app details were opened for ${packageName}.`,
      appPackage: packageName
    });
  }
  createFeedback(input) {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...input
    };
  }
}
const REMOTE_QUICK_ACTIONS = [
  {
    id: "remote:home",
    label: "Home",
    detail: "Jump back to the TV home screen.",
    command: "home"
  },
  {
    id: "remote:mute",
    label: "Mute",
    detail: "Toggle mute without leaving the current screen.",
    command: "mute"
  },
  {
    id: "remote:playPause",
    label: "Play/Pause",
    detail: "Control media playback quickly.",
    command: "playPause"
  }
];
function buildLaunchActions(device, health) {
  const adbReady = Boolean(health?.adb.available);
  return (device.favorites ?? []).slice(0, 3).map((packageName) => ({
    id: `launch:${packageName}`,
    label: packageName.split(".").at(-1)?.replace(/[-_]/g, " ") ?? packageName,
    detail: adbReady ? "Launch this pinned app." : "ADB is required for app launch shortcuts.",
    kind: "app",
    disabled: !adbReady
  }));
}
class ActionController {
  constructor(deviceManager2, remoteController, appController) {
    this.deviceManager = deviceManager2;
    this.remoteController = remoteController;
    this.appController = appController;
  }
  listQuickActions(health, foregroundApp) {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice || this.deviceManager.getConnectionState().status !== "connected") {
      return [];
    }
    const actions = REMOTE_QUICK_ACTIONS.map((action) => ({
      id: action.id,
      label: action.label,
      detail: action.detail,
      kind: "remote"
    }));
    if (foregroundApp) {
      actions.unshift({
        id: `app-info:${foregroundApp.packageName}`,
        label: "Open App Info",
        detail: `Open Android settings for ${foregroundApp.displayName}.`,
        kind: "app",
        disabled: !health?.adb.available
      });
      actions.unshift({
        id: `favorite:${foregroundApp.packageName}`,
        label: "Pin Current App",
        detail: `Add ${foregroundApp.displayName} to this TV's favorites.`,
        kind: "app",
        disabled: !health?.adb.available
      });
      actions.unshift({
        id: `launch:${foregroundApp.packageName}`,
        label: "Relaunch Current App",
        detail: `Launch ${foregroundApp.displayName} again through ADB.`,
        kind: "app",
        disabled: !health?.adb.available
      });
    }
    actions.push(...buildLaunchActions(activeDevice, health));
    return actions.slice(0, 6);
  }
  async runQuickAction(id) {
    const [kind, ...rest] = id.split(":");
    const value = rest.join(":");
    if (kind === "remote") {
      return this.remoteController.sendCommand(value);
    }
    if (kind === "launch") {
      return this.appController.launchPackage(value);
    }
    if (kind === "app-info") {
      return this.appController.openAppInfo(value);
    }
    if (kind === "favorite") {
      const device = await this.deviceManager.toggleFavoriteApp(value);
      const isFavorite = device.favorites?.includes(value) ?? false;
      return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        status: "success",
        kind: "favorite",
        title: isFavorite ? "Pinned current app" : "Removed current app pin",
        detail: isFavorite ? "The current app was added to this TV's favorites." : "The current app was removed from this TV's favorites.",
        appPackage: value,
        actionId: id
      };
    }
    throw new Error("Unknown quick action.");
  }
}
const CLIENT_NAME = "Android TV Remote Desktop";
const DISCOVERY_TIMEOUT_MS = 4e3;
const CONNECT_TIMEOUT_MS = 1e4;
const PAIRING_CONFIRM_TIMEOUT_MS = 15e3;
const DISCOVERY_SERVICE_TYPES = ["androidtvremote2", "androidtvremote"];
class NativeRemoteService extends EventEmitter {
  activeClient = null;
  pendingClient = null;
  activeConnected = false;
  pendingDevice = null;
  async discoverDevices(timeoutMs = DISCOVERY_TIMEOUT_MS) {
    const bonjour = new Bonjour();
    const found = /* @__PURE__ */ new Map();
    const browsers = DISCOVERY_SERVICE_TYPES.map((type) => bonjour.find({ type, protocol: "tcp" }));
    const onServiceUp = (service) => {
      const host = service.addresses.find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address));
      if (!host) {
        return;
      }
      const key = `${service.type}:${service.name}:${host}:${service.port}`;
      found.set(key, {
        name: service.name,
        host,
        remotePort: service.port,
        pairingPort: service.port + 1,
        serviceLabel: service.name
      });
    };
    for (const browser of browsers) {
      browser.on("up", onServiceUp);
    }
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    for (const browser of browsers) {
      browser.stop();
    }
    bonjour.destroy();
    return [...found.values()].reduce((devices, current) => {
      if (devices.some((device) => device.host === current.host && device.remotePort === current.remotePort)) {
        return devices;
      }
      devices.push(current);
      return devices;
    }, []).sort((left, right) => left.name.localeCompare(right.name));
  }
  async connect(device) {
    if (!device.nativeRemote) {
      throw new Error("This TV does not have a native remote profile saved yet.");
    }
    this.disconnect();
    const client = new AndroidRemote(device.host, {
      pairing_port: device.nativeRemote.pairingPort,
      remote_port: device.nativeRemote.remotePort,
      name: CLIENT_NAME,
      cert: device.nativeRemote.certificate ?? {}
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        onError(
          new Error("Timed out waiting for native remote. If the TV never shows a code, cancel this and use ADB instead.")
        );
      }, CONNECT_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timeout);
        client.removeListener("ready", onReady);
        client.removeListener("secret", onSecret);
        client.removeListener("error", onError);
        client.removeListener("unpaired", onUnpaired);
      };
      const finish = (fn) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        fn();
      };
      const onReady = () => {
        finish(() => {
          this.activeClient = client;
          this.activeConnected = true;
          this.pendingClient = null;
          this.pendingDevice = null;
          this.attachActiveLifecycle(client);
          resolve({
            status: "connected",
            certificate: client.getCertificate()
          });
        });
      };
      const onSecret = () => {
        finish(() => {
          this.pendingClient = client;
          this.pendingDevice = {
            id: device.id,
            name: device.name,
            host: device.host
          };
          resolve({
            status: "pairing"
          });
        });
      };
      const onError = (error) => {
        finish(() => {
          this.destroyClient(client);
          reject(this.normalizeError(error, "Native remote connection failed."));
        });
      };
      const onUnpaired = () => {
        finish(() => {
          this.destroyClient(client);
          reject(new Error("Saved native remote pairing is no longer valid. Pair again."));
        });
      };
      client.once("ready", onReady);
      client.once("secret", onSecret);
      client.once("error", onError);
      client.once("unpaired", onUnpaired);
      void client.start().then((started) => {
        if (started === false) {
          onError(new Error("Native remote session did not start."));
        }
      }).catch(onError);
    });
  }
  async completePairing(code) {
    const client = this.pendingClient;
    if (!client || !this.pendingDevice) {
      throw new Error("There is no native pairing session waiting for a code.");
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        onError(new Error("Timed out waiting for the TV to accept the native pairing code."));
      }, PAIRING_CONFIRM_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timeout);
        client.removeListener("ready", onReady);
        client.removeListener("error", onError);
        client.removeListener("unpaired", onUnpaired);
      };
      const onReady = () => {
        cleanup();
        this.pendingClient = null;
        this.pendingDevice = null;
        this.activeClient = client;
        this.activeConnected = true;
        this.attachActiveLifecycle(client);
        resolve(client.getCertificate());
      };
      const onError = (error) => {
        cleanup();
        this.destroyClient(client);
        this.pendingClient = null;
        this.pendingDevice = null;
        reject(this.normalizeError(error, "Native pairing failed."));
      };
      const onUnpaired = () => {
        cleanup();
        this.destroyClient(client);
        this.pendingClient = null;
        this.pendingDevice = null;
        reject(new Error("Native pairing was rejected by the TV."));
      };
      client.once("ready", onReady);
      client.once("error", onError);
      client.once("unpaired", onUnpaired);
      const accepted = client.sendCode(code.trim().replace(/\s+/g, "").toUpperCase());
      if (!accepted) {
        onError(new Error("The pairing code did not match the TV prompt."));
      }
    });
  }
  getPendingPairing() {
    return this.pendingDevice;
  }
  isConnected() {
    return this.activeConnected && this.activeClient !== null;
  }
  sendKey(keyCode) {
    if (!this.activeClient || !this.activeConnected) {
      throw new Error("Native remote is not connected yet.");
    }
    this.activeClient.sendKey(keyCode, RemoteDirection.SHORT);
  }
  sendAppLink(appLink) {
    if (!this.activeClient || !this.activeConnected) {
      throw new Error("Native remote is not connected yet.");
    }
    this.activeClient.sendAppLink(appLink);
  }
  disconnect() {
    this.activeConnected = false;
    if (this.activeClient) {
      this.destroyClient(this.activeClient);
      this.activeClient = null;
    }
    if (this.pendingClient) {
      this.destroyClient(this.pendingClient);
      this.pendingClient = null;
    }
    this.pendingDevice = null;
  }
  attachActiveLifecycle(client) {
    client.removeAllListeners("unpaired");
    client.on("unpaired", () => {
      this.activeConnected = false;
      this.activeClient = null;
      this.emit("unpaired", "Native remote pairing was cleared by the TV. Pair it again.");
    });
    client.on("error", () => {
      this.activeConnected = false;
    });
  }
  destroyClient(client) {
    client.stop?.();
    client.remoteManager?.client?.destroy();
    client.pairingManager?.client?.destroy();
  }
  normalizeError(error, fallbackMessage) {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === "string" && error.trim()) {
      return new Error(error);
    }
    return new Error(fallbackMessage);
  }
}
const execFileAsync = promisify(execFile);
const STATUS_CACHE_MS = 3e4;
const LAUNCH_GRACE_MS = 650;
function installHint() {
  if (app.isPackaged) {
    return "The bundled scrcpy component is missing or damaged. Reinstall the latest Relay release.";
  }
  return process.platform === "darwin" ? "Run `npm run prepare:scrcpy`, or install scrcpy with Homebrew." : process.platform === "win32" ? "Run `npm run prepare:scrcpy`, or install scrcpy with WinGet." : "Install scrcpy from your package manager, then make sure it is on PATH.";
}
function createFeedback$1(input) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...input
  };
}
function candidatePaths() {
  const executableName = process.platform === "win32" ? "scrcpy.exe" : "scrcpy";
  const candidates = [
    path.join(process.resourcesPath, "scrcpy", executableName),
    path.join(app.getAppPath(), "vendor", "scrcpy", executableName),
    executableName
  ];
  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/scrcpy", "/usr/local/bin/scrcpy");
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      candidates.push(path.join(localAppData, "Microsoft", "WinGet", "Links", "scrcpy.exe"));
    }
    candidates.push(
      "C:\\Program Files\\scrcpy\\scrcpy.exe",
      "C:\\Program Files (x86)\\scrcpy\\scrcpy.exe"
    );
  }
  return [...new Set(candidates)];
}
function parseVersion(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).find((line) => line.toLowerCase().startsWith("scrcpy")) ?? "scrcpy detected";
}
class ScrcpyController {
  constructor(deviceManager2, adbLocator) {
    this.deviceManager = deviceManager2;
    this.adbLocator = adbLocator;
  }
  cachedStatus = null;
  cachedStatusAt = 0;
  async getStatus(forceRefresh = false) {
    if (this.cachedStatus && !forceRefresh && Date.now() - this.cachedStatusAt < STATUS_CACHE_MS) {
      return this.cachedStatus;
    }
    for (const candidate of candidatePaths()) {
      try {
        const { stdout, stderr } = await execFileAsync(candidate, ["--version"], {
          cwd: path.dirname(candidate),
          timeout: 6e3,
          maxBuffer: 512 * 1024
        });
        this.cachedStatus = {
          available: true,
          path: candidate,
          version: parseVersion(`${stdout}
${stderr}`),
          installHint: installHint()
        };
        this.cachedStatusAt = Date.now();
        return this.cachedStatus;
      } catch {
      }
    }
    this.cachedStatus = {
      available: false,
      installHint: installHint()
    };
    this.cachedStatusAt = Date.now();
    return this.cachedStatus;
  }
  async launch(preset) {
    const status = await this.getStatus(true);
    if (!status.available || !status.path) {
      return createFeedback$1({
        status: "blocked",
        kind: "scrcpy",
        title: "scrcpy is not installed",
        detail: status.installHint
      });
    }
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before opening scrcpy.");
    }
    const adbInfo = await this.adbLocator.locate();
    if (!adbInfo.available || !adbInfo.path) {
      return createFeedback$1({
        status: "blocked",
        kind: "scrcpy",
        title: "ADB is not available",
        detail: adbInfo.installHint
      });
    }
    const args = await this.deviceManager.withAdbAccess(async (serial) => [
      "-s",
      serial,
      ...this.getPresetArgs(preset)
    ]);
    const child = spawn(status.path, args, {
      cwd: path.dirname(status.path),
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        // scrcpy officially supports ADB as an explicit binary override. This
        // avoids relying on PATH when Relay is opened from Finder/Start Menu.
        ADB: adbInfo.path
      },
      windowsHide: false
    });
    await new Promise((resolve, reject) => {
      let launched = false;
      const launchTimer = setTimeout(() => {
        launched = true;
        child.removeListener("error", onError);
        child.removeListener("exit", onExit);
        child.unref();
        resolve();
      }, LAUNCH_GRACE_MS);
      const onError = (error) => {
        clearTimeout(launchTimer);
        reject(error);
      };
      const onExit = (code, signal) => {
        if (launched) {
          return;
        }
        clearTimeout(launchTimer);
        reject(
          new Error(
            `scrcpy exited before opening${code === null ? "" : ` (code ${code})`}${signal ? ` (${signal})` : ""}.`
          )
        );
      };
      child.once("error", onError);
      child.once("exit", onExit);
    });
    return createFeedback$1({
      status: "sent",
      kind: "scrcpy",
      title: "scrcpy launched",
      detail: preset === "record" ? "scrcpy opened in recording mode with Relay’s packaged ADB runtime." : "scrcpy opened as a companion mirror with Relay’s packaged ADB runtime."
    });
  }
  getPresetArgs(preset) {
    if (preset === "fast") {
      return ["--max-size", "1280", "--max-fps", "30", "--no-audio"];
    }
    if (preset === "high_quality") {
      return ["--max-size", "1920", "--max-fps", "60"];
    }
    if (preset === "no_audio") {
      return ["--no-audio"];
    }
    const videosPath = app.getPath("videos") || app.getPath("desktop");
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    return ["--record", path.join(videosPath, `android-tv-${timestamp}.mkv`)];
  }
}
function createFeedback(input) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...input
  };
}
class SideloadController {
  constructor(deviceManager2, adbClient) {
    this.deviceManager = deviceManager2;
    this.adbClient = adbClient;
  }
  selections = /* @__PURE__ */ new Map();
  async chooseApk(parentWindow) {
    const options = {
      title: "Choose APK to install",
      properties: ["openFile"],
      filters: [{ name: "Android APK", extensions: ["apk"] }]
    };
    const result = parentWindow ? await dialog.showOpenDialog(parentWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const apkPath = result.filePaths[0];
    this.assertApkPath(apkPath);
    const stat = await fs.stat(apkPath);
    if (!stat.isFile()) {
      throw new Error("Choose a valid APK file.");
    }
    const id = randomUUID();
    this.selections.set(id, apkPath);
    return {
      id,
      name: path.basename(apkPath),
      size: stat.size
    };
  }
  async installApk(selectionId) {
    const apkPath = this.selections.get(selectionId);
    if (!apkPath) {
      throw new Error("Choose an APK before installing.");
    }
    this.assertApkPath(apkPath);
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.installApk(serial, apkPath));
    this.selections.delete(selectionId);
    return createFeedback({
      status: "success",
      kind: "sideload",
      title: "APK installed",
      detail: `${path.basename(apkPath)} was installed on the selected TV through ADB.`
    });
  }
  assertApkPath(apkPath) {
    if (path.extname(apkPath).toLowerCase() !== ".apk") {
      throw new Error("Only .apk files can be installed.");
    }
  }
}
const DEFAULT_WEB_REMOTE_PORT = 8479;
function createWebRemoteToken() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "";
  for (let index = 0; index < 12; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}
class ElectronSettingsStore {
  store = new Store({
    name: "settings",
    defaults: {
      webRemote: {
        enabled: false,
        port: DEFAULT_WEB_REMOTE_PORT,
        token: createWebRemoteToken()
      }
    }
  });
  getWebRemote() {
    const stored = this.store.get("webRemote");
    return {
      enabled: Boolean(stored?.enabled),
      port: Number(stored?.port) || DEFAULT_WEB_REMOTE_PORT,
      token: stored?.token || createWebRemoteToken()
    };
  }
  setWebRemote(settings) {
    this.store.set("webRemote", settings);
  }
}
const EC_LEVEL_M_BITS = 0;
const FORMAT_MASK = 21522;
const ALIGNMENT_CENTERS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
];
const BLOCK_LAYOUT = {
  1: { ecCodewordsPerBlock: 10, groups: [{ blocks: 1, dataCodewords: 16 }] },
  2: { ecCodewordsPerBlock: 16, groups: [{ blocks: 1, dataCodewords: 28 }] },
  3: { ecCodewordsPerBlock: 26, groups: [{ blocks: 1, dataCodewords: 44 }] },
  4: { ecCodewordsPerBlock: 18, groups: [{ blocks: 2, dataCodewords: 32 }] },
  5: { ecCodewordsPerBlock: 24, groups: [{ blocks: 2, dataCodewords: 43 }] },
  6: { ecCodewordsPerBlock: 16, groups: [{ blocks: 4, dataCodewords: 27 }] },
  7: { ecCodewordsPerBlock: 18, groups: [{ blocks: 4, dataCodewords: 31 }] },
  8: {
    ecCodewordsPerBlock: 22,
    groups: [
      { blocks: 2, dataCodewords: 38 },
      { blocks: 2, dataCodewords: 39 }
    ]
  },
  9: {
    ecCodewordsPerBlock: 22,
    groups: [
      { blocks: 3, dataCodewords: 36 },
      { blocks: 2, dataCodewords: 37 }
    ]
  },
  10: {
    ecCodewordsPerBlock: 26,
    groups: [
      { blocks: 4, dataCodewords: 43 },
      { blocks: 1, dataCodewords: 44 }
    ]
  }
};
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
for (let index = 0, value = 1; index < 255; index += 1) {
  EXP_TABLE[index] = value;
  LOG_TABLE[value] = index;
  value <<= 1;
  if (value & 256) {
    value ^= 285;
  }
}
function galoisMultiply(left, right) {
  if (left === 0 || right === 0) {
    return 0;
  }
  return EXP_TABLE[(LOG_TABLE[left] + LOG_TABLE[right]) % 255];
}
function buildGeneratorPolynomial(degree) {
  let polynomial = [1];
  for (let index = 0; index < degree; index += 1) {
    const next = new Array(polynomial.length + 1).fill(0);
    for (let position = 0; position < polynomial.length; position += 1) {
      next[position] ^= polynomial[position];
      next[position + 1] ^= galoisMultiply(polynomial[position], EXP_TABLE[index]);
    }
    polynomial = next;
  }
  return polynomial;
}
function computeErrorCorrection(data, ecCodewords) {
  const generator = buildGeneratorPolynomial(ecCodewords);
  const remainder = new Array(ecCodewords).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let index = 0; index < ecCodewords; index += 1) {
        remainder[index] ^= galoisMultiply(generator[index + 1], factor);
      }
    }
  }
  return remainder;
}
function totalDataCodewords(version) {
  return BLOCK_LAYOUT[version].groups.reduce(
    (total, group) => total + group.blocks * group.dataCodewords,
    0
  );
}
function characterCountBits(version) {
  return version < 10 ? 8 : 16;
}
function chooseVersion(byteLength) {
  for (let version = 1; version <= 10; version += 1) {
    const capacityBits = totalDataCodewords(version) * 8;
    const requiredBits = 4 + characterCountBits(version) + byteLength * 8;
    if (requiredBits <= capacityBits) {
      return version;
    }
  }
  throw new Error("Payload is too long for a version 10 QR code.");
}
function buildCodewords(bytes, version) {
  const capacity = totalDataCodewords(version);
  const bits = [];
  const pushBits = (value, length) => {
    for (let index = length - 1; index >= 0; index -= 1) {
      bits.push(value >> index & 1);
    }
  };
  pushBits(4, 4);
  pushBits(bytes.length, characterCountBits(version));
  for (const byte of bytes) {
    pushBits(byte, 8);
  }
  const capacityBits = capacity * 8;
  pushBits(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      byte = byte << 1 | bits[index + offset];
    }
    codewords.push(byte);
  }
  const padBytes = [236, 17];
  let padIndex = 0;
  while (codewords.length < capacity) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }
  return codewords;
}
function interleave(codewords, version) {
  const layout = BLOCK_LAYOUT[version];
  const dataBlocks = [];
  const ecBlocks = [];
  let cursor = 0;
  for (const group of layout.groups) {
    for (let index = 0; index < group.blocks; index += 1) {
      const block = codewords.slice(cursor, cursor + group.dataCodewords);
      cursor += group.dataCodewords;
      dataBlocks.push(block);
      ecBlocks.push(computeErrorCorrection(block, layout.ecCodewordsPerBlock));
    }
  }
  const result = [];
  const longestData = Math.max(...dataBlocks.map((block) => block.length));
  for (let index = 0; index < longestData; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) {
        result.push(block[index]);
      }
    }
  }
  for (let index = 0; index < layout.ecCodewordsPerBlock; index += 1) {
    for (const block of ecBlocks) {
      result.push(block[index]);
    }
  }
  return result;
}
function createGrid(size) {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}
function placeFinder(grid, row, column) {
  for (let deltaRow = -1; deltaRow <= 7; deltaRow += 1) {
    for (let deltaColumn = -1; deltaColumn <= 7; deltaColumn += 1) {
      const targetRow = row + deltaRow;
      const targetColumn = column + deltaColumn;
      if (targetRow < 0 || targetRow >= grid.length || targetColumn < 0 || targetColumn >= grid.length) {
        continue;
      }
      const inRing = deltaRow >= 0 && deltaRow <= 6 && (deltaColumn === 0 || deltaColumn === 6) || deltaColumn >= 0 && deltaColumn <= 6 && (deltaRow === 0 || deltaRow === 6);
      const inCore = deltaRow >= 2 && deltaRow <= 4 && deltaColumn >= 2 && deltaColumn <= 4;
      grid[targetRow][targetColumn] = inRing || inCore ? 1 : 0;
    }
  }
}
function placeAlignment(grid, version) {
  const centers = ALIGNMENT_CENTERS[version];
  for (const row of centers) {
    for (const column of centers) {
      if (grid[row][column] !== null) {
        continue;
      }
      for (let deltaRow = -2; deltaRow <= 2; deltaRow += 1) {
        for (let deltaColumn = -2; deltaColumn <= 2; deltaColumn += 1) {
          const isDark = Math.max(Math.abs(deltaRow), Math.abs(deltaColumn)) !== 1;
          grid[row + deltaRow][column + deltaColumn] = isDark ? 1 : 0;
        }
      }
    }
  }
}
function placeTimingAndReserved(grid, version) {
  const size = grid.length;
  for (let index = 8; index < size - 8; index += 1) {
    const value = index % 2 === 0 ? 1 : 0;
    grid[6][index] = value;
    grid[index][6] = value;
  }
  grid[size - 8][8] = 1;
  for (let index = 0; index <= 8; index += 1) {
    if (grid[8][index] === null) {
      grid[8][index] = 0;
    }
    if (grid[index][8] === null) {
      grid[index][8] = 0;
    }
  }
  for (let index = 0; index < 8; index += 1) {
    if (grid[size - 1 - index][8] === null) {
      grid[size - 1 - index][8] = 0;
    }
    if (grid[8][size - 1 - index] === null) {
      grid[8][size - 1 - index] = 0;
    }
  }
  if (version >= 7) {
    for (let index = 0; index < 18; index += 1) {
      const row = Math.floor(index / 3);
      const column = index % 3;
      grid[row][size - 11 + column] = 0;
      grid[size - 11 + column][row] = 0;
    }
  }
}
function placeData(grid, codewords) {
  const size = grid.length;
  const placed = [];
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (grid[row][column] !== null) {
          continue;
        }
        const byte = codewords[bitIndex >> 3] ?? 0;
        const bit = byte >> 7 - (bitIndex & 7) & 1;
        bitIndex += 1;
        grid[row][column] = bit;
        placed.push({ row, column, bit });
      }
    }
    upward = !upward;
  }
  return placed;
}
const MASK_PREDICATES = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => row * column % 2 + row * column % 3 === 0,
  (row, column) => (row * column % 2 + row * column % 3) % 2 === 0,
  (row, column) => ((row + column) % 2 + row * column % 3) % 2 === 0
];
function computeFormatBits(mask) {
  const data = EC_LEVEL_M_BITS << 3 | mask;
  let remainder = data << 10;
  for (let index = 14; index >= 10; index -= 1) {
    if (remainder >> index & 1) {
      remainder ^= 1335 << index - 10;
    }
  }
  return (data << 10 | remainder) ^ FORMAT_MASK;
}
function computeVersionBits(version) {
  let remainder = version << 12;
  for (let index = 17; index >= 12; index -= 1) {
    if (remainder >> index & 1) {
      remainder ^= 7973 << index - 12;
    }
  }
  return version << 12 | remainder;
}
function applyFormatInformation(matrix, mask) {
  const size = matrix.length;
  const bits = computeFormatBits(mask);
  for (let index = 0; index < 15; index += 1) {
    const bit = bits >> index & 1;
    if (index < 6) {
      matrix[index][8] = bit;
    } else if (index === 6) {
      matrix[7][8] = bit;
    } else if (index === 7) {
      matrix[8][8] = bit;
    } else if (index === 8) {
      matrix[8][7] = bit;
    } else {
      matrix[8][14 - index] = bit;
    }
    if (index < 8) {
      matrix[8][size - 1 - index] = bit;
    } else {
      matrix[size - 15 + index][8] = bit;
    }
  }
  matrix[size - 8][8] = 1;
}
function applyVersionInformation(matrix, version) {
  if (version < 7) {
    return;
  }
  const size = matrix.length;
  const bits = computeVersionBits(version);
  for (let index = 0; index < 18; index += 1) {
    const bit = bits >> index & 1;
    const row = Math.floor(index / 3);
    const column = index % 3;
    matrix[row][size - 11 + column] = bit;
    matrix[size - 11 + column][row] = bit;
  }
}
function scorePenalty(matrix) {
  const size = matrix.length;
  let penalty = 0;
  const scoreLine = (getModule) => {
    for (let primary = 0; primary < size; primary += 1) {
      let runValue = getModule(primary, 0);
      let runLength = 1;
      for (let secondary = 1; secondary < size; secondary += 1) {
        const value = getModule(primary, secondary);
        if (value === runValue) {
          runLength += 1;
          continue;
        }
        if (runLength >= 5) {
          penalty += runLength - 2;
        }
        runValue = value;
        runLength = 1;
      }
      if (runLength >= 5) {
        penalty += runLength - 2;
      }
    }
  };
  scoreLine((row, column) => matrix[row][column]);
  scoreLine((column, row) => matrix[row][column]);
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const value = matrix[row][column];
      if (value === matrix[row][column + 1] && value === matrix[row + 1][column] && value === matrix[row + 1][column + 1]) {
        penalty += 3;
      }
    }
  }
  const patterns = [
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  ];
  const matchesPattern = (values, start, pattern) => pattern.every((bit, offset) => values[start + offset] === bit);
  for (let index = 0; index < size; index += 1) {
    const rowValues = matrix[index];
    const columnValues = matrix.map((row) => row[index]);
    for (let start = 0; start + 11 <= size; start += 1) {
      for (const pattern of patterns) {
        if (matchesPattern(rowValues, start, pattern)) {
          penalty += 40;
        }
        if (matchesPattern(columnValues, start, pattern)) {
          penalty += 40;
        }
      }
    }
  }
  const darkModules = matrix.reduce(
    (total, row) => total + row.reduce((rowTotal, value) => rowTotal + value, 0),
    0
  );
  const darkRatio = darkModules * 100 / (size * size);
  penalty += Math.floor(Math.abs(darkRatio - 50) / 5) * 10;
  return penalty;
}
function encodeQrCode(text) {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = interleave(buildCodewords(bytes, version), version);
  const layout = createGrid(size);
  placeFinder(layout, 0, 0);
  placeFinder(layout, 0, size - 7);
  placeFinder(layout, size - 7, 0);
  placeAlignment(layout, version);
  placeTimingAndReserved(layout, version);
  const dataCells = placeData(layout, codewords);
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = layout.map((row) => row.map((value) => value ?? 0));
    for (const cell of dataCells) {
      matrix[cell.row][cell.column] = MASK_PREDICATES[mask](cell.row, cell.column) ? cell.bit ^ 1 : cell.bit;
    }
    applyFormatInformation(matrix, mask);
    applyVersionInformation(matrix, version);
    const penalty = scorePenalty(matrix);
    if (!best || penalty < best.penalty) {
      best = { matrix, penalty };
    }
  }
  return {
    size,
    version,
    modules: best.matrix.map((row) => row.map((value) => value === 1))
  };
}
function renderQrCodeSvg(text, options) {
  const { size, modules } = encodeQrCode(text);
  const margin = 2;
  const total = size + margin * 2;
  const path2 = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (modules[row][column]) {
        path2.push(`M${column + margin} ${row + margin}h1v1h-1z`);
      }
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${path2.join("")}" fill="#000000"/>`,
    "</svg>"
  ].join("");
}
const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
    />
    <meta name="theme-color" content="#100e0e" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Relay" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Relay Remote</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon.svg" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <!-- Two soft lights, warm and cool, so the screen has depth without an edge. -->
    <div class="wash" aria-hidden="true"></div>

    <!-- Shown until the access code is accepted. -->
    <section id="gate" class="gate" hidden>
      <div class="gate-card">
        <div class="brand-mark" aria-hidden="true"><span></span></div>
        <h1>Relay</h1>
        <p>Enter the access code from the desktop app's <strong>Phone</strong> tab.</p>
        <form id="gate-form" autocomplete="off">
          <input
            id="gate-input"
            inputmode="latin"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="ACCESS CODE"
            aria-label="Access code"
          />
          <button class="primary" type="submit">Unlock</button>
        </form>
        <p id="gate-error" class="gate-error" role="alert"></p>
      </div>
    </section>

    <div id="app" class="app" hidden>
      <header class="topbar">
        <div id="now-art" class="now-art is-idle" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8" /></svg>
        </div>
        <div class="now-copy">
          <strong id="now-title">No TV connected</strong>
          <small id="now-detail"><span id="status-dot" class="dot"></span><span id="now-detail-text">Waiting for the desktop app</span></small>
        </div>
        <button id="power" class="icon-button danger" type="button" aria-label="Power">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v9" />
            <path d="M6.5 7a8 8 0 1 0 11 0" />
          </svg>
        </button>
      </header>

      <main class="panes">
        <section id="pane-remote" class="pane is-active">
          <div class="pad-stage">
            <div class="softpad" role="group" aria-label="Directional pad">
              <button class="softpad-dir up" data-key="up" aria-label="Up">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 15 7-7 7 7" /></svg>
              </button>
              <button class="softpad-dir right" data-key="right" aria-label="Right">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
              </button>
              <button class="softpad-dir down" data-key="down" aria-label="Down">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 9 7 7 7-7" /></svg>
              </button>
              <button class="softpad-dir left" data-key="left" aria-label="Left">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
              </button>
              <button class="softpad-ok" data-key="select" aria-label="Select">OK</button>
            </div>
            <p class="pad-hint">Swipe to move &middot; tap to select</p>
          </div>

          <div class="quick-row">
            <button class="quick" data-key="back">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5 3 12l7 7" /><path d="M3 12h13a5 5 0 0 1 0 10h-3" /></svg>
              <span>Back</span>
            </button>
            <button class="quick accent" data-key="playPause">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14" /><path d="M16 5v14" /></svg>
              <span>Play</span>
            </button>
            <button class="quick" data-key="home">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8" /><path d="M6 10v10h12V10" /></svg>
              <span>Home</span>
            </button>
          </div>

          <div class="vol-row" role="group" aria-label="Volume">
            <button class="vol" data-key="volumeDown" aria-label="Volume down">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
            </button>
            <span class="vol-label">VOL</span>
            <button class="vol" data-key="volumeUp" aria-label="Volume up">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12" /><path d="M6 12h12" /></svg>
            </button>
            <button class="vol" data-key="mute" aria-label="Mute">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m16 9 5 6" /><path d="m21 9-5 6" /></svg>
            </button>
          </div>

          <button id="more" class="more-trigger" type="button" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
            <span>More keys</span>
          </button>

          <!-- Everything Ambient keeps off the calm surface, one tap away. -->
          <div id="more-sheet" class="more-sheet" hidden>
            <div class="row four">
              <button class="tile" data-key="menu"><span>Menu</span></button>
              <button class="tile" data-key="appSwitch"><span>Recents</span></button>
              <button class="tile" id="wake"><span>Wake</span></button>
              <button class="tile" data-key="sleep"><span>Sleep</span></button>
            </div>
            <div class="row four">
              <button class="tile" data-key="previous"><span>Prev</span></button>
              <button class="tile" data-key="rewind"><span>Rew</span></button>
              <button class="tile" data-key="fastForward"><span>Ffwd</span></button>
              <button class="tile" data-key="next"><span>Next</span></button>
            </div>
          </div>
        </section>

        <section id="pane-apps" class="pane">
          <div class="pane-head">
            <div class="search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></svg>
              <input id="app-search" type="search" placeholder="Search apps" aria-label="Search apps" />
            </div>
            <button id="app-refresh" class="icon-button" type="button" aria-label="Refresh apps">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-.9 5" /><path d="M20 4v7h-7" /></svg>
            </button>
          </div>
          <div id="app-grid" class="app-grid"></div>
          <p id="app-empty" class="empty"></p>
        </section>

        <section id="pane-type" class="pane">
          <div class="type-card">
            <label for="type-input">Send text to the TV</label>
            <textarea
              id="type-input"
              rows="3"
              placeholder="Search terms, passwords, anything…"
              autocapitalize="sentences"
            ></textarea>
            <div class="type-actions">
              <button id="type-send" class="primary" type="button">Send text</button>
              <button id="type-clear" class="secondary" type="button">Clear</button>
            </div>
          </div>
          <div class="row three">
            <button class="tile" data-key="enter"><span>Enter</span></button>
            <button class="tile" data-key="delete"><span>Delete</span></button>
            <button class="tile" data-key="back"><span>Back</span></button>
          </div>
          <div class="type-hint">
            <strong>Typing needs ADB.</strong>
            <span>The desktop app relays text over ADB even when native remote is active.</span>
          </div>
        </section>
      </main>

      <nav class="tabbar" role="tablist">
        <button class="tab is-active" data-pane="remote" role="tab" aria-selected="true">Remote</button>
        <button class="tab" data-pane="apps" role="tab" aria-selected="false">Apps</button>
        <button class="tab" data-pane="type" role="tab" aria-selected="false">Type</button>
      </nav>

      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </div>

    <script src="/app.js"><\/script>
  </body>
</html>
`;
const appCss = '/* ==========================================================================\n   Relay phone remote — Ambient\n   Same room as the desktop app: warm near-black, one soft light each side,\n   one glass surface, ember as the only pressable colour.\n   ========================================================================== */\n\n:root {\n  color-scheme: dark;\n\n  --font-ui:\n    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", system-ui, sans-serif;\n  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;\n\n  --bg: #100e0e;\n  --surface: #1a1615;\n\n  --ink: #f6f1ee;\n  --dim: #b6a9a3;\n  --faint: #82736d;\n\n  --glass: rgba(255, 255, 255, 0.055);\n  --glass-2: rgba(255, 255, 255, 0.1);\n  --glass-line: rgba(255, 255, 255, 0.12);\n  --glass-line-strong: rgba(255, 255, 255, 0.22);\n\n  --ember: #ff7a59;\n  --ember-2: #ffb08a;\n  --ember-ink: #2a0d05;\n  --ember-soft: rgba(255, 122, 89, 0.15);\n\n  --live: #5fc8c3;\n  --warning: #f2b65a;\n  --danger: #ff5c7a;\n\n  --radius-xl: 26px;\n  --radius-lg: 20px;\n  --radius: 14px;\n\n  --ease: cubic-bezier(0.2, 0.9, 0.3, 1);\n\n  --safe-top: env(safe-area-inset-top, 0px);\n  --safe-bottom: env(safe-area-inset-bottom, 0px);\n}\n\n* {\n  box-sizing: border-box;\n  -webkit-tap-highlight-color: transparent;\n}\n\n/* The gate, the app and the more sheet are all toggled with [hidden], and the\n   display rules below would otherwise win over the UA default. */\n[hidden] {\n  display: none !important;\n}\n\nhtml,\nbody {\n  height: 100%;\n  margin: 0;\n  overscroll-behavior: none;\n}\n\nbody {\n  background: var(--bg);\n  color: var(--ink);\n  font-family: var(--font-ui);\n  font-size: 16px;\n  line-height: 1.45;\n  -webkit-font-smoothing: antialiased;\n}\n\nbutton {\n  font: inherit;\n  color: inherit;\n  border: 0;\n  background: none;\n  cursor: pointer;\n}\n\nbutton:disabled {\n  opacity: 0.4;\n}\n\nsvg {\n  display: block;\n  fill: none;\n  stroke: currentColor;\n  stroke-width: 1.8;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n\n/* Two soft lights behind everything. Fixed so the panes scroll over them. */\n.wash {\n  position: fixed;\n  inset: 0;\n  z-index: 0;\n  pointer-events: none;\n  overflow: hidden;\n}\n\n.wash::before,\n.wash::after {\n  content: "";\n  position: absolute;\n  border-radius: 50%;\n}\n\n.wash::before {\n  width: 560px;\n  height: 560px;\n  left: -180px;\n  top: -220px;\n  background: radial-gradient(circle, rgba(255, 122, 89, 0.32), rgba(255, 122, 89, 0) 68%);\n}\n\n.wash::after {\n  width: 520px;\n  height: 520px;\n  right: -190px;\n  bottom: -200px;\n  background: radial-gradient(circle, rgba(95, 200, 195, 0.22), rgba(95, 200, 195, 0) 68%);\n}\n\n/* ==========================================================================\n   Gate\n   ========================================================================== */\n\n.gate {\n  position: relative;\n  z-index: 1;\n  display: grid;\n  place-items: center;\n  min-height: 100dvh;\n  padding: 1.5rem;\n}\n\n.gate-card {\n  display: grid;\n  justify-items: center;\n  gap: 0.6rem;\n  width: 100%;\n  max-width: 21rem;\n  padding: 2rem 1.6rem 1.8rem;\n  border: 1px solid var(--glass-line);\n  border-radius: var(--radius-xl);\n  background: var(--glass);\n  backdrop-filter: blur(24px);\n  text-align: center;\n}\n\n.brand-mark {\n  display: grid;\n  place-items: center;\n  width: 3rem;\n  height: 3rem;\n  margin-bottom: 0.4rem;\n  border-radius: 1rem;\n  background: linear-gradient(150deg, var(--ember), #c2451f);\n}\n\n.brand-mark span {\n  display: block;\n  width: 0.7rem;\n  height: 0.7rem;\n  border-radius: 0.22rem;\n  background: var(--ember-ink);\n}\n\n.gate-card h1 {\n  margin: 0;\n  font-size: 1.5rem;\n  font-weight: 650;\n  letter-spacing: -0.02em;\n}\n\n.gate-card p {\n  margin: 0;\n  color: var(--dim);\n  font-size: 0.9rem;\n}\n\n#gate-form {\n  display: grid;\n  gap: 0.6rem;\n  width: 100%;\n  margin-top: 0.8rem;\n}\n\ninput,\ntextarea {\n  width: 100%;\n  padding: 0.8rem 1rem;\n  border: 1px solid var(--glass-line);\n  border-radius: var(--radius);\n  background: rgba(0, 0, 0, 0.28);\n  color: var(--ink);\n  font: inherit;\n}\n\ninput::placeholder,\ntextarea::placeholder {\n  color: var(--faint);\n}\n\ninput:focus,\ntextarea:focus {\n  outline: none;\n  border-color: var(--ember);\n}\n\n#gate-input {\n  font-family: var(--font-mono);\n  font-size: 1.2rem;\n  letter-spacing: 0.22em;\n  text-align: center;\n}\n\n.primary {\n  padding: 0.85rem 1.2rem;\n  border-radius: 999px;\n  background: var(--ember);\n  color: var(--ember-ink);\n  font-weight: 650;\n}\n\n.primary:active {\n  background: var(--ember-2);\n}\n\n.secondary {\n  padding: 0.85rem 1.2rem;\n  border: 1px solid var(--glass-line);\n  border-radius: 999px;\n  background: var(--glass);\n  color: var(--dim);\n  font-weight: 550;\n}\n\n.gate-error {\n  min-height: 1.2rem;\n  color: var(--danger);\n  font-size: 0.85rem;\n}\n\n/* ==========================================================================\n   Shell\n   ========================================================================== */\n\n.app {\n  position: relative;\n  z-index: 1;\n  display: grid;\n  grid-template-rows: auto minmax(0, 1fr) auto;\n  height: 100dvh;\n  padding: calc(var(--safe-top) + 0.7rem) 0.9rem calc(var(--safe-bottom) + 0.7rem);\n  gap: 0.7rem;\n}\n\n/* --- now playing header ------------------------------------------------ */\n\n.topbar {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  padding: 0.55rem 0.7rem;\n  border: 1px solid var(--glass-line);\n  border-radius: var(--radius-lg);\n  background: var(--glass);\n  backdrop-filter: blur(20px);\n}\n\n.now-art {\n  display: grid;\n  place-items: center;\n  flex: none;\n  width: 2.9rem;\n  height: 2.9rem;\n  border-radius: 0.85rem;\n  overflow: hidden;\n  background: linear-gradient(150deg, hsl(var(--hue, 18) 58% 48%), hsl(var(--hue, 18) 62% 26%));\n  color: #fff;\n  font-size: 0.95rem;\n  font-weight: 650;\n}\n\n.now-art img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n\n.now-art.is-idle {\n  background: var(--glass-2);\n  color: var(--faint);\n}\n\n.now-art.is-idle svg {\n  width: 1.3rem;\n  height: 1.3rem;\n}\n\n.now-copy {\n  display: grid;\n  gap: 0.1rem;\n  min-width: 0;\n  flex: 1;\n}\n\n.now-copy strong {\n  font-size: 1rem;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.now-copy small {\n  display: flex;\n  align-items: center;\n  gap: 0.4rem;\n  color: var(--faint);\n  font-size: 0.78rem;\n  min-width: 0;\n}\n\n.now-copy small span:last-child {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dot {\n  flex: none;\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: var(--faint);\n}\n\n.dot.is-live {\n  background: var(--live);\n  box-shadow: 0 0 9px var(--live);\n}\n\n.dot.is-busy {\n  background: var(--warning);\n}\n\n.dot.is-down {\n  background: var(--danger);\n}\n\n.icon-button {\n  display: grid;\n  place-items: center;\n  flex: none;\n  width: 2.5rem;\n  height: 2.5rem;\n  border: 1px solid var(--glass-line);\n  border-radius: 50%;\n  background: var(--glass);\n  color: var(--dim);\n}\n\n.icon-button svg {\n  width: 1.15rem;\n  height: 1.15rem;\n}\n\n.icon-button.danger {\n  border-color: rgba(255, 92, 122, 0.3);\n  color: var(--danger);\n}\n\n.icon-button:active {\n  background: var(--glass-2);\n}\n\n/* --- panes -------------------------------------------------------------- */\n\n.panes {\n  position: relative;\n  min-height: 0;\n}\n\n.pane {\n  display: none;\n  height: 100%;\n  overflow-y: auto;\n  -webkit-overflow-scrolling: touch;\n}\n\n.pane.is-active {\n  display: flex;\n  flex-direction: column;\n  gap: 0.8rem;\n}\n\n/* ==========================================================================\n   Remote pane\n   ========================================================================== */\n\n.pad-stage {\n  display: grid;\n  justify-items: center;\n  gap: 0.7rem;\n  flex: 1;\n  align-content: center;\n  min-height: 0;\n}\n\n.softpad {\n  position: relative;\n  display: grid;\n  place-items: center;\n  width: min(72vw, 17rem);\n  aspect-ratio: 1;\n  border-radius: 50%;\n  border: 1px solid rgba(255, 255, 255, 0.14);\n  background: radial-gradient(\n    circle at 50% 34%,\n    rgba(255, 255, 255, 0.13),\n    rgba(255, 255, 255, 0.02) 62%\n  );\n  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.16);\n  touch-action: none;\n}\n\n.softpad-dir {\n  position: absolute;\n  display: grid;\n  place-items: center;\n  width: 3.6rem;\n  height: 3.6rem;\n  border-radius: 50%;\n  color: rgba(255, 255, 255, 0.4);\n}\n\n.softpad-dir svg {\n  width: 1.35rem;\n  height: 1.35rem;\n}\n\n.softpad-dir:active {\n  background: rgba(255, 255, 255, 0.1);\n  color: var(--ink);\n}\n\n.softpad-dir.up {\n  top: 0.3rem;\n  left: 50%;\n  transform: translateX(-50%);\n}\n\n.softpad-dir.down {\n  bottom: 0.3rem;\n  left: 50%;\n  transform: translateX(-50%);\n}\n\n.softpad-dir.left {\n  left: 0.3rem;\n  top: 50%;\n  transform: translateY(-50%);\n}\n\n.softpad-dir.right {\n  right: 0.3rem;\n  top: 50%;\n  transform: translateY(-50%);\n}\n\n.softpad-ok {\n  display: grid;\n  place-items: center;\n  width: 42%;\n  aspect-ratio: 1;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.94);\n  color: #171110;\n  font-size: 0.95rem;\n  font-weight: 700;\n  letter-spacing: 0.14em;\n  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);\n  transition: transform 0.1s var(--ease);\n}\n\n.softpad-ok:active {\n  transform: scale(0.95);\n}\n\n.pad-hint {\n  margin: 0;\n  color: var(--faint);\n  font-size: 0.78rem;\n}\n\n.quick-row {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 0.5rem;\n}\n\n.quick {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 0.45rem;\n  padding: 0.85rem 0.5rem;\n  border: 1px solid var(--glass-line);\n  border-radius: 999px;\n  background: var(--glass);\n  color: var(--dim);\n  font-size: 0.88rem;\n  font-weight: 550;\n}\n\n.quick svg {\n  width: 1.05rem;\n  height: 1.05rem;\n}\n\n.quick:active {\n  background: var(--glass-2);\n  color: var(--ink);\n}\n\n.quick.accent {\n  border-color: transparent;\n  background: var(--ember);\n  color: var(--ember-ink);\n  font-weight: 650;\n}\n\n.quick.accent:active {\n  background: var(--ember-2);\n}\n\n.vol-row {\n  display: grid;\n  grid-template-columns: 1fr auto 1fr auto;\n  align-items: center;\n  gap: 0.5rem;\n  padding: 0.35rem;\n  border: 1px solid var(--glass-line);\n  border-radius: 999px;\n  background: var(--glass);\n}\n\n.vol {\n  display: grid;\n  place-items: center;\n  height: 2.8rem;\n  border-radius: 999px;\n  color: var(--dim);\n}\n\n.vol svg {\n  width: 1.25rem;\n  height: 1.25rem;\n}\n\n.vol:active {\n  background: var(--glass-2);\n  color: var(--ink);\n}\n\n.vol-label {\n  padding: 0 0.2rem;\n  color: var(--faint);\n  font-size: 0.62rem;\n  font-weight: 650;\n  letter-spacing: 0.16em;\n}\n\n.vol-row .vol:last-child {\n  border-left: 1px solid var(--glass-line);\n}\n\n.more-trigger {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 0.5rem;\n  padding: 0.7rem;\n  border-radius: 999px;\n  color: var(--faint);\n  font-size: 0.85rem;\n}\n\n.more-trigger svg {\n  width: 1.1rem;\n  height: 1.1rem;\n  fill: currentColor;\n  stroke: none;\n}\n\n.more-trigger[aria-expanded="true"] {\n  color: var(--ink);\n}\n\n.more-sheet {\n  display: grid;\n  gap: 0.5rem;\n  padding-bottom: 0.3rem;\n}\n\n.row {\n  display: grid;\n  gap: 0.5rem;\n}\n\n.row.three {\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n}\n\n.row.four {\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n}\n\n.tile {\n  display: grid;\n  place-items: center;\n  padding: 0.85rem 0.3rem;\n  border: 1px solid var(--glass-line);\n  border-radius: var(--radius);\n  background: var(--glass);\n  color: var(--dim);\n  font-size: 0.82rem;\n  font-weight: 550;\n}\n\n.tile:active {\n  background: var(--glass-2);\n  color: var(--ink);\n}\n\n/* ==========================================================================\n   Apps pane\n   ========================================================================== */\n\n.pane-head {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  padding-bottom: 0.1rem;\n}\n\n.search {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  flex: 1;\n  padding: 0 0.9rem;\n  border: 1px solid var(--glass-line);\n  border-radius: 999px;\n  background: var(--glass);\n  color: var(--faint);\n}\n\n.search svg {\n  flex: none;\n  width: 1.05rem;\n  height: 1.05rem;\n}\n\n.search input {\n  border: 0;\n  background: none;\n  padding: 0.7rem 0;\n  font-size: 0.95rem;\n}\n\n.search input:focus {\n  border: 0;\n}\n\n.app-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(5.4rem, 1fr));\n  gap: 0.6rem;\n  padding-bottom: 0.5rem;\n}\n\n.app-card {\n  position: relative;\n  display: grid;\n  justify-items: center;\n  gap: 0.4rem;\n  padding: 0.8rem 0.35rem 0.7rem;\n  border: 1px solid var(--glass-line);\n  border-radius: var(--radius-lg);\n  background: var(--glass);\n  color: var(--ink);\n  text-align: center;\n}\n\n.app-card:active {\n  background: var(--glass-2);\n}\n\n.app-card.is-busy {\n  opacity: 0.5;\n}\n\n.app-card img,\n.app-card .fallback {\n  width: 2.9rem;\n  height: 2.9rem;\n  border-radius: 0.85rem;\n  object-fit: cover;\n}\n\n.app-card .fallback {\n  display: grid;\n  place-items: center;\n  background: linear-gradient(150deg, hsl(var(--hue) 58% 48%), hsl(var(--hue) 62% 26%));\n  color: #fff;\n  font-size: 0.9rem;\n  font-weight: 650;\n}\n\n.app-card span {\n  font-size: 0.76rem;\n  line-height: 1.25;\n  overflow-wrap: anywhere;\n}\n\n.app-card .pin {\n  position: absolute;\n  top: 0.35rem;\n  right: 0.45rem;\n  color: var(--ember);\n  font-size: 0.7rem;\n  font-style: normal;\n}\n\n.empty {\n  margin: 0;\n  padding: 1.5rem 0.5rem;\n  color: var(--faint);\n  font-size: 0.88rem;\n  text-align: center;\n}\n\n/* ==========================================================================\n   Type pane\n   ========================================================================== */\n\n.type-card {\n  display: grid;\n  gap: 0.6rem;\n  padding: 1rem;\n  border: 1px solid var(--glass-line);\n  border-radius: var(--radius-lg);\n  background: var(--glass);\n  backdrop-filter: blur(20px);\n}\n\n.type-card label {\n  color: var(--dim);\n  font-size: 0.85rem;\n}\n\n.type-actions {\n  display: grid;\n  grid-template-columns: 1fr auto;\n  gap: 0.5rem;\n}\n\n.type-hint {\n  display: grid;\n  gap: 0.15rem;\n  padding: 0.85rem 1rem;\n  border-radius: var(--radius);\n  background: rgba(0, 0, 0, 0.22);\n  font-size: 0.82rem;\n}\n\n.type-hint strong {\n  color: var(--ink);\n}\n\n.type-hint span {\n  color: var(--faint);\n}\n\n/* ==========================================================================\n   Tab bar and toast\n   ========================================================================== */\n\n.tabbar {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 2px;\n  padding: 4px;\n  border: 1px solid var(--glass-line);\n  border-radius: 999px;\n  background: var(--glass);\n  backdrop-filter: blur(20px);\n}\n\n.tab {\n  padding: 0.65rem 0;\n  border-radius: 999px;\n  color: var(--dim);\n  font-size: 0.88rem;\n  font-weight: 550;\n}\n\n.tab.is-active {\n  background: var(--ink);\n  color: #171110;\n  font-weight: 650;\n}\n\n.toast {\n  position: fixed;\n  left: 50%;\n  bottom: calc(var(--safe-bottom) + 5.2rem);\n  z-index: 20;\n  transform: translate(-50%, 8px);\n  padding: 0.6rem 1.1rem;\n  border: 1px solid var(--glass-line);\n  border-radius: 999px;\n  background: var(--surface);\n  color: var(--ink);\n  font-size: 0.85rem;\n  opacity: 0;\n  pointer-events: none;\n  transition: opacity 0.18s var(--ease), transform 0.18s var(--ease);\n}\n\n.toast.is-visible {\n  opacity: 1;\n  transform: translate(-50%, 0);\n}\n\n.toast.is-error {\n  border-color: var(--danger);\n  color: var(--danger);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .toast,\n  .softpad-ok {\n    transition: none;\n  }\n}\n\n/* Short phones: give the pad less room rather than clipping the controls. */\n@media (max-height: 700px) {\n  .softpad {\n    width: min(58vw, 13.5rem);\n  }\n\n  .quick {\n    padding: 0.7rem 0.5rem;\n  }\n}\n';
const appJs = `/* Relay phone remote client. Plain ES2019 so older phone browsers can run it. */
;(function () {
  'use strict'

  var TOKEN_KEY = 'relay.token'
  var byId = function (id) {
    return document.getElementById(id)
  }

  var state = { snapshot: null, appQuery: '', pane: 'remote', busyPackage: null }
  var stream = null
  var toastTimer = null

  /* ---------------- token handling ---------------- */

  function readTokenFromUrl() {
    var match = /[?&]t=([^&#]+)/.exec(window.location.search || '')
    return match ? decodeURIComponent(match[1]) : ''
  }

  function storedToken() {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || ''
    } catch (error) {
      return ''
    }
  }

  function saveToken(token) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
    } catch (error) {
      /* Private browsing: the token still lives in memory for this session. */
    }
  }

  var token = readTokenFromUrl() || storedToken()

  if (readTokenFromUrl()) {
    saveToken(token)
    // Keep the code out of the address bar once it is stored.
    window.history.replaceState({}, '', window.location.pathname)
  }

  /* ---------------- transport ---------------- */

  function request(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body
        ? { 'Content-Type': 'application/json', 'X-Relay-Token': token }
        : { 'X-Relay-Token': token },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      if (response.status === 401) {
        showGate('That code was not accepted.')
        throw new Error('unauthorized')
      }

      return response.json().then(function (payload) {
        if (!response.ok) {
          throw new Error(payload && payload.error ? payload.error : 'Request failed.')
        }
        return payload
      })
    })
  }

  function openStream() {
    if (stream) {
      stream.close()
    }

    stream = new EventSource('/api/events?t=' + encodeURIComponent(token))
    stream.onmessage = function (event) {
      applySnapshot(JSON.parse(event.data))
    }
    stream.onerror = function () {
      setConnectionDot('is-down', 'Reconnecting to the desktop app…')
    }
  }

  /* ---------------- gate ---------------- */

  function showGate(message) {
    byId('gate').hidden = false
    byId('app').hidden = true
    byId('gate-error').textContent = message || ''

    if (stream) {
      stream.close()
      stream = null
    }
  }

  function showApp() {
    byId('gate').hidden = true
    byId('app').hidden = false
  }

  byId('gate-form').addEventListener('submit', function (event) {
    event.preventDefault()
    var value = byId('gate-input').value.trim().toUpperCase()

    if (!value) {
      return
    }

    token = value
    request('/api/snapshot')
      .then(function (snapshot) {
        saveToken(token)
        showApp()
        applySnapshot(snapshot)
        openStream()
      })
      .catch(function () {
        /* showGate already reported the failure. */
      })
  })

  /* ---------------- rendering ---------------- */

  function setConnectionDot(className, detail) {
    byId('status-dot').className = 'dot ' + className
    if (detail) {
      byId('now-detail-text').textContent = detail
    }
  }

  /** The art tile only ever shows an icon the desktop already cached. */
  function paintNowArt(app) {
    var art = byId('now-art')
    art.textContent = ''
    art.style.removeProperty('--hue')

    if (!app) {
      art.className = 'now-art is-idle'
      art.innerHTML =
        '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/></svg>'
      return
    }

    art.className = 'now-art'

    var apps = state.snapshot && state.snapshot.apps ? state.snapshot.apps : []
    var known = null

    for (var index = 0; index < apps.length; index += 1) {
      if (apps[index].packageName === app.packageName) {
        known = apps[index]
        break
      }
    }

    if (known && known.hasIcon) {
      var img = document.createElement('img')
      img.src =
        '/api/icon?package=' +
        encodeURIComponent(app.packageName) +
        '&t=' +
        encodeURIComponent(token)
      img.alt = ''
      art.appendChild(img)
      return
    }

    art.style.setProperty('--hue', String(hueFor(app.packageName)))
    art.textContent = initials(app.displayName)
  }

  function applySnapshot(snapshot) {
    state.snapshot = snapshot

    var connection = snapshot.connectionState || {}
    var device = snapshot.device
    var connected = connection.status === 'connected'
    var backend = snapshot.activeBackend === 'native' ? 'Native Remote' : 'ADB'

    // The app on screen leads; the TV name drops to the line underneath it.
    var foreground = connected ? snapshot.foregroundApp : null

    if (connected) {
      byId('now-title').textContent = foreground ? foreground.displayName : device.name
      setConnectionDot('is-live', (foreground ? device.name : device.host) + ' · ' + backend)
    } else if (connection.status === 'connecting' || connection.status === 'pairing') {
      byId('now-title').textContent = device ? device.name : 'Connecting'
      setConnectionDot('is-busy', 'Connecting…')
    } else {
      byId('now-title').textContent = device ? device.name : 'No TV connected'
      setConnectionDot('is-down', connection.message || 'Connect a TV from the desktop app first')
    }

    paintNowArt(foreground)
    renderApps()
  }

  function initials(name) {
    return name
      .split(/\\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase()
      })
      .join('')
  }

  /** Stable per-package hue so icon-less apps stay distinguishable. */
  function hueFor(packageName) {
    var hash = 0

    for (var index = 0; index < packageName.length; index += 1) {
      hash = (hash * 31 + packageName.charCodeAt(index)) >>> 0
    }

    return hash % 360
  }

  function visibleApps() {
    var snapshot = state.snapshot
    if (!snapshot) {
      return []
    }

    var query = state.appQuery.trim().toLowerCase()
    var apps = snapshot.apps.filter(function (app) {
      if (!query) {
        return true
      }
      return (
        app.displayName.toLowerCase().indexOf(query) !== -1 ||
        app.packageName.toLowerCase().indexOf(query) !== -1
      )
    })

    var recents = snapshot.recentApps || []
    return apps.sort(function (left, right) {
      if (left.favorite !== right.favorite) {
        return left.favorite ? -1 : 1
      }

      var leftRecent = recents.indexOf(left.packageName)
      var rightRecent = recents.indexOf(right.packageName)

      if (leftRecent !== rightRecent) {
        return (leftRecent === -1 ? 99 : leftRecent) - (rightRecent === -1 ? 99 : rightRecent)
      }

      return left.displayName.localeCompare(right.displayName)
    })
  }

  function renderApps() {
    var grid = byId('app-grid')
    var empty = byId('app-empty')
    var apps = visibleApps()

    grid.textContent = ''

    if (apps.length === 0) {
      var snapshot = state.snapshot
      empty.textContent = !snapshot || !snapshot.device
        ? 'Connect a TV from the desktop app to browse its apps.'
        : state.appQuery
          ? 'No apps match that search.'
          : 'No apps cached yet. Tap refresh to build the list.'
      return
    }

    empty.textContent = ''

    apps.forEach(function (app) {
      var card = document.createElement('button')
      card.type = 'button'
      card.className = 'app-card' + (state.busyPackage === app.packageName ? ' is-busy' : '')
      card.setAttribute('data-package', app.packageName)

      if (app.hasIcon) {
        var img = document.createElement('img')
        img.src = '/api/icon?package=' + encodeURIComponent(app.packageName) + '&t=' + encodeURIComponent(token)
        img.alt = ''
        img.loading = 'lazy'
        card.appendChild(img)
      } else {
        var fallback = document.createElement('div')
        fallback.className = 'fallback'
        fallback.style.setProperty('--hue', String(hueFor(app.packageName)))
        fallback.textContent = initials(app.displayName)
        card.appendChild(fallback)
      }

      var label = document.createElement('span')
      label.textContent = app.displayName
      card.appendChild(label)

      if (app.favorite) {
        var pin = document.createElement('em')
        pin.className = 'pin'
        pin.textContent = '★'
        card.appendChild(pin)
      }

      grid.appendChild(card)
    })
  }

  function toast(message, isError) {
    var element = byId('toast')
    element.textContent = message
    element.className = 'toast is-visible' + (isError ? ' is-error' : '')

    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(function () {
      element.className = 'toast'
    }, isError ? 3200 : 1600)
  }

  /** The gate already took over for a 401, so that case stays silent. */
  function reportError(error) {
    if (error && error.message !== 'unauthorized') {
      toast(error.message, true)
    }
  }

  function buzz(duration) {
    if (navigator.vibrate) {
      navigator.vibrate(duration || 8)
    }
  }

  /* ---------------- actions ---------------- */

  function sendKey(command) {
    buzz()
    request('/api/key', { command: command })
      .then(function (payload) {
        var feedback = payload.feedback
        if (feedback && feedback.status === 'blocked') {
          toast(feedback.title, true)
        }
      })
      .catch(reportError)
  }

  document.addEventListener('click', function (event) {
    if (!event.target || !event.target.closest) {
      return
    }

    var keyTarget = event.target.closest('[data-key]')

    if (keyTarget) {
      sendKey(keyTarget.getAttribute('data-key'))
      return
    }

    var appTarget = event.target.closest('[data-package]')

    if (appTarget) {
      var packageName = appTarget.getAttribute('data-package')
      buzz(12)
      state.busyPackage = packageName
      renderApps()
      request('/api/launch', { packageName: packageName })
        .then(function () {
          toast('Launching…')
        })
        .catch(reportError)
        .then(function () {
          state.busyPackage = null
          renderApps()
        })
      return
    }

    var tab = event.target.closest('[data-pane]')
    if (tab) {
      selectPane(tab.getAttribute('data-pane'))
    }
  })

  byId('power').addEventListener('click', function () {
    sendKey('power')
  })

  /* The one place the calm surface hides things, and it is never more than a tap
     away. Everything in here still reaches the TV through the desktop app. */
  byId('more').addEventListener('click', function () {
    var sheet = byId('more-sheet')
    var opening = sheet.hidden

    sheet.hidden = !opening
    byId('more').setAttribute('aria-expanded', opening ? 'true' : 'false')
  })

  byId('wake').addEventListener('click', function (event) {
    event.stopPropagation()
    buzz(12)
    request('/api/wake', {})
      .then(function () {
        toast('Wake sent')
      })
      .catch(reportError)
  })

  byId('app-refresh').addEventListener('click', function () {
    buzz(12)
    toast('Refreshing apps…')
    request('/api/apps/refresh', {})
      .then(function (snapshot) {
        applySnapshot(snapshot)
        toast('Apps updated')
      })
      .catch(reportError)
  })

  byId('app-search').addEventListener('input', function (event) {
    state.appQuery = event.target.value
    renderApps()
  })

  byId('type-send').addEventListener('click', function () {
    var input = byId('type-input')
    var text = input.value

    if (!text) {
      return
    }

    buzz(12)
    request('/api/text', { text: text })
      .then(function () {
        input.value = ''
        toast('Text sent')
      })
      .catch(reportError)
  })

  byId('type-clear').addEventListener('click', function () {
    byId('type-input').value = ''
  })

  function selectPane(name) {
    state.pane = name

    Array.prototype.forEach.call(document.querySelectorAll('.pane'), function (pane) {
      pane.classList.toggle('is-active', pane.id === 'pane-' + name)
    })

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var active = tab.getAttribute('data-pane') === name
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
    })
  }

  /* Swipe on the d-pad so flicking works like a trackpad. */
  ;(function enableSwipe() {
    var pad = document.querySelector('.softpad')
    var start = null

    pad.addEventListener(
      'touchstart',
      function (event) {
        start = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() }
      },
      { passive: true }
    )

    pad.addEventListener(
      'touchend',
      function (event) {
        if (!start) {
          return
        }

        var touch = event.changedTouches[0]
        var deltaX = touch.clientX - start.x
        var deltaY = touch.clientY - start.y
        var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        var elapsed = Date.now() - start.time
        start = null

        // Below the threshold this is a tap, and the click handler owns it.
        if (distance < 42 || elapsed > 600) {
          return
        }

        event.preventDefault()

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          sendKey(deltaX > 0 ? 'right' : 'left')
        } else {
          sendKey(deltaY > 0 ? 'down' : 'up')
        }
      },
      { passive: false }
    )
  })()

  /* Keep the now-playing header fresh. The desktop reports the app it last
     polled, so this reads a cached value and never touches the TV itself. */
  var snapshotPending = false

  window.setInterval(function () {
    if (snapshotPending || byId('app').hidden || document.visibilityState !== 'visible') {
      return
    }

    snapshotPending = true
    request('/api/snapshot')
      .then(applySnapshot)
      .catch(function () {
        /* A dropped desktop app already shows through the connection dot. */
      })
      .then(function () {
        snapshotPending = false
      })
  }, 10000)

  /* Reconnect the event stream when the phone comes back from sleep. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !byId('app').hidden) {
      request('/api/snapshot').then(applySnapshot).catch(function () {})
      openStream()
    }
  })

  /* ---------------- boot ---------------- */

  if (!token) {
    showGate('')
  } else {
    request('/api/snapshot')
      .then(function (snapshot) {
        showApp()
        applySnapshot(snapshot)
        openStream()
      })
      .catch(function () {
        /* showGate already ran for a 401. */
      })
  }
})()
`;
const manifest = '{\n  "name": "Relay Remote",\n  "short_name": "Relay",\n  "description": "Control your Android TV from your phone over the local network.",\n  "start_url": "/",\n  "scope": "/",\n  "display": "standalone",\n  "orientation": "portrait",\n  "background_color": "#100e0e",\n  "theme_color": "#100e0e",\n  "icons": [\n    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }\n  ]\n}\n';
const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n  <defs>\n    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n      <stop offset="0" stop-color="#ff7a59"/>\n      <stop offset="1" stop-color="#c2451f"/>\n    </linearGradient>\n  </defs>\n  <rect width="512" height="512" rx="112" fill="#100e0e"/>\n  <circle cx="256" cy="256" r="168" fill="url(#g)"/>\n  <circle cx="256" cy="256" r="72" fill="#100e0e"/>\n</svg>\n';
const WEB_ASSETS = {
  "/index.html": { body: indexHtml, contentType: "text/html; charset=utf-8" },
  "/app.css": { body: appCss, contentType: "text/css; charset=utf-8" },
  "/app.js": { body: appJs, contentType: "text/javascript; charset=utf-8" },
  "/manifest.webmanifest": { body: manifest, contentType: "application/manifest+json" },
  "/icon.svg": { body: iconSvg, contentType: "image/svg+xml" }
};
const MAX_BODY_BYTES = 64 * 1024;
const HEARTBEAT_MS = 2e4;
const ICON_CACHE_HEADER = "public, max-age=86400";
function isPrivateAddress(address) {
  return address.startsWith("192.168.") || address.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}
function collectAddresses(port) {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [label, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      const isWireless = /^(en0|en1|wlan|wl)/i.test(label);
      addresses.push({
        label,
        host: entry.address,
        url: `http://${entry.address}:${port}/`,
        rank: (isPrivateAddress(entry.address) ? 0 : 2) + (isWireless ? 0 : 1)
      });
    }
  }
  return addresses.sort((left, right) => left.rank - right.rank || left.host.localeCompare(right.host)).map(({ rank: _rank, ...address }) => address);
}
function tokensMatch(expected, received) {
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(received).digest();
  return timingSafeEqual(left, right);
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
class WebRemoteServer extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.settings = options.settings.getWebRemote();
  }
  server = null;
  settings;
  clients = /* @__PURE__ */ new Set();
  heartbeat = null;
  lastError;
  running = false;
  async init() {
    this.options.deviceManager.on("connectionState", () => this.broadcastSnapshot());
    this.options.deviceManager.on("devicesChanged", () => this.broadcastSnapshot());
    if (this.settings.enabled) {
      await this.start().catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      });
    }
  }
  getStatus() {
    const addresses = this.running ? collectAddresses(this.settings.port) : [];
    const primary = addresses[0] ?? null;
    const primaryUrl = primary ? `${primary.url}?t=${this.settings.token}` : null;
    return {
      enabled: this.settings.enabled,
      running: this.running,
      port: this.settings.port,
      token: this.settings.token,
      addresses,
      primaryUrl,
      connectedClients: this.clients.size,
      lastError: this.lastError,
      qrSvg: primaryUrl ? renderQrCodeSvg(primaryUrl) : null
    };
  }
  async update(input) {
    const nextPort = input.port === void 0 ? this.settings.port : this.normalizePort(input.port);
    const nextEnabled = input.enabled ?? this.settings.enabled;
    const nextToken = input.rotateToken ? createWebRemoteToken() : this.settings.token;
    const needsRestart = this.running && (nextPort !== this.settings.port || nextToken !== this.settings.token);
    this.settings = { enabled: nextEnabled, port: nextPort, token: nextToken };
    this.options.settings.setWebRemote(this.settings);
    if (!nextEnabled) {
      await this.stop();
    } else if (needsRestart || !this.running) {
      await this.stop();
      await this.start().catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      });
    }
    const status = this.getStatus();
    this.emit("status", status);
    return status;
  }
  dispose() {
    void this.stop();
  }
  normalizePort(port) {
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      return DEFAULT_WEB_REMOTE_PORT;
    }
    return Math.floor(port);
  }
  start() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const server = http.createServer((request, response) => {
        void this.handleRequest(request, response);
      });
      server.on("error", (error) => {
        this.lastError = error.code === "EADDRINUSE" ? `Port ${this.settings.port} is already in use. Pick another port.` : error.message;
        if (settled) {
          this.emit("status", this.getStatus());
          return;
        }
        settled = true;
        this.running = false;
        this.server = null;
        this.emit("status", this.getStatus());
        reject(error);
      });
      server.listen(this.settings.port, "0.0.0.0", () => {
        settled = true;
        this.server = server;
        this.running = true;
        this.lastError = void 0;
        this.heartbeat = setInterval(() => {
          for (const client of this.clients) {
            client.write(": ping\n\n");
          }
        }, HEARTBEAT_MS);
        this.emit("status", this.getStatus());
        resolve();
      });
    });
  }
  async stop() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
    const server = this.server;
    if (!server) {
      this.running = false;
      return;
    }
    this.server = null;
    this.running = false;
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }
  authorize(request, url) {
    const provided = request.headers["x-relay-token"] ?? url.searchParams.get("t") ?? "";
    return provided.length > 0 && tokensMatch(this.settings.token, provided);
  }
  async handleRequest(request, response) {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const path2 = url.pathname;
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    const asset = WEB_ASSETS[path2 === "/" ? "/index.html" : path2];
    if (asset) {
      response.writeHead(200, {
        "Content-Type": asset.contentType,
        "Cache-Control": "no-cache"
      });
      response.end(asset.body);
      return;
    }
    if (!path2.startsWith("/api/")) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    if (!this.authorize(request, url)) {
      response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Enter the access code shown in the desktop app." }));
      return;
    }
    if (path2 === "/api/events") {
      this.openEventStream(response);
      return;
    }
    if (path2 === "/api/icon") {
      this.serveIcon(url.searchParams.get("package") ?? "", response);
      return;
    }
    try {
      const result = await this.routeApi(path2, request, url);
      response.writeHead(result.status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(JSON.stringify(result.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: message }));
    }
  }
  async routeApi(path2, request, _url) {
    if (request.method === "GET" && path2 === "/api/snapshot") {
      return { status: 200, body: this.buildSnapshot() };
    }
    if (request.method !== "POST") {
      return { status: 405, body: { error: "Method not allowed." } };
    }
    const raw = await readBody(request);
    const payload = raw ? JSON.parse(raw) : {};
    switch (path2) {
      case "/api/key":
        return this.withFeedback(
          () => this.options.remoteController.sendCommand(String(payload.command))
        );
      case "/api/text":
        return this.withFeedback(
          () => this.options.remoteController.sendText(String(payload.text ?? ""))
        );
      case "/api/launch":
        return this.withFeedback(
          () => this.options.appController.launchPackage(String(payload.packageName))
        );
      case "/api/quick-action":
        return this.withFeedback(
          () => this.options.actionController.runQuickAction(String(payload.id))
        );
      case "/api/wake":
        return this.withFeedback(() => this.options.deviceManager.wakeAndReconnect());
      case "/api/apps/refresh": {
        await this.options.appController.listApps(true);
        this.broadcastSnapshot();
        return { status: 200, body: this.buildSnapshot() };
      }
      case "/api/favorite": {
        await this.options.appController.toggleFavorite(String(payload.packageName));
        this.broadcastSnapshot();
        return { status: 200, body: this.buildSnapshot() };
      }
      case "/api/connect": {
        const state = await this.options.deviceManager.connectDevice({ id: String(payload.id) });
        return { status: 200, body: { connectionState: state } };
      }
      case "/api/disconnect": {
        const state = await this.options.deviceManager.disconnectActiveDevice();
        return { status: 200, body: { connectionState: state } };
      }
      default:
        return { status: 404, body: { error: "Unknown endpoint." } };
    }
  }
  async withFeedback(run) {
    try {
      const feedback = await run();
      return { status: 200, body: { feedback } };
    } catch (error) {
      return {
        status: 409,
        body: { error: error instanceof Error ? error.message : "Action failed." }
      };
    }
  }
  serveIcon(packageName, response) {
    const apps = this.options.deviceManager.getActiveDevice()?.cachedApps?.apps ?? [];
    const match = apps.find((app2) => app2.packageName === packageName);
    const parsed = match?.iconDataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    if (!parsed) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": parsed[1],
      "Cache-Control": ICON_CACHE_HEADER
    });
    response.end(Buffer.from(parsed[2], "base64"));
  }
  openEventStream(response) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    response.write("retry: 3000\n\n");
    response.write(`data: ${JSON.stringify(this.buildSnapshot())}

`);
    this.clients.add(response);
    this.emit("status", this.getStatus());
    response.on("close", () => {
      this.clients.delete(response);
      this.emit("status", this.getStatus());
    });
  }
  broadcastSnapshot() {
    if (this.clients.size === 0) {
      return;
    }
    const payload = `data: ${JSON.stringify(this.buildSnapshot())}

`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }
  buildSnapshot() {
    const { deviceManager: deviceManager2 } = this.options;
    const activeDevice = deviceManager2.getActiveDevice();
    const capabilities = deviceManager2.getCapabilities();
    const connectionState = deviceManager2.getConnectionState();
    const favorites = new Set(activeDevice?.favorites ?? []);
    const apps = (activeDevice?.cachedApps?.apps ?? []).map((app2) => ({
      packageName: app2.packageName,
      displayName: app2.displayName,
      category: app2.category,
      hasIcon: Boolean(app2.iconDataUrl),
      favorite: favorites.has(app2.packageName)
    }));
    return {
      connectionState,
      activeBackend: deviceManager2.getActiveBackend(),
      device: activeDevice ? { id: activeDevice.id, name: activeDevice.name, host: activeDevice.host } : null,
      devices: deviceManager2.listDevices().map((device) => ({
        id: device.id,
        name: device.name,
        host: device.host
      })),
      capabilities,
      apps,
      // Whatever the desktop poll last saw. Never issues a fresh ADB call here.
      foregroundApp: this.options.appController.getCachedForegroundApp(),
      recentApps: (activeDevice?.recentApps ?? []).map((entry) => entry.packageName),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
let mainWindow = null;
let deviceManager = null;
let webRemoteServer = null;
let bootstrapPromise = null;
function resolvePreloadPath() {
  const candidates = [
    path.join(__dirname, "../preload/index.cjs"),
    path.join(__dirname, "../preload/index.mjs"),
    path.join(__dirname, "../preload/index.js")
  ];
  const preloadPath = candidates.find((candidate) => fs$1.existsSync(candidate));
  if (!preloadPath) {
    throw new Error(`Unable to find preload bundle. Checked: ${candidates.join(", ")}`);
  }
  return preloadPath;
}
async function createMainWindow() {
  const preload = resolvePreloadPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#100e0e",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Renderer failed to load", {
      errorCode,
      errorDescription,
      validatedURL
    });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process exited unexpectedly", details);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
async function bootstrap() {
  const adbLocator = new AdbLocator();
  const adbInfo = await adbLocator.locate();
  const adbClient = new AdbClient(adbInfo.path ?? "adb");
  const store = new ElectronDeviceStore();
  const nativeRemoteService = new NativeRemoteService();
  deviceManager = new DeviceManager(store, adbClient, nativeRemoteService);
  const remoteController = new RemoteController(deviceManager, adbClient, nativeRemoteService);
  const appController = new AppController(deviceManager, adbClient);
  const actionController = new ActionController(deviceManager, remoteController, appController);
  const scrcpyController = new ScrcpyController(deviceManager, adbLocator);
  const sideloadController = new SideloadController(deviceManager, adbClient);
  webRemoteServer = new WebRemoteServer({
    settings: new ElectronSettingsStore(),
    deviceManager,
    remoteController,
    appController,
    actionController
  });
  registerIpc({
    deviceManager,
    remoteController,
    appController,
    actionController,
    scrcpyController,
    sideloadController,
    webRemoteServer,
    adbLocator,
    adbClient,
    getMainWindow: () => mainWindow
  });
  await deviceManager.init().catch((error) => {
    console.error("Device manager init failed, continuing with empty runtime state.", error);
  });
  await webRemoteServer.init().catch((error) => {
    console.error("Phone remote server failed to start.", error);
  });
  await createMainWindow();
}
function ensureBootstrapped() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }
  bootstrapPromise = bootstrap().catch((error) => {
    console.error("Application bootstrap failed.", error);
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}
app.whenReady().then(() => {
  void ensureBootstrapped();
});
app.on("activate", () => {
  void ensureBootstrapped().then(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  }).catch((error) => {
    console.error("Could not restore application window.", error);
  });
});
app.on("window-all-closed", () => {
  deviceManager?.dispose();
  webRemoteServer?.dispose();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
