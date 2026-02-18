import { createRequire } from 'node:module';

export interface BleActionRequest {
  action: string;
  payload?: unknown;
}

export interface BleEvent {
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

type Dict = Record<string, unknown>;

interface ScanOptions {
  allowDuplicates: boolean;
  serviceUuids: string[];
}

type DataEncoding = 'utf8' | 'base64' | 'hex';

interface BleDataSendRequest {
  deviceId: string;
  serviceUuid: string;
  characteristicUuid: string;
  data: Buffer;
  withResponse: boolean;
  chunkSize: number;
}

interface BleDataSendResult {
  id: string;
  serviceUuid: string;
  characteristicUuid: string;
  bytes: number;
  chunks: number;
  withResponse: boolean;
}

interface AdapterStatus {
  adapter: 'noble' | 'unavailable';
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
  sendData(request: BleDataSendRequest): Promise<BleDataSendResult>;
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
  private readonly unavailableMessage: string;

  constructor(message: string) {
    this.unavailableMessage = message;
  }

  getStatus(): AdapterStatus {
    return {
      adapter: 'unavailable',
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

  async sendData(): Promise<BleDataSendResult> {
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
  discoverSomeServicesAndCharacteristics?(
    serviceUuids: string[],
    characteristicUuids: string[],
    callback: (
      error?: unknown,
      services?: unknown[],
      characteristics?: NobleCharacteristic[]
    ) => void
  ): void;
  discoverAllServicesAndCharacteristics?(
    callback: (
      error?: unknown,
      services?: unknown[],
      characteristics?: NobleCharacteristic[]
    ) => void
  ): void;
}

interface NobleCharacteristic {
  uuid: string;
  serviceUuid?: string;
  _serviceUuid?: string;
  write(data: Buffer, withoutResponse: boolean, callback: (error?: unknown) => void): void;
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

  async sendData(request: BleDataSendRequest): Promise<BleDataSendResult> {
    const peripheral = this.peripherals.get(request.deviceId);
    if (!peripheral) {
      throw new CommandError('DEVICE_NOT_FOUND', `Unknown device id "${request.deviceId}".`);
    }

    await this.ensurePeripheralConnected(peripheral);

    const characteristic = await this.findCharacteristic(
      peripheral,
      request.serviceUuid,
      request.characteristicUuid
    );

    const chunks = splitBuffer(request.data, request.chunkSize);
    for (const chunk of chunks) {
      await this.writeCharacteristic(characteristic, chunk, request.withResponse);
    }

    const result: BleDataSendResult = {
      id: request.deviceId,
      serviceUuid: request.serviceUuid,
      characteristicUuid: request.characteristicUuid,
      bytes: request.data.length,
      chunks: chunks.length,
      withResponse: request.withResponse,
    };

    this.emitEvent({
      type: 'data.sent',
      payload: result,
    });

    return result;
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

  private async ensurePeripheralConnected(peripheral: NoblePeripheral): Promise<void> {
    if (peripheral.state === 'connected') {
      return;
    }

    await this.connectPeripheral(peripheral);
    this.attachDisconnectListener(peripheral);

    const mapped = this.mapPeripheral(peripheral, true);
    this.devices.set(mapped.id, mapped);
    this.emitEvent({
      type: 'device.updated',
      payload: mapped,
    });
  }

  private async findCharacteristic(
    peripheral: NoblePeripheral,
    serviceUuid: string,
    characteristicUuid: string
  ): Promise<NobleCharacteristic> {
    if (typeof peripheral.discoverSomeServicesAndCharacteristics === 'function') {
      const characteristics = await new Promise<NobleCharacteristic[]>((resolve, reject) => {
        peripheral.discoverSomeServicesAndCharacteristics?.(
          [serviceUuid],
          [characteristicUuid],
          (error?: unknown, _services?: unknown[], discovered?: NobleCharacteristic[]) => {
            if (error) {
              reject(toError(error));
              return;
            }
            resolve(Array.isArray(discovered) ? discovered.filter(isNobleCharacteristic) : []);
          }
        );
      });

      const byUuid = characteristics.find(
        (candidate) => normalizeUuid(candidate.uuid) === characteristicUuid
      );
      if (byUuid) {
        return byUuid;
      }
    }

    if (typeof peripheral.discoverAllServicesAndCharacteristics === 'function') {
      const characteristics = await new Promise<NobleCharacteristic[]>((resolve, reject) => {
        peripheral.discoverAllServicesAndCharacteristics?.(
          (error?: unknown, _services?: unknown[], discovered?: NobleCharacteristic[]) => {
            if (error) {
              reject(toError(error));
              return;
            }
            resolve(Array.isArray(discovered) ? discovered.filter(isNobleCharacteristic) : []);
          }
        );
      });

      const byServiceAndUuid = characteristics.find((candidate) => {
        const candidateService =
          candidate.serviceUuid ??
          (typeof candidate._serviceUuid === 'string' ? candidate._serviceUuid : '');
        return (
          normalizeUuid(candidate.uuid) === characteristicUuid &&
          normalizeUuid(candidateService) === serviceUuid
        );
      });
      if (byServiceAndUuid) {
        return byServiceAndUuid;
      }
    }

    throw new CommandError(
      'CHARACTERISTIC_NOT_FOUND',
      `Cannot find BLE characteristic "${characteristicUuid}" on service "${serviceUuid}".`
    );
  }

  private async writeCharacteristic(
    characteristic: NobleCharacteristic,
    data: Buffer,
    withResponse: boolean
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      characteristic.write(data, !withResponse, (error?: unknown) => {
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

export class BleBluetoothService {
  private readonly adapter: BluetoothAdapter;
  private readonly listeners = new Set<(event: BleEvent) => void>();

  constructor() {
    this.adapter = this.createAdapter();
  }

  subscribe(listener: (event: BleEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async execute(request: BleActionRequest): Promise<unknown> {
    switch (request.action) {
      case 'ping': {
        return {
          pong: true,
          endpoint: 'ble',
          at: new Date().toISOString(),
        };
      }
      case 'status.get': {
        return this.adapter.getStatus();
      }
      case 'devices.list': {
        return this.adapter.listDevices();
      }
      case 'scan.start': {
        const options = parseScanOptions(request.payload);
        await this.adapter.startScan(options);
        return { active: true };
      }
      case 'scan.stop': {
        await this.adapter.stopScan();
        return { active: false };
      }
      case 'device.connect': {
        const deviceId = requirePayloadString(request.payload, 'id');
        return this.adapter.connect(deviceId);
      }
      case 'device.disconnect': {
        const deviceId = requirePayloadString(request.payload, 'id');
        await this.adapter.disconnect(deviceId);
        return { id: deviceId, disconnected: true };
      }
      case 'data.send': {
        const sendRequest = parseDataSendRequest(request.payload);
        return this.adapter.sendData(sendRequest);
      }
      default: {
        throw new CommandError('UNKNOWN_ACTION', `Unsupported BLE action "${request.action}".`);
      }
    }
  }

  async destroy(): Promise<void> {
    await this.adapter.destroy();
  }

  private createAdapter(): BluetoothAdapter {
    const require = createRequire(import.meta.url);
    try {
      const nobleModule = require('@abandonware/noble');
      const noble = (nobleModule?.default ?? nobleModule) as NobleLike;
      return new NobleBluetoothAdapter(noble, (event) => this.emit(event));
    } catch {
      return new UnsupportedBluetoothAdapter(
        'BLE adapter unavailable. Install "@abandonware/noble" and restart.'
      );
    }
  }

  private emit(event: AdapterEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const bleBluetoothService = new BleBluetoothService();

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
    ? payload.serviceUuids.filter(
        (value: unknown): value is string => typeof value === 'string'
      )
    : [];

  return {
    allowDuplicates,
    serviceUuids,
  };
}

function requirePayloadString(payload: unknown, key: string): string {
  if (!isDict(payload) || typeof payload[key] !== 'string') {
    throw new CommandError('INVALID_PAYLOAD', `Payload must include a string "${key}".`);
  }

  return payload[key] as string;
}

function normalizeAddress(address: string | undefined, fallback: string): string {
  if (address && address.trim().length > 0 && address !== 'unknown') {
    return address;
  }
  return fallback;
}

function normalizeUuid(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-f]/g, '');
}

function splitBuffer(value: Buffer, chunkSize: number): Buffer[] {
  if (value.length === 0) {
    return [];
  }

  const chunks: Buffer[] = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.subarray(offset, Math.min(value.length, offset + chunkSize)));
  }
  return chunks;
}

function parseDataSendRequest(payload: unknown): BleDataSendRequest {
  if (!isDict(payload)) {
    throw new CommandError('INVALID_PAYLOAD', 'BLE data.send payload must be an object.');
  }

  const deviceId = requirePayloadString(payload, 'id');
  const rawServiceUuid = requirePayloadString(payload, 'serviceUuid');
  const rawCharacteristicUuid = requirePayloadString(payload, 'characteristicUuid');
  const serviceUuid = normalizeUuid(rawServiceUuid);
  const characteristicUuid = normalizeUuid(rawCharacteristicUuid);
  if (!serviceUuid || !characteristicUuid) {
    throw new CommandError(
      'INVALID_PAYLOAD',
      'BLE data.send requires valid serviceUuid and characteristicUuid.'
    );
  }

  const encoding = parseEncoding(payload.encoding);
  let data = parseDataBuffer(payload, encoding);
  const appendNewline =
    typeof payload.appendNewline === 'boolean' ? payload.appendNewline : false;
  if (appendNewline) {
    data = Buffer.concat([data, Buffer.from('\n', 'utf8')]);
  }
  if (data.length === 0) {
    throw new CommandError('INVALID_PAYLOAD', 'BLE data.send payload cannot be empty.');
  }

  const withResponse =
    typeof payload.withResponse === 'boolean' ? payload.withResponse : true;
  const chunkSizeRaw = readOptionalPayloadNumber(payload, 'chunkSize');
  const chunkSize = Number.isInteger(chunkSizeRaw)
    ? Math.min(Math.max(chunkSizeRaw as number, 20), 512)
    : 180;

  return {
    deviceId,
    serviceUuid,
    characteristicUuid,
    data,
    withResponse,
    chunkSize,
  };
}

function parseDataBuffer(payload: Dict, encoding: DataEncoding): Buffer {
  if (Array.isArray(payload.bytes)) {
    const bytes = payload.bytes;
    const validBytes = bytes.every(
      (entry) =>
        typeof entry === 'number' &&
        Number.isInteger(entry) &&
        entry >= 0 &&
        entry <= 255
    );
    if (!validBytes) {
      throw new CommandError(
        'INVALID_PAYLOAD',
        'payload.bytes must be an array of integers between 0 and 255.'
      );
    }

    return Buffer.from(bytes);
  }

  const content = requirePayloadString(payload, 'content');
  try {
    return Buffer.from(content, encoding);
  } catch {
    throw new CommandError(
      'INVALID_PAYLOAD',
      `Unable to decode BLE print content using encoding "${encoding}".`
    );
  }
}

function parseEncoding(value: unknown): DataEncoding {
  if (value === undefined) {
    return 'utf8';
  }
  if (value === 'utf8' || value === 'base64' || value === 'hex') {
    return value;
  }
  throw new CommandError('INVALID_PAYLOAD', 'encoding must be one of: utf8, base64, hex.');
}

function readOptionalPayloadNumber(payload: Dict, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' ? value : undefined;
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

function isNobleCharacteristic(value: unknown): value is NobleCharacteristic {
  if (!isDict(value)) {
    return false;
  }

  return typeof value.uuid === 'string' && typeof value.write === 'function';
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
