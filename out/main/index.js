import path from "node:path";
import fs$1 from "node:fs";
import { ipcMain, app, dialog, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import pkg from "node-apk";
import Store from "electron-store";
import { EventEmitter } from "node:events";
import { Bonjour } from "bonjour-service";
import { AndroidRemote, RemoteDirection } from "androidtv-remote";
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
  connectionStateChanged: "events.connectionStateChanged",
  devicesChanged: "events.devicesChanged"
};
function registerIpc(options) {
  const {
    deviceManager: deviceManager2,
    remoteController,
    appController,
    actionController,
    scrcpyController,
    sideloadController,
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
        const [manifest, resources] = await Promise.all([apk.getManifestInfo(), apk.getResources()]);
        const displayName = this.resolveAppLabel(manifest.applicationLabel, resources) ?? app2.displayName;
        const iconDataUrl = await this.resolveAppIconDataUrl(apk, manifest.applicationIcon, resources);
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
class AppController {
  constructor(deviceManager2, adbClient) {
    this.deviceManager = deviceManager2;
    this.adbClient = adbClient;
  }
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
      return null;
    }
    return this.deviceManager.withAdbAccess((serial) => this.adbClient.getForegroundApp(serial));
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
let mainWindow = null;
let deviceManager = null;
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
    backgroundColor: "#f4ede1",
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
  });
  await deviceManager.init().catch((error) => {
    console.error("Device manager init failed, continuing with empty runtime state.", error);
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
