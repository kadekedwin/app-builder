import { App, CreateAppPayload } from '../../shared/types';

export const electronApi = {
  getApps: async (): Promise<App[]> => {
    // @ts-ignore
    return window.ipcRenderer.invoke('get-apps');
  },

  getApp: async (id: number): Promise<App | null> => {
    // @ts-ignore
    return window.ipcRenderer.invoke('get-app', id);
  },

  createApp: async (payload: CreateAppPayload): Promise<void> => {
    // @ts-ignore
    return window.ipcRenderer.invoke('create-app', payload);
  },

  runApp: async (appId: number): Promise<boolean> => {
    // @ts-ignore
    return window.ipcRenderer.invoke('run-app', appId);
  },

  generateAppIdea: async (): Promise<any> => {
    // @ts-ignore
    return window.ipcRenderer.invoke('generate-app-idea');
  },

  regenerateApp: async (app: App): Promise<boolean> => {
    // @ts-ignore
    return window.ipcRenderer.invoke('regenerate-app', app);
  }
};
