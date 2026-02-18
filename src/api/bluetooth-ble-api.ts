export interface BleActionRequest {
  action: string;
  payload?: unknown;
}

export interface BleEvent {
  type: string;
  payload: unknown;
}

export const bleBluetoothApi = {
  invoke: async (request: BleActionRequest): Promise<unknown> => {
    return window.ipcRenderer.invoke('bluetooth:ble:action', request);
  },

  onEvent: (listener: (event: BleEvent) => void): (() => void) => {
    const wrapped = (_electronEvent: unknown, event: BleEvent) => listener(event);
    window.ipcRenderer.on('bluetooth:ble:event', wrapped);

    return () => {
      window.ipcRenderer.off('bluetooth:ble:event', wrapped);
    };
  },
};
