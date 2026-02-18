export interface ClassicActionRequest {
  action: string;
  payload?: unknown;
}

export interface ClassicEvent {
  type: string;
  payload: unknown;
}

export const classicBluetoothApi = {
  invoke: async (request: ClassicActionRequest): Promise<unknown> => {
    return window.ipcRenderer.invoke('bluetooth:classic:action', request);
  },

  onEvent: (listener: (event: ClassicEvent) => void): (() => void) => {
    const wrapped = (_electronEvent: unknown, event: ClassicEvent) => listener(event);
    window.ipcRenderer.on('bluetooth:classic:event', wrapped);

    return () => {
      window.ipcRenderer.off('bluetooth:classic:event', wrapped);
    };
  },
};
