import { BrowserWindow, app as electronApp } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  App,
  AppBriefRequest,
  CreateAppPayload,
  DiscoveryQuestion,
  GeneratedAppBrief
} from '../../shared/types/app';
import { generateProject } from '../utils/project-generator';
import { generateAppBrief, generateAppIdea, generateDiscoveryQuestions, GeneratedAppIdea } from '../services/ai-service';
import { appRepository } from './AppRepository';

const runningApps = new Map<number, BrowserWindow>();

export class AppOrchestrationRepository {
  create(appPayload: CreateAppPayload): { lastInsertRowid: number | bigint } {
    const result = appRepository.create(appPayload);
    const appId = Number(result.lastInsertRowid);
    generateProject(appId, appPayload).catch((error) => {
      console.error('Background generation failed:', error);
      appRepository.updateStatus(appId, 'error');
    });

    return result;
  }

  regenerate(appData: App): boolean {
    appRepository.updateStatus(appData.id, 'generating');

    const payload: CreateAppPayload = {
      name: appData.name,
      description: appData.description,
      target_audience: appData.target_audience,
      goal: appData.goal
    };

    generateProject(appData.id, payload).catch((error) => {
      console.error('Background regeneration failed:', error);
      appRepository.updateStatus(appData.id, 'error');
    });

    return true;
  }

  runApp(appId: number): boolean {
    const appPath = path.join(electronApp.getPath('userData'), 'apps', appId.toString(), 'index.html');

    if (!fs.existsSync(appPath)) {
      console.error(`App ${appId} missing index.html at ${appPath}`);
      appRepository.updateStatus(appId, 'error');
      return false;
    }

    if (runningApps.has(appId)) {
      const existingWin = runningApps.get(appId);
      if (existingWin && !existingWin.isDestroyed()) {
        if (existingWin.isMinimized()) existingWin.restore();
        existingWin.focus();
        return true;
      }
      runningApps.delete(appId);
    }

    const appWin = new BrowserWindow({
      width: 1000,
      height: 700,
      title: `Running App ${appId}`,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    runningApps.set(appId, appWin);
    appWin.on('closed', () => {
      runningApps.delete(appId);
    });

    appWin.loadFile(appPath);
    return true;
  }

  async generateIdea(): Promise<GeneratedAppIdea> {
    return generateAppIdea();
  }

  async generateDiscoveryQuestions(projectIdea: string): Promise<DiscoveryQuestion[]> {
    return generateDiscoveryQuestions(projectIdea);
  }

  async generateBrief(payload: AppBriefRequest): Promise<GeneratedAppBrief> {
    return generateAppBrief(payload);
  }
}

export const appOrchestrationRepository = new AppOrchestrationRepository();
