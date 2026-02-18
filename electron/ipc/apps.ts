import { ipcMain } from 'electron';
import { getApps, createApp, getAppById, updateAppStatus } from '../database/index';
import { generateProject } from '../utils/project-generator';
import { CreateAppPayload } from '../../shared/types';

export function setupAppHandlers() {
  ipcMain.handle('get-apps', () => {
    return getApps();
  });

  ipcMain.handle('get-app', (_event, id) => {
    return getAppById(id);
  });

  ipcMain.handle('create-app', async (_event, app: CreateAppPayload) => {
    const result = createApp(app);
    // @ts-ignore
    const appId = result.lastInsertRowid;
    generateProject(appId, app).catch(err => console.error('Background generation failed:', err));
    return result;
  });

  ipcMain.handle('regenerate-app', async (_event, app) => {
      // Reset status to generating
      updateAppStatus(app.id, 'generating');
      
      // Trigger generation
      generateProject(app.id, app).catch(err => {
        console.error('Background regeneration failed:', err);
        updateAppStatus(app.id, 'error');
      });
      
      return true;
  });
}
