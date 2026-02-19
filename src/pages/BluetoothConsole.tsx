import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bluetooth,
  Link,
  Play,
  Plug,
  Printer,
  RefreshCcw,
  Square,
  Unplug,
} from 'lucide-react';
import { bleBluetoothApi, type BleEvent } from '../api/bluetooth-ble-api';

interface DeviceItem {
  id: string;
  address: string;
  name: string | null;
  connected: boolean;
}

interface ActionResponse {
  ok: boolean;
  endpoint: 'ble';
  action: string;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

const LOG_LIMIT = 140;

export default function BluetoothConsole() {
  const navigate = useNavigate();

  const [bleDevices, setBleDevices] = useState<DeviceItem[]>([]);
  const [bleSelectedDeviceId, setBleSelectedDeviceId] = useState('');
  const [bleStatus, setBleStatus] = useState<unknown>(null);

  const [allowDuplicates, setAllowDuplicates] = useState(true);
  const [serviceUuids, setServiceUuids] = useState('');
  const [bleDataServiceUuid, setBleDataServiceUuid] = useState('');
  const [bleDataCharacteristicUuid, setBleDataCharacteristicUuid] = useState('');
  const [bleDataEncoding, setBleDataEncoding] = useState<'utf8' | 'hex' | 'base64'>('utf8');
  const [bleDataWithResponse, setBleDataWithResponse] = useState(true);
  const [bleDataChunkSize, setBleDataChunkSize] = useState('180');
  const [bleDataContent, setBleDataContent] = useState('Hello from BLE device');

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = bleBluetoothApi.onEvent((event) => {
      pushLog(`[event:ble] ${event.type} ${safeJson(event.payload)}`);
      applyBleEvent(event);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const sortedBleDevices = useMemo(() => sortDevices(bleDevices), [bleDevices]);

  const invokeBle = async (action: string, payload?: unknown): Promise<ActionResponse> => {
    setBusyAction(`ble:${action}`);
    try {
      const response = (await bleBluetoothApi.invoke({ action, payload })) as ActionResponse;
      handleActionResponse(response);
      if (response.ok) {
        if (action === 'devices.list' && Array.isArray(response.payload)) {
          setBleDevices(fromUnknownDevices(response.payload));
        }
        if (action === 'status.get') {
          setBleStatus(response.payload ?? null);
        }
      }
      return response;
    } finally {
      setBusyAction(null);
    }
  };

  const onBleScanStart = () => {
    const parsedServiceUuids = serviceUuids
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    void invokeBle('scan.start', {
      allowDuplicates,
      serviceUuids: parsedServiceUuids,
    });
  };

  const onBleConnect = () => {
    if (!bleSelectedDeviceId) {
      alert('Select BLE device first.');
      return;
    }

    void invokeBle('device.connect', { id: bleSelectedDeviceId });
  };

  const onBleDisconnect = () => {
    if (!bleSelectedDeviceId) {
      alert('Select BLE device first.');
      return;
    }

    void invokeBle('device.disconnect', { id: bleSelectedDeviceId });
  };

  const onBleSendData = () => {
    if (!bleSelectedDeviceId) {
      alert('Select BLE device first.');
      return;
    }
    if (!bleDataServiceUuid.trim() || !bleDataCharacteristicUuid.trim()) {
      alert('Fill BLE service UUID and characteristic UUID.');
      return;
    }
    if (!bleDataContent.trim()) {
      alert('BLE data payload cannot be empty.');
      return;
    }

    const parsedChunkSize = Number.parseInt(bleDataChunkSize, 10);
    const chunkSize =
      Number.isFinite(parsedChunkSize) && parsedChunkSize > 0 ? parsedChunkSize : undefined;

    void invokeBle('data.send', {
      id: bleSelectedDeviceId,
      serviceUuid: bleDataServiceUuid.trim(),
      characteristicUuid: bleDataCharacteristicUuid.trim(),
      content: bleDataContent,
      encoding: bleDataEncoding,
      withResponse: bleDataWithResponse,
      chunkSize,
    });
  };

  const applyBleEvent = (event: BleEvent) => {
    if (event.type === 'device.discovered' || event.type === 'device.updated') {
      if (!isDeviceLike(event.payload)) {
        return;
      }

      const device = normalizeDevice(event.payload);
      setBleDevices((prev) => upsertDevice(prev, device));
      return;
    }

    if (event.type === 'device.disconnected' && isDeviceIdPayload(event.payload)) {
      const { id } = event.payload;
      setBleDevices((prev) => markDisconnected(prev, id));
    }
  };

  const handleActionResponse = (response: ActionResponse) => {
    if (response.ok) {
      pushLog(`[ok:${response.endpoint}] ${response.action} ${safeJson(response.payload)}`);
      return;
    }

    pushLog(
      `[error:${response.endpoint}] ${response.action} ${response.error?.code ?? 'UNKNOWN'} ${response.error?.message ?? ''}`
    );
  };

  const pushLog = (line: string) => {
    const stamped = `${new Date().toLocaleTimeString()}  ${line}`;
    setLogs((prev) => [stamped, ...prev].slice(0, LOG_LIMIT));
  };

  const isBusy = (action: string) => busyAction === `ble:${action}`;

  return (
    <div className="container">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/')} style={{ padding: '0.4rem' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Bluetooth size={22} />
              BLE Console
            </h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              BLE service, repository, IPC, and UI controls.
            </p>
          </div>
        </div>
      </div>

      <div className="bluetooth-layout">
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>BLE</h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <label style={{ marginBottom: 0 }}>
              Service UUIDs
              <input
                type="text"
                value={serviceUuids}
                onChange={(e) => setServiceUuids(e.target.value)}
                placeholder="comma separated"
                style={{ width: 280 }}
              />
            </label>
            <label style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={allowDuplicates}
                onChange={(e) => setAllowDuplicates(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              allow duplicates
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
            <button className="btn-secondary" onClick={() => void invokeBle('ping')} disabled={isBusy('ping')}>
              <RefreshCcw size={15} /> Ping
            </button>
            <button className="btn-secondary" onClick={() => void invokeBle('status.get')} disabled={isBusy('status.get')}>
              Status
            </button>
            <button className="btn-primary" onClick={onBleScanStart} disabled={isBusy('scan.start')}>
              <Play size={15} /> Scan Start
            </button>
            <button className="btn-secondary" onClick={() => void invokeBle('scan.stop')} disabled={isBusy('scan.stop')}>
              <Square size={15} /> Scan Stop
            </button>
            <button className="btn-secondary" onClick={() => void invokeBle('devices.list')} disabled={isBusy('devices.list')}>
              Devices List
            </button>
            <button className="btn-secondary" onClick={() => alert('BLE pairing is device-dependent. Scan then connect.')}>
              <Link size={15} /> Pair Help
            </button>
          </div>

          <div className="bluetooth-device-row" style={{ marginBottom: 0 }}>
            <select
              value={bleSelectedDeviceId}
              onChange={(e) => setBleSelectedDeviceId(e.target.value)}
              style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--color-border)' }}
            >
              <option value="">Select BLE device</option>
              {sortedBleDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name ?? 'Unnamed'} ({device.address}){device.connected ? ' [connected]' : ''}
                </option>
              ))}
            </select>

            <button className="btn-primary" onClick={onBleConnect} disabled={isBusy('device.connect')}>
              <Plug size={15} /> Connect
            </button>
            <button className="btn-secondary" onClick={onBleDisconnect} disabled={isBusy('device.disconnect')}>
              <Unplug size={15} /> Disconnect
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.6rem', fontSize: '1rem' }}>
              <Printer size={16} style={{ display: 'inline', marginRight: 8 }} />
              BLE Data Send (GATT Write)
            </h3>
            <input
              type="text"
              placeholder="BLE service UUID (required)"
              value={bleDataServiceUuid}
              onChange={(e) => setBleDataServiceUuid(e.target.value)}
              style={{ marginBottom: '0.6rem' }}
            />
            <input
              type="text"
              placeholder="BLE characteristic UUID (required)"
              value={bleDataCharacteristicUuid}
              onChange={(e) => setBleDataCharacteristicUuid(e.target.value)}
              style={{ marginBottom: '0.6rem' }}
            />
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
              <label style={{ marginBottom: 0 }}>
                Encoding
                <select
                  value={bleDataEncoding}
                  onChange={(e) =>
                    setBleDataEncoding(e.target.value as 'utf8' | 'hex' | 'base64')
                  }
                  style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--color-border)', marginLeft: 8 }}
                >
                  <option value="utf8">utf8</option>
                  <option value="hex">hex</option>
                  <option value="base64">base64</option>
                </select>
              </label>
              <label style={{ marginBottom: 0 }}>
                Chunk size
                <input
                  type="number"
                  min={20}
                  max={512}
                  value={bleDataChunkSize}
                  onChange={(e) => setBleDataChunkSize(e.target.value)}
                  style={{ width: 100, marginLeft: 8 }}
                />
              </label>
              <label style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={bleDataWithResponse}
                  onChange={(e) => setBleDataWithResponse(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                with response
              </label>
            </div>
            <textarea
              value={bleDataContent}
              onChange={(e) => setBleDataContent(e.target.value)}
              rows={4}
              style={{ marginBottom: '0.6rem' }}
            />
            <button className="btn-primary" onClick={onBleSendData} disabled={isBusy('data.send')}>
              Send Data
            </button>
          </div>
        </div>
      </div>

      <div className="bluetooth-layout" style={{ marginTop: '1rem' }}>
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>BLE Status</h3>
          <pre style={statusBlockStyle}>{bleStatus ? safeJson(bleStatus) : 'No BLE status yet'}</pre>
        </div>

        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>Event / Action Log</h3>
          <div style={{ maxHeight: 280, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.45 }}>
            {logs.length === 0 ? (
              <div style={{ color: 'var(--color-text-secondary)' }}>No logs yet</div>
            ) : (
              logs.map((line, index) => (
                <div key={`${line}-${index}`} style={{ marginBottom: '0.45rem' }}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const statusBlockStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: '0.8rem',
  color: 'var(--color-text-secondary)',
  background: '#F8FAFC',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '0.6rem',
  maxHeight: 160,
  overflow: 'auto',
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sortDevices(devices: DeviceItem[]): DeviceItem[] {
  return [...devices].sort((a, b) => {
    if (a.connected && !b.connected) return -1;
    if (!a.connected && b.connected) return 1;
    return a.id.localeCompare(b.id);
  });
}

function isDeviceLike(value: unknown): value is DeviceItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceItem>;
  return typeof candidate.id === 'string' && typeof candidate.address === 'string';
}

function isDeviceIdPayload(value: unknown): value is { id: string } {
  return Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string');
}

function normalizeDevice(device: DeviceItem): DeviceItem {
  return {
    id: device.id,
    address: device.address,
    name: device.name ?? null,
    connected: Boolean(device.connected),
  };
}

function upsertDevice(list: DeviceItem[], device: DeviceItem): DeviceItem[] {
  const existingIndex = list.findIndex((item) => item.id === device.id);
  if (existingIndex === -1) {
    return [device, ...list];
  }

  const cloned = [...list];
  cloned[existingIndex] = {
    ...cloned[existingIndex],
    ...device,
  };
  return cloned;
}

function markDisconnected(list: DeviceItem[], id: string): DeviceItem[] {
  return list.map((item) => (item.id === id ? { ...item, connected: false } : item));
}

function fromUnknownDevices(value: unknown[]): DeviceItem[] {
  return value.filter(isDeviceLike).map(normalizeDevice);
}
