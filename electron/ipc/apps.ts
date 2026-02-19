import { ipcMain } from 'electron';
import { appRepository } from '../repositories/AppRepository';
import { appOrchestrationRepository } from '../repositories/AppOrchestrationRepository';
import { CreateAppPayload } from '../../shared/types/app';

export function setupAppHandlers() {
  ipcMain.handle('get-apps', () => {
    return appRepository.getAll();
  });

  ipcMain.handle('get-app', (_event, id) => {
    return appRepository.getById(id);
  });

  ipcMain.handle('create-app', async (_event, app: CreateAppPayload) => {
    return appOrchestrationRepository.create(app);
  });

  ipcMain.handle('regenerate-app', async (_event, app) => {
    return appOrchestrationRepository.regenerate(app);
  });

  ipcMain.handle('run-app', (_event, appId) => {
    return appOrchestrationRepository.runApp(appId);
  });

  ipcMain.handle('generate-app-idea', async () => {
    return appOrchestrationRepository.generateIdea();
  });

  ipcMain.handle('generate-app-discovery-questions', async (_event, projectIdea: string) => {
    return appOrchestrationRepository.generateDiscoveryQuestions(projectIdea);
  });

  ipcMain.handle('generate-app-brief', async (_event, payload) => {
    return appOrchestrationRepository.generateBrief(payload);
  });
}
