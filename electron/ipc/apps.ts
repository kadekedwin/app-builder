import { ipcMain } from 'electron';
import { appRepository } from '../repositories/AppRepository';
import { CreateAppPayload } from '../../shared/types/app';

export function setupAppHandlers() {
  ipcMain.handle('get-apps', () => {
    return appRepository.getAll();
  });

  ipcMain.handle('get-app', (_event, id) => {
    return appRepository.getById(id);
  });

  ipcMain.handle('create-app', async (_event, app: CreateAppPayload) => {
    return appRepository.create(app);
  });

  ipcMain.handle('regenerate-app', async (_event, app) => {
    return appRepository.regenerate(app);
  });

  ipcMain.handle('run-app', (_event, appId) => {
    return appRepository.runApp(appId);
  });

  ipcMain.handle('generate-app-idea', async () => {
    return appRepository.generateIdea();
  });
}
