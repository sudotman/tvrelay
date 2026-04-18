import path from "node:path";
import fs$1 from "node:fs";
import { ipcMain, app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Store from "electron-store";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { Bonjour } from "bonjour-service";
import { AndroidRemote, RemoteDirection } from "androidtv-remote";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const IPC_CHANNELS = {
  devicesList: "devices.list",
  devicesSave: "devices.save",
  devicesPair: "devices.pair",
  devicesBeginNativePairing: "devices.beginNativePairing",
  devicesCompleteNativePairing: "devices.completeNativePairing",
  devicesDiscoverNative: "devices.discoverNative",
  devicesConnect: "devices.connect",
  devicesDisconnect: "devices.disconnect",
  remoteSendKey: "remote.sendKey",
  remoteSendText: "remote.sendText",
  appsList: "apps.list",
  appsLaunch: "apps.launch",
  diagnosticsGetStatus: "diagnostics.getStatus",
  connectionStateChanged: "events.connectionStateChanged",
  devicesChanged: "events.devicesChanged"
};
function registerIpc(options) {
  const { deviceManager: deviceManager2, remoteController, appController, adbLocator, adbClient, getMainWindow } = options;
  ipcMain.handle(IPC_CHANNELS.devicesList, () => deviceManager2.listDevices());
  ipcMain.handle(IPC_CHANNELS.devicesSave, (_event, input) => deviceManager2.saveDevice(input));
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
  ipcMain.handle(IPC_CHANNELS.devicesConnect, (_event, input) => deviceManager2.connectDevice(input));
  ipcMain.handle(IPC_CHANNELS.devicesDisconnect, () => deviceManager2.disconnectActiveDevice());
  ipcMain.handle(IPC_CHANNELS.remoteSendKey, (_event, command) => remoteController.sendCommand(command));
  ipcMain.handle(IPC_CHANNELS.remoteSendText, (_event, input) => remoteController.sendText(input.text));
  ipcMain.handle(IPC_CHANNELS.appsList, () => appController.listApps());
  ipcMain.handle(IPC_CHANNELS.appsLaunch, (_event, packageName) => appController.launchApp(packageName));
  ipcMain.handle(IPC_CHANNELS.diagnosticsGetStatus, async () => {
    const adbInfo = await adbLocator.locate();
    const version = adbInfo.available ? await adbClient.version() : void 0;
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
      capabilities: deviceManager2.getCapabilities()
    };
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
function parseAdbVersion(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).find((line) => line.toLowerCase().startsWith("android debug bridge version")) ?? "Unknown";
}
function parseAdbDevices(output) {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.toLowerCase().startsWith("list of devices attached")).map((line) => {
    const [serial, state] = line.split(/\s+/);
    return serial && state ? { serial, state } : null;
  }).filter((item) => item !== null);
}
function humanizePackage(packageName) {
  return packageName.split(".").at(-1).replace(/[-_]/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
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
const execFileAsync = promisify(execFile);
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
    for (const { androidCategory, category } of categories) {
      const { stdout } = await this.runSerial(serial, [
        "shell",
        "cmd",
        "package",
        "query-intent-activities",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        androidCategory
      ]);
      for (const app2 of parseLaunchableApps(stdout, category)) {
        if (!appsByPackage.has(app2.packageName) || category === "leanback") {
          appsByPackage.set(app2.packageName, app2);
        }
      }
    }
    return [...appsByPackage.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
  }
  async launchApp(serial, app2) {
    await this.runSerial(serial, ["shell", "am", "start", "-n", app2.activity]);
  }
  async runSerial(serial, args, options) {
    return this.runRaw(["-s", serial, ...args], options);
  }
  async runRaw(args, options) {
    try {
      return await execFileAsync(this.adbPath, args, {
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
function canUseNative(device) {
  return Boolean(device.nativeRemote);
}
function canUseAdb(device) {
  return device.adbEnabled !== false;
}
function getBackendOrder(device) {
  const preferred = device.preferredBackend ?? "adb";
  if (preferred === "native") {
    return ["native"];
  }
  if (preferred === "adb") {
    return ["adb"];
  }
  return ["native", "adb"];
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
    this.savedDevices = snapshot.savedDevices.map((device) => ({
      ...device,
      connectPort: device.connectPort ?? 5555,
      mode: device.mode ?? "connect",
      preferredBackend: device.preferredBackend ?? "adb",
      adbEnabled: device.adbEnabled ?? true
    }));
    this.activeDeviceId = snapshot.activeDeviceId;
    this.nativeRemoteService.on("unpaired", (message) => {
      const activeDevice = this.getActiveDevice();
      this.activeBackend = null;
      this.updateConnectionState({
        status: "error",
        deviceId: activeDevice?.id,
        message
      });
    });
    this.emitDevicesChanged();
    if (this.getActiveDevice()) {
      await this.attemptReconnect();
    }
    this.healthCheckTimer = setInterval(() => {
      void this.performHealthCheck();
    }, 7e3);
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
    const adbFallback = Boolean(activeDevice && canUseAdb(activeDevice));
    return {
      nativeRemote: Boolean(activeDevice && canUseNative(activeDevice)),
      adbFallback,
      typing: this.activeBackend === "adb" || adbFallback,
      apps: this.activeBackend === "adb" || adbFallback
    };
  }
  async discoverNativeDevices() {
    return this.nativeRemoteService.discoverDevices();
  }
  async saveDevice(input) {
    const existing = input.id ? this.savedDevices.find((item) => item.id === input.id) ?? null : null;
    const device = this.normalizeDevice({
      ...existing,
      ...input,
      id: input.id ?? existing?.id ?? randomUUID()
    });
    this.savedDevices = this.savedDevices.filter((item) => item.id !== device.id);
    this.savedDevices.push(device);
    this.persist();
    this.emitDevicesChanged();
    return device;
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
    this.updateConnectionState({
      status: "pairing",
      backend: "native",
      deviceId: saved.id,
      message: `Start the pairing prompt on ${saved.name}, then enter the code shown on the TV.`
    });
    const result = await this.nativeRemoteService.connect(saved);
    if (result.status === "pairing") {
      this.activeBackend = null;
      return this.connectionState;
    }
    return this.finalizeNativeConnection(saved, result.certificate);
  }
  async completeNativePairing(code) {
    const activeDevice = this.getActiveDevice();
    if (!activeDevice) {
      throw new Error("No TV is currently waiting for a native remote pairing code.");
    }
    const certificate = await this.nativeRemoteService.completePairing(code);
    return this.finalizeNativeConnection(activeDevice, certificate);
  }
  async pairAndConnect(input) {
    this.updateConnectionState({
      status: "pairing",
      backend: "adb",
      message: `Pairing ADB with ${input.host}:${input.pairPort}...`
    });
    await this.adbClient.pair(input.host, input.pairPort, input.code);
    const saved = await this.saveDevice({
      name: input.name,
      host: input.host,
      connectPort: input.connectPort,
      pairPort: input.pairPort,
      mode: input.mode ?? "pair",
      preferredBackend: input.preferredBackend,
      nativeRemote: input.nativeRemote,
      adbEnabled: input.adbEnabled ?? true
    });
    return this.connectViaAdb(saved);
  }
  async connectDevice(input) {
    const existing = input.id ? this.savedDevices.find((device) => device.id === input.id) ?? null : null;
    const baseDevice = existing ? this.normalizeDevice({
      ...existing,
      ...input,
      id: existing.id
    }) : this.normalizeDevice({
      id: input.id ?? randomUUID(),
      name: input.name?.trim() || input.host || "Android TV",
      host: input.host,
      connectPort: input.connectPort,
      pairPort: input.pairPort,
      mode: input.mode,
      preferredBackend: input.preferredBackend,
      nativeRemote: input.nativeRemote,
      adbEnabled: input.adbEnabled
    });
    this.activeDeviceId = baseDevice.id;
    this.persist();
    let nativeError = null;
    for (const backend of getBackendOrder(baseDevice)) {
      if (backend === "native" && canUseNative(baseDevice)) {
        try {
          const result = await this.connectViaNative(baseDevice);
          if (result.status === "pairing") {
            return this.connectionState;
          }
          return result;
        } catch (error) {
          nativeError = error instanceof Error ? error : new Error("Native remote connection failed.");
        }
      }
      if (backend === "adb" && canUseAdb(baseDevice)) {
        try {
          return await this.connectViaAdb(baseDevice, nativeError);
        } catch (error) {
          if (nativeError) {
            throw new Error(
              `${nativeError.message} ADB fallback also failed: ${error instanceof Error ? error.message : "Unknown error."}`
            );
          }
          throw error;
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
    if (this.activeBackend === "native") {
      this.nativeRemoteService.disconnect();
    }
    if (this.activeBackend === "adb" && activeDevice) {
      await this.adbClient.disconnect(buildSerial(activeDevice));
    }
    this.activeBackend = null;
    this.updateConnectionState({
      status: "disconnected",
      deviceId: activeDevice?.id,
      message: activeDevice ? `Disconnected from ${activeDevice.name}.` : "No device connected."
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
        return this.connectionState;
      }
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
        this.updateConnectionState({
          ...liveState,
          backend: "adb"
        });
        return this.attemptReconnect();
      } catch (error) {
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
    await this.adbClient.connect(activeDevice.host, activeDevice.connectPort);
    const state = await this.adbClient.getConnectionState(activeDevice);
    if (state.status !== "connected") {
      throw new Error("ADB fallback is not ready for this TV yet. Pair or reconnect ADB in Setup first.");
    }
    return callback(buildSerial(activeDevice));
  }
  async connectViaNative(device) {
    this.updateConnectionState({
      status: "connecting",
      backend: "native",
      deviceId: device.id,
      message: `Connecting to ${device.name} via native remote...`
    });
    const result = await this.nativeRemoteService.connect(device);
    if (result.status === "pairing") {
      this.activeBackend = null;
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
    this.updateConnectionState({
      status: "connecting",
      backend: "adb",
      deviceId: device.id,
      message: nativeError ? `${nativeError.message} Falling back to ADB...` : `Connecting to ${device.name} via ADB...`
    });
    await this.adbClient.connect(device.host, device.connectPort);
    const nextState = await this.adbClient.getConnectionState(device);
    if (nextState.status !== "connected") {
      this.updateConnectionState({
        ...nextState,
        backend: "adb"
      });
      return this.connectionState;
    }
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
    saved.lastConnectedAt = (/* @__PURE__ */ new Date()).toISOString();
    saved.lastConnectedBackend = "adb";
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
    saved.lastConnectedAt = (/* @__PURE__ */ new Date()).toISOString();
    saved.lastConnectedBackend = "native";
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
    return {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      host: input.host.trim(),
      connectPort: input.connectPort ?? 5555,
      pairPort: input.pairPort,
      mode: input.mode ?? "connect",
      preferredBackend: input.preferredBackend ?? (input.nativeRemote ? "auto" : "adb"),
      adbEnabled: input.adbEnabled ?? true,
      nativeRemote: input.nativeRemote,
      lastConnectedAt: input.lastConnectedAt,
      lastConnectedBackend: input.lastConnectedBackend
    };
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
class RemoteController {
  constructor(deviceManager2, adbClient, nativeRemoteService) {
    this.deviceManager = deviceManager2;
    this.adbClient = adbClient;
    this.nativeRemoteService = nativeRemoteService;
  }
  async sendCommand(command) {
    const activeDevice = this.deviceManager.getActiveDevice();
    if (!activeDevice) {
      throw new Error("Connect to a TV before using the remote.");
    }
    if (this.deviceManager.getActiveBackend() === "native") {
      this.nativeRemoteService.sendKey(KEYCODES[command]);
      return;
    }
    const serial = buildSerial(activeDevice);
    await this.adbClient.sendKey(serial, KEYCODES[command]);
  }
  async sendText(text) {
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.sendText(serial, text));
  }
}
class AppController {
  constructor(deviceManager2, adbClient) {
    this.deviceManager = deviceManager2;
    this.adbClient = adbClient;
  }
  async listApps() {
    return this.deviceManager.withAdbAccess((serial) => this.adbClient.listLaunchableApps(serial));
  }
  async launchApp(packageName) {
    const apps = await this.deviceManager.withAdbAccess((serial) => this.adbClient.listLaunchableApps(serial));
    const app2 = apps.find((item) => item.packageName === packageName);
    if (!app2) {
      throw new Error("Selected app is no longer launchable on this TV.");
    }
    await this.deviceManager.withAdbAccess((serial) => this.adbClient.launchApp(serial, app2));
  }
}
const CLIENT_NAME = "Android TV Remote Desktop";
const DISCOVERY_TIMEOUT_MS = 4e3;
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
      const cleanup = () => {
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
      const cleanup = () => {
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
let mainWindow = null;
let deviceManager = null;
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
  await deviceManager.init();
  const remoteController = new RemoteController(deviceManager, adbClient, nativeRemoteService);
  const appController = new AppController(deviceManager, adbClient);
  registerIpc({
    deviceManager,
    remoteController,
    appController,
    adbLocator,
    adbClient,
    getMainWindow: () => mainWindow
  });
  await createMainWindow();
}
app.whenReady().then(() => {
  void bootstrap();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});
app.on("window-all-closed", () => {
  deviceManager?.dispose();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
