export type BluetoothEndpoint = 'ble' | 'classic';

export interface BluetoothActionRequest {
  endpoint: BluetoothEndpoint;
  action: string;
  payload?: unknown;
}

export interface BluetoothEvent {
  endpoint: BluetoothEndpoint;
  type: string;
  payload: unknown;
}

export const bluetoothApi = {
  invoke: async (request: BluetoothActionRequest): Promise<unknown> => {
    return window.ipcRenderer.invoke('bluetooth:action', request);
  },

  onEvent: (listener: (event: BluetoothEvent) => void): (() => void) => {
    const wrapped = (_electronEvent: unknown, event: BluetoothEvent) => listener(event);
    window.ipcRenderer.on('bluetooth:event', wrapped);

    return () => {
      window.ipcRenderer.off('bluetooth:event', wrapped);
    };
  },
};
