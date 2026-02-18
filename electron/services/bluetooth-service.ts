import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type BluetoothEndpoint = 'ble' | 'classic';

type Dict = Record<string, unknown>;

export interface BluetoothActionRequest {
  endpoint: BluetoothEndpoint;
  action: string;
  payload?: unknown;
}

export interface BluetoothServiceEvent {
  endpoint: BluetoothEndpoint;
  type: string;
  payload: unknown;
}

export interface BluetoothDeviceInfo {
  id: string;
  address: string;
  name: string | null;
  rssi: number | null;
  connected: boolean;
  lastSeenAt: string;
  serviceUuids: string[];
  manufacturerDataHex: string | null;
}

interface ScanOptions {
  allowDuplicates: boolean;
  serviceUuids: string[];
}

interface AdapterStatus {
  adapter: 'noble' | 'classic' | 'unavailable';
  available: boolean;
  state: string;
  scanning: boolean;
  message?: string;
}

interface AdapterEvent {
  type: string;
  payload: unknown;
}

interface BluetoothAdapter {
  getStatus(): AdapterStatus;
  listDevices(): BluetoothDeviceInfo[];
  startScan(options: ScanOptions): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<BluetoothDeviceInfo>;
  disconnect(deviceId: string): Promise<void>;
  destroy(): Promise<void>;
}

class CommandError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

class UnsupportedBluetoothAdapter implements BluetoothAdapter {
  private readonly adapterName: AdapterStatus['adapter'];
  private readonly unavailableMessage: string;

  constructor(adapterName: AdapterStatus['adapter'], message: string) {
    this.adapterName = adapterName;
    this.unavailableMessage = message;
  }

  getStatus(): AdapterStatus {
    return {
      adapter: this.adapterName,
      available: false,
      state: 'unavailable',
      scanning: false,
      message: this.unavailableMessage,
    };
  }

  listDevices(): BluetoothDeviceInfo[] {
    return [];
  }

  async startScan(): Promise<void> {
    throw new CommandError('ADAPTER_UNAVAILABLE', this.unavailableMessage);
  }

  async stopScan(): Promise<void> {
    throw new CommandError('ADAPTER_UNAVAILABLE', this.unavailableMessage);
  }

  async connect(): Promise<BluetoothDeviceInfo> {
    throw new CommandError('ADAPTER_UNAVAILABLE', this.unavailableMessage);
  }

  async disconnect(): Promise<void> {
    throw new CommandError('ADAPTER_UNAVAILABLE', this.unavailableMessage);
  }

  async destroy(): Promise<void> {
    return Promise.resolve();
  }
}

interface NobleLike {
  state?: string;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  startScanningAsync?(serviceUuids?: string[], allowDuplicates?: boolean): Promise<void>;
  stopScanningAsync?(): Promise<void>;
  startScanning?(
    serviceUuids?: string[],
    allowDuplicates?: boolean,
    callback?: (error?: unknown) => void
  ): void;
  stopScanning?(callback?: (error?: unknown) => void): void;
}

interface NobleAdvertisement {
  localName?: string;
  serviceUuids?: string[];
  manufacturerData?: Buffer;
}

interface NoblePeripheral {
  id: string;
  address?: string;
  rssi?: number;
  state?: string;
  advertisement?: NobleAdvertisement;
  on(event: 'disconnect', listener: () => void): void;
  removeListener?(event: 'disconnect', listener: () => void): void;
  connect(callback: (error?: unknown) => void): void;
  disconnect(callback: (error?: unknown) => void): void;
}

interface ClassicBluetoothModuleLike {
  BluetoothSerialPort: new () => ClassicSerialPortLike;
}

interface ClassicSerialPortLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners?(event?: string): void;
  inquire(): void;
  findSerialPortChannel(
    address: string,
    success: (channel: number) => void,
    failure: () => void
  ): void;
  connect(
    address: string,
    channel: number,
    success: () => void,
    failure: (error?: unknown) => void
  ): void;
  close(): void;
}

class NobleBluetoothAdapter implements BluetoothAdapter {
  private readonly noble: NobleLike;
  private readonly emitEvent: (event: AdapterEvent) => void;
  private readonly peripherals = new Map<string, NoblePeripheral>();
  private readonly devices = new Map<string, BluetoothDeviceInfo>();
  private readonly disconnectListeners = new Map<string, () => void>();
  private scanning = false;
  private state = 'unknown';
  private readonly onStateChangeRef: (state: unknown) => void;
  private readonly onDiscoverRef: (peripheral: unknown) => void;

  constructor(noble: NobleLike, emitEvent: (event: AdapterEvent) => void) {
    this.noble = noble;
    this.emitEvent = emitEvent;
    this.state = typeof noble.state === 'string' ? noble.state : 'unknown';

    this.onStateChangeRef = (state: unknown) => {
      this.state = typeof state === 'string' ? state : 'unknown';
      this.emitEvent({
        type: 'bluetooth.state',
        payload: this.getStatus(),
      });
    };

    this.onDiscoverRef = (peripheral: unknown) => {
      if (!isNoblePeripheral(peripheral)) {
        return;
      }

      const mapped = this.mapPeripheral(peripheral);
      this.peripherals.set(mapped.id, peripheral);
      this.devices.set(mapped.id, mapped);
      this.emitEvent({
        type: 'device.discovered',
        payload: mapped,
      });
    };

    this.noble.on('stateChange', this.onStateChangeRef);
    this.noble.on('discover', this.onDiscoverRef);
  }

  getStatus(): AdapterStatus {
    return {
      adapter: 'noble',
      available: true,
      state: this.state,
      scanning: this.scanning,
    };
  }

  listDevices(): BluetoothDeviceInfo[] {
    return [...this.devices.values()].sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    );
  }

  async startScan(options: ScanOptions): Promise<void> {
    if (this.state !== 'poweredOn') {
      throw new CommandError(
        'ADAPTER_NOT_READY',
        `Bluetooth adapter state is "${this.state}". It must be "poweredOn" to scan.`
      );
    }

    await this.startScanningInternal(options);
    this.scanning = true;
    this.emitEvent({
      type: 'scan.state',
      payload: { active: true },
    });
  }

  async stopScan(): Promise<void> {
    await this.stopScanningInternal();
    this.scanning = false;
    this.emitEvent({
      type: 'scan.state',
      payload: { active: false },
    });
  }

  async connect(deviceId: string): Promise<BluetoothDeviceInfo> {
    const peripheral = this.peripherals.get(deviceId);
    if (!peripheral) {
      throw new CommandError('DEVICE_NOT_FOUND', `Unknown device id "${deviceId}".`);
    }

    await this.connectPeripheral(peripheral);
    this.attachDisconnectListener(peripheral);

    const mapped = this.mapPeripheral(peripheral, true);
    this.devices.set(mapped.id, mapped);
    this.emitEvent({
      type: 'device.updated',
      payload: mapped,
    });

    return mapped;
  }

  async disconnect(deviceId: string): Promise<void> {
    const peripheral = this.peripherals.get(deviceId);
    if (!peripheral) {
      throw new CommandError('DEVICE_NOT_FOUND', `Unknown device id "${deviceId}".`);
    }

    await this.disconnectPeripheral(peripheral);
    this.updateDeviceConnection(peripheral.id, false);
  }

  async destroy(): Promise<void> {
    try {
      await this.stopScan();
    } catch {
      // Ignore scan-stop failures during shutdown.
    }

    this.noble.off?.('stateChange', this.onStateChangeRef);
    this.noble.off?.('discover', this.onDiscoverRef);
    this.noble.removeListener?.('stateChange', this.onStateChangeRef);
    this.noble.removeListener?.('discover', this.onDiscoverRef);

    for (const [deviceId, peripheral] of this.peripherals.entries()) {
      const listener = this.disconnectListeners.get(deviceId);
      if (listener) {
        peripheral.removeListener?.('disconnect', listener);
      }
    }
  }

  private mapPeripheral(
    peripheral: NoblePeripheral,
    connectedOverride?: boolean
  ): BluetoothDeviceInfo {
    const previous = this.devices.get(peripheral.id);
    const advertisement = peripheral.advertisement ?? {};
    const connected =
      typeof connectedOverride === 'boolean'
        ? connectedOverride
        : peripheral.state === 'connected' || previous?.connected === true;

    const serviceUuids = Array.isArray(advertisement.serviceUuids)
      ? advertisement.serviceUuids
      : previous?.serviceUuids ?? [];

    return {
      id: peripheral.id,
      address: normalizeAddress(peripheral.address, peripheral.id),
      name: advertisement.localName ?? previous?.name ?? null,
      rssi: typeof peripheral.rssi === 'number' ? peripheral.rssi : previous?.rssi ?? null,
      connected,
      lastSeenAt: new Date().toISOString(),
      serviceUuids,
      manufacturerDataHex: advertisement.manufacturerData
        ? advertisement.manufacturerData.toString('hex')
        : previous?.manufacturerDataHex ?? null,
    };
  }

  private async startScanningInternal(options: ScanOptions): Promise<void> {
    if (typeof this.noble.startScanningAsync === 'function') {
      await this.noble.startScanningAsync(options.serviceUuids, options.allowDuplicates);
      return;
    }

    if (typeof this.noble.startScanning === 'function') {
      await new Promise<void>((resolve, reject) => {
        this.noble.startScanning?.(
          options.serviceUuids,
          options.allowDuplicates,
          (error?: unknown) => {
            if (error) {
              reject(toError(error));
              return;
            }

            resolve();
          }
        );
      });
      return;
    }

    throw new CommandError('ADAPTER_ERROR', 'Bluetooth adapter does not support scan start.');
  }

  private async stopScanningInternal(): Promise<void> {
    if (typeof this.noble.stopScanningAsync === 'function') {
      await this.noble.stopScanningAsync();
      return;
    }

    if (typeof this.noble.stopScanning === 'function') {
      await new Promise<void>((resolve, reject) => {
        this.noble.stopScanning?.((error?: unknown) => {
          if (error) {
            reject(toError(error));
            return;
          }

          resolve();
        });
      });
      return;
    }

    throw new CommandError('ADAPTER_ERROR', 'Bluetooth adapter does not support scan stop.');
  }

  private async connectPeripheral(peripheral: NoblePeripheral): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      peripheral.connect((error?: unknown) => {
        if (error) {
          reject(toError(error));
          return;
        }

        resolve();
      });
    });
  }

  private async disconnectPeripheral(peripheral: NoblePeripheral): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      peripheral.disconnect((error?: unknown) => {
        if (error) {
          reject(toError(error));
          return;
        }

        resolve();
      });
    });
  }

  private attachDisconnectListener(peripheral: NoblePeripheral): void {
    const existing = this.disconnectListeners.get(peripheral.id);
    if (existing) {
      peripheral.removeListener?.('disconnect', existing);
    }

    const listener = () => {
      this.updateDeviceConnection(peripheral.id, false);
    };

    this.disconnectListeners.set(peripheral.id, listener);
    peripheral.on('disconnect', listener);
  }

  private updateDeviceConnection(deviceId: string, connected: boolean): void {
    const existing = this.devices.get(deviceId);
    if (!existing) {
      return;
    }

    const next: BluetoothDeviceInfo = {
      ...existing,
      connected,
      lastSeenAt: new Date().toISOString(),
    };

    this.devices.set(deviceId, next);
    this.emitEvent({
      type: connected ? 'device.updated' : 'device.disconnected',
      payload: connected ? next : { id: deviceId },
    });
  }
}

class NodeBluetoothClassicAdapter implements BluetoothAdapter {
  private readonly ClassicSerialPort: new () => ClassicSerialPortLike;
  private readonly emitEvent: (event: AdapterEvent) => void;
  private readonly devices = new Map<string, BluetoothDeviceInfo>();
  private readonly connections = new Map<string, ClassicSerialPortLike>();
  private scanning = false;
  private scanningSession = 0;

  constructor(module: ClassicBluetoothModuleLike, emitEvent: (event: AdapterEvent) => void) {
    this.ClassicSerialPort = module.BluetoothSerialPort;
    this.emitEvent = emitEvent;
  }

  getStatus(): AdapterStatus {
    return {
      adapter: 'classic',
      available: true,
      state: 'ready',
      scanning: this.scanning,
    };
  }

  listDevices(): BluetoothDeviceInfo[] {
    return [...this.devices.values()].sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    );
  }

  async startScan(): Promise<void> {
    if (this.scanning) {
      return;
    }

    this.scanning = true;
    const currentSession = ++this.scanningSession;
    this.emitEvent({
      type: 'scan.state',
      payload: { active: true },
    });

    try {
      await this.runInquiry(currentSession);
      if (this.scanningSession === currentSession && this.scanning) {
        this.emitEvent({
          type: 'scan.completed',
          payload: { reason: 'inquiry-finished' },
        });
      }
    } finally {
      if (this.scanningSession === currentSession) {
        this.scanning = false;
        this.emitEvent({
          type: 'scan.state',
          payload: { active: false },
        });
      }
    }
  }

  async stopScan(): Promise<void> {
    this.scanningSession += 1;
    this.scanning = false;
    this.emitEvent({
      type: 'scan.state',
      payload: { active: false },
    });
  }

  async connect(deviceId: string): Promise<BluetoothDeviceInfo> {
    const existing = this.devices.get(deviceId);
    if (!existing) {
      throw new CommandError('DEVICE_NOT_FOUND', `Unknown device id "${deviceId}".`);
    }

    if (this.connections.has(deviceId)) {
      return {
        ...existing,
        connected: true,
      };
    }

    const port = new this.ClassicSerialPort();
    const channel = await this.findChannel(port, existing.address);
    await this.connectChannel(port, existing.address, channel);
    this.connections.set(deviceId, port);

    port.on('closed', () => {
      this.updateDeviceConnection(deviceId, false);
      this.connections.delete(deviceId);
    });
    port.on('failure', () => {
      this.updateDeviceConnection(deviceId, false);
      this.connections.delete(deviceId);
    });

    const updated = this.updateDeviceConnection(deviceId, true);
    return updated;
  }

  async disconnect(deviceId: string): Promise<void> {
    const port = this.connections.get(deviceId);
    if (!port) {
      const known = this.devices.get(deviceId);
      if (!known) {
        throw new CommandError('DEVICE_NOT_FOUND', `Unknown device id "${deviceId}".`);
      }

      this.updateDeviceConnection(deviceId, false);
      return;
    }

    try {
      port.close();
    } catch {
      // Ignore close failure and still mark disconnected.
    }

    this.connections.delete(deviceId);
    this.updateDeviceConnection(deviceId, false);
  }

  async destroy(): Promise<void> {
    await this.stopScan();

    for (const [deviceId, port] of this.connections.entries()) {
      try {
        port.close();
      } catch {
        // Ignore close failures during shutdown.
      }

      this.connections.delete(deviceId);
      this.updateDeviceConnection(deviceId, false);
    }
  }

  private async runInquiry(session: number): Promise<void> {
    const scanner = new this.ClassicSerialPort();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        scanner.removeAllListeners?.();
        if (error) {
          reject(toError(error));
          return;
        }

        resolve();
      };

      scanner.on('found', (addressArg: unknown, nameArg: unknown) => {
        if (session !== this.scanningSession) {
          return;
        }

        const address =
          typeof addressArg === 'string' && addressArg.trim().length > 0
            ? addressArg
            : '';
        if (!address) {
          return;
        }

        const name = typeof nameArg === 'string' ? nameArg : null;
        const existing = this.devices.get(address);
        const device: BluetoothDeviceInfo = {
          id: address,
          address,
          name: name ?? existing?.name ?? null,
          rssi: existing?.rssi ?? null,
          connected: existing?.connected ?? false,
          lastSeenAt: new Date().toISOString(),
          serviceUuids: [],
          manufacturerDataHex: null,
        };

        this.devices.set(address, device);
        this.emitEvent({
          type: 'device.discovered',
          payload: device,
        });
      });

      scanner.on('finished', () => {
        finish();
      });

      scanner.on('failure', (error?: unknown) => {
        finish(error ?? new Error('Classic bluetooth inquiry failed.'));
      });

      try {
        scanner.inquire();
      } catch (error) {
        finish(error);
      }
    });
  }

  private async findChannel(port: ClassicSerialPortLike, address: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      port.findSerialPortChannel(
        address,
        (channel) => {
          resolve(channel);
        },
        () => {
          reject(
            new CommandError(
              'CHANNEL_NOT_FOUND',
              `No RFCOMM channel found for device "${address}".`
            )
          );
        }
      );
    });
  }

  private async connectChannel(
    port: ClassicSerialPortLike,
    address: string,
    channel: number
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      port.connect(
        address,
        channel,
        () => {
          resolve();
        },
        (error?: unknown) => {
          reject(
            new CommandError(
              'CONNECT_FAILED',
              error instanceof Error
                ? error.message
                : `Failed to connect to "${address}" on channel ${channel}.`
            )
          );
        }
      );
    });
  }

  private updateDeviceConnection(deviceId: string, connected: boolean): BluetoothDeviceInfo {
    const existing = this.devices.get(deviceId);
    if (!existing) {
      throw new CommandError('DEVICE_NOT_FOUND', `Unknown device id "${deviceId}".`);
    }

    const next: BluetoothDeviceInfo = {
      ...existing,
      connected,
      lastSeenAt: new Date().toISOString(),
    };
    this.devices.set(deviceId, next);

    this.emitEvent({
      type: connected ? 'device.updated' : 'device.disconnected',
      payload: connected ? next : { id: deviceId },
    });

    return next;
  }
}

class MacOSClassicInfoAdapter implements BluetoothAdapter {
  private readonly emitEvent: (event: AdapterEvent) => void;
  private readonly devices = new Map<string, BluetoothDeviceInfo>();
  private scanning = false;

  constructor(emitEvent: (event: AdapterEvent) => void) {
    this.emitEvent = emitEvent;
  }

  getStatus(): AdapterStatus {
    return {
      adapter: 'classic',
      available: true,
      state: 'info-only',
      scanning: this.scanning,
      message:
        'macOS fallback mode: lists known/paired/connected classic devices only; connect/disconnect is not supported.',
    };
  }

  listDevices(): BluetoothDeviceInfo[] {
    return [...this.devices.values()].sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    );
  }

  async startScan(): Promise<void> {
    if (this.scanning) {
      return;
    }

    this.scanning = true;
    this.emitEvent({
      type: 'scan.state',
      payload: { active: true },
    });

    try {
      const snapshot = await readMacClassicSnapshot();
      for (const device of snapshot) {
        const previous = this.devices.get(device.id);
        this.devices.set(device.id, device);
        this.emitEvent({
          type: previous ? 'device.updated' : 'device.discovered',
          payload: device,
        });
      }

      this.emitEvent({
        type: 'scan.completed',
        payload: { count: snapshot.length, mode: 'macos-info-only' },
      });
    } finally {
      this.scanning = false;
      this.emitEvent({
        type: 'scan.state',
        payload: { active: false },
      });
    }
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
    this.emitEvent({
      type: 'scan.state',
      payload: { active: false },
    });
  }

  async connect(): Promise<BluetoothDeviceInfo> {
    throw new CommandError(
      'UNSUPPORTED_ACTION',
      'Classic connect is not supported in macOS fallback mode.'
    );
  }

  async disconnect(): Promise<void> {
    throw new CommandError(
      'UNSUPPORTED_ACTION',
      'Classic disconnect is not supported in macOS fallback mode.'
    );
  }

  async destroy(): Promise<void> {
    return Promise.resolve();
  }
}

export class BluetoothService {
  private bleAdapter: BluetoothAdapter;
  private classicAdapter: BluetoothAdapter;
  private readonly listeners = new Set<(event: BluetoothServiceEvent) => void>();

  constructor() {
    this.bleAdapter = this.createBleAdapter();
    this.classicAdapter = this.createClassicAdapter();
  }

  subscribe(listener: (event: BluetoothServiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async execute(request: BluetoothActionRequest): Promise<unknown> {
    const adapter = this.getAdapter(request.endpoint);
    switch (request.action) {
      case 'ping': {
        return {
          pong: true,
          endpoint: request.endpoint,
          at: new Date().toISOString(),
        };
      }
      case 'status.get': {
        return adapter.getStatus();
      }
      case 'devices.list': {
        return adapter.listDevices();
      }
      case 'scan.start': {
        const options = parseScanOptions(request.payload);
        await adapter.startScan(options);
        return { active: true };
      }
      case 'scan.stop': {
        await adapter.stopScan();
        return { active: false };
      }
      case 'device.connect': {
        const deviceId = requirePayloadString(request.payload, 'id');
        return adapter.connect(deviceId);
      }
      case 'device.disconnect': {
        const deviceId = requirePayloadString(request.payload, 'id');
        await adapter.disconnect(deviceId);
        return { id: deviceId, disconnected: true };
      }
      case 'printers.list': {
        assertClassicEndpoint(request.endpoint, request.action);
        return listSystemPrinters();
      }
      case 'printer.print': {
        assertClassicEndpoint(request.endpoint, request.action);
        const content = requirePayloadString(request.payload, 'content');
        const printer = readPayloadOptionalString(request.payload, 'printer');
        const title = readPayloadOptionalString(request.payload, 'title') ?? 'Bluetooth Print Job';
        return printWithSystemPrinter({
          content,
          printer,
          title,
        });
      }
      default: {
        throw new CommandError('UNKNOWN_ACTION', `Unsupported action "${request.action}".`);
      }
    }
  }

  async destroy(): Promise<void> {
    await this.bleAdapter.destroy();
    await this.classicAdapter.destroy();
  }

  private getAdapter(endpoint: BluetoothEndpoint): BluetoothAdapter {
    return endpoint === 'ble' ? this.bleAdapter : this.classicAdapter;
  }

  private emit(endpoint: BluetoothEndpoint, event: AdapterEvent): void {
    const wrapped: BluetoothServiceEvent = {
      endpoint,
      type: event.type,
      payload: event.payload,
    };
    for (const listener of this.listeners) {
      listener(wrapped);
    }
  }

  private createBleAdapter(): BluetoothAdapter {
    const require = createRequire(import.meta.url);
    try {
      const nobleModule = require('@abandonware/noble');
      const noble = (nobleModule?.default ?? nobleModule) as NobleLike;
      return new NobleBluetoothAdapter(noble, (event) => this.emit('ble', event));
    } catch {
      return new UnsupportedBluetoothAdapter(
        'unavailable',
        'BLE adapter unavailable. Install "@abandonware/noble" and restart.'
      );
    }
  }

  private createClassicAdapter(): BluetoothAdapter {
    if (process.platform === 'darwin') {
      return new MacOSClassicInfoAdapter((event) => this.emit('classic', event));
    }

    const require = createRequire(import.meta.url);
    try {
      const classicModule = require('node-bluetooth-serial-port') as ClassicBluetoothModuleLike;
      if (typeof classicModule?.BluetoothSerialPort !== 'function') {
        throw new Error('Invalid classic module shape.');
      }
      return new NodeBluetoothClassicAdapter(classicModule, (event) => this.emit('classic', event));
    } catch {
      return new UnsupportedBluetoothAdapter(
        'classic',
        'Bluetooth Classic adapter unavailable. Install "node-bluetooth-serial-port" (Linux/Windows) and restart.'
      );
    }
  }
}

export const bluetoothService = new BluetoothService();

function assertClassicEndpoint(endpoint: BluetoothEndpoint, action: string): void {
  if (endpoint !== 'classic') {
    throw new CommandError('UNSUPPORTED_ACTION', `"${action}" is only available on /classic.`);
  }
}

async function listSystemPrinters(): Promise<{
  defaultPrinter: string | null;
  printers: Array<{
    name: string;
    status: string;
    isDefault: boolean;
  }>;
}> {
  if (process.platform !== 'darwin') {
    throw new CommandError(
      'UNSUPPORTED_ACTION',
      'System printer listing is currently implemented for macOS only.'
    );
  }

  const output = await execFileText('/usr/bin/lpstat', ['-p', '-d']);
  const lines = output.split(/\r?\n/);

  let defaultPrinter: string | null = null;
  const printerStatuses = new Map<string, string>();

  for (const line of lines) {
    const defaultMatch = line.match(/^system default destination:\s+(.+)$/i);
    if (defaultMatch) {
      defaultPrinter = defaultMatch[1].trim();
      continue;
    }

    const printerMatch = line.match(/^printer\s+(\S+)\s*(.*)$/i);
    if (printerMatch) {
      const name = printerMatch[1].trim();
      const status = printerMatch[2]?.trim() || 'unknown';
      printerStatuses.set(name, status);
    }
  }

  const printers = [...printerStatuses.entries()].map(([name, status]) => ({
    name,
    status,
    isDefault: defaultPrinter === name,
  }));

  return {
    defaultPrinter,
    printers,
  };
}

async function printWithSystemPrinter(options: {
  content: string;
  printer?: string;
  title: string;
}): Promise<{
  queued: boolean;
  requestId: string | null;
  printer: string | null;
}> {
  if (process.platform !== 'darwin') {
    throw new CommandError(
      'UNSUPPORTED_ACTION',
      'System printer printing is currently implemented for macOS only.'
    );
  }

  const tempFile = join(
    tmpdir(),
    `bluetooth-print-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );
  await writeFile(tempFile, options.content, 'utf8');

  try {
    const args = ['-t', options.title];
    if (options.printer) {
      args.push('-d', options.printer);
    }
    args.push(tempFile);

    const output = await execFileText('/usr/bin/lp', args);
    const requestIdMatch = output.match(/request id is\s+(\S+)/i);
    const printerMatch = output.match(/^\s*request id is\s+([^-\s]+)-/i);

    return {
      queued: true,
      requestId: requestIdMatch?.[1] ?? null,
      printer: options.printer ?? printerMatch?.[1] ?? null,
    };
  } catch (error) {
    throw new CommandError(
      'PRINT_FAILED',
      error instanceof Error ? error.message : 'Failed to send print job.'
    );
  } finally {
    await unlink(tempFile).catch(() => {
      // Ignore cleanup failures.
    });
  }
}

async function readMacClassicSnapshot(): Promise<BluetoothDeviceInfo[]> {
  const now = new Date().toISOString();
  const devices = new Map<string, BluetoothDeviceInfo>();

  const plistData = await readJsonCommand('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    '/Library/Preferences/com.apple.Bluetooth.plist',
  ]);
  if (plistData) {
    collectClassicDevicesFromPlist(plistData, devices, now);
  }

  const profilerData = await readJsonCommand('/usr/sbin/system_profiler', [
    'SPBluetoothDataType',
    '-json',
  ]);
  if (profilerData) {
    collectClassicDevicesFromProfiler(profilerData, devices, now);
  }

  return [...devices.values()].sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt)
  );
}

async function readJsonCommand(command: string, args: string[]): Promise<unknown | null> {
  try {
    const output = await execFileText(command, args);
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      }
    );
  });
}

function collectClassicDevicesFromPlist(
  plistData: unknown,
  devices: Map<string, BluetoothDeviceInfo>,
  now: string
): void {
  if (!isDict(plistData) || !isDict(plistData.DeviceCache)) {
    return;
  }

  for (const [rawAddress, rawDetails] of Object.entries(plistData.DeviceCache)) {
    if (!isDict(rawDetails)) {
      continue;
    }

    const address =
      normalizeMacAddress(rawAddress) ??
      normalizeMacAddress(
        firstString(rawDetails, ['Address', 'address', 'DeviceAddress', 'device_address'])
      );
    if (!address) {
      continue;
    }

    upsertClassicDevice(
      devices,
      {
        id: address,
        address,
        name:
          firstString(rawDetails, ['Name', 'name', 'displayName', 'DefaultName']) ?? null,
        connected: firstBoolean(rawDetails, ['Connected', 'connected']) ?? false,
        lastSeenAt: now,
        rssi: firstNumber(rawDetails, ['RSSI', 'rssi']),
        serviceUuids: firstStringArray(rawDetails, ['Services', 'SupportedServices']),
      }
    );
  }
}

function collectClassicDevicesFromProfiler(
  profilerData: unknown,
  devices: Map<string, BluetoothDeviceInfo>,
  now: string
): void {
  walkDictionaries(profilerData, undefined, (dict, parentKey) => {
    const address = findAddressInDict(dict);
    if (!address) {
      return;
    }

    const name =
      firstString(dict, ['device_title', '_name', 'Name', 'name', 'device_name']) ??
      (parentKey && !normalizeMacAddress(parentKey) ? parentKey : null);

    const connected =
      firstBoolean(dict, [
        'device_isconnected',
        'device_connected',
        'Connected',
        'connected',
      ]) ?? false;

    upsertClassicDevice(
      devices,
      {
        id: address,
        address,
        name,
        connected,
        lastSeenAt: now,
        rssi: firstNumber(dict, ['device_rssi', 'RSSI', 'rssi']),
        serviceUuids: firstStringArray(dict, ['device_services', 'Services', 'serviceUuids']),
      }
    );
  });
}

function walkDictionaries(
  value: unknown,
  parentKey: string | undefined,
  callback: (dict: Dict, parentKey: string | undefined) => void
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkDictionaries(item, parentKey, callback);
    }
    return;
  }

  if (!isDict(value)) {
    return;
  }

  callback(value, parentKey);
  for (const [key, child] of Object.entries(value)) {
    walkDictionaries(child, key, callback);
  }
}

function findAddressInDict(value: Dict): string | null {
  const direct = firstString(value, [
    'device_address',
    'device_address_string',
    'Address',
    'address',
    'Bluetooth Address',
  ]);
  if (direct) {
    return normalizeMacAddress(direct);
  }

  for (const candidate of Object.values(value)) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const normalized = normalizeMacAddress(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeMacAddress(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }

  const dashed = trimmed.replace(/-/g, ':');
  if (/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(dashed)) {
    return dashed;
  }

  const packed = trimmed.replace(/[^0-9A-F]/g, '');
  if (/^[0-9A-F]{12}$/.test(packed)) {
    return packed.match(/.{1,2}/g)?.join(':') ?? null;
  }

  return null;
}

function upsertClassicDevice(
  devices: Map<string, BluetoothDeviceInfo>,
  next: Omit<BluetoothDeviceInfo, 'manufacturerDataHex'> & { manufacturerDataHex?: string | null }
): void {
  const existing = devices.get(next.id);
  const mergedServices = new Set([...(existing?.serviceUuids ?? []), ...next.serviceUuids]);

  const device: BluetoothDeviceInfo = {
    id: next.id,
    address: next.address,
    name: next.name ?? existing?.name ?? null,
    rssi: next.rssi ?? existing?.rssi ?? null,
    connected: next.connected || existing?.connected === true,
    lastSeenAt: next.lastSeenAt,
    serviceUuids: [...mergedServices],
    manufacturerDataHex: next.manufacturerDataHex ?? existing?.manufacturerDataHex ?? null,
  };

  devices.set(next.id, device);
}

function parseScanOptions(payload: unknown): ScanOptions {
  if (!isDict(payload)) {
    return {
      allowDuplicates: true,
      serviceUuids: [],
    };
  }

  const allowDuplicates =
    typeof payload.allowDuplicates === 'boolean' ? payload.allowDuplicates : true;

  const serviceUuids = Array.isArray(payload.serviceUuids)
    ? payload.serviceUuids.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    allowDuplicates,
    serviceUuids,
  };
}

function requirePayloadString(payload: unknown, key: string): string {
  if (!isDict(payload) || typeof payload[key] !== 'string') {
    throw new CommandError(
      'INVALID_PAYLOAD',
      `Payload must include a string "${key}".`
    );
  }

  return payload[key] as string;
}

function readPayloadOptionalString(payload: unknown, key: string): string | undefined {
  if (!isDict(payload)) {
    return undefined;
  }

  return typeof payload[key] === 'string' ? (payload[key] as string) : undefined;
}

function firstString(value: Dict, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function firstNumber(value: Dict, keys: string[]): number | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function firstBoolean(value: Dict, keys: string[]): boolean | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'boolean') {
      return candidate;
    }
    if (typeof candidate === 'number') {
      return candidate !== 0;
    }
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (normalized === 'true' || normalized === 'yes' || normalized === 'connected') {
        return true;
      }
      if (normalized === 'false' || normalized === 'no' || normalized === 'disconnected') {
        return false;
      }
    }
  }

  return null;
}

function firstStringArray(value: Dict, keys: string[]): string[] {
  for (const key of keys) {
    const candidate = value[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    const parsed = candidate.filter((item): item is string => typeof item === 'string');
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

function normalizeAddress(address: string | undefined, fallback: string): string {
  if (address && address.trim().length > 0 && address !== 'unknown') {
    return address;
  }
  return fallback;
}

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null;
}

function isNoblePeripheral(value: unknown): value is NoblePeripheral {
  if (!isDict(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.connect === 'function' &&
    typeof value.disconnect === 'function'
  );
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
