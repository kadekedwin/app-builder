import { BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs';
import db from '../database/index';
import { App, CreateAppPayload } from '../../shared/types/app';
import { generateProject } from '../utils/project-generator';
import { generateAppIdea, GeneratedAppIdea } from '../services/ai-service';

const runningApps = new Map<number, BrowserWindow>();

export class AppRepository {
  getAll(): App[] {
    return db.prepare('SELECT * FROM app ORDER BY created_at DESC').all() as App[];
  }

  getById(id: number): App | undefined {
    return db.prepare('SELECT * FROM app WHERE id = @id').get({ id }) as App | undefined;
  }

  create(app: CreateAppPayload): { lastInsertRowid: number | bigint } {
    const stmt = db.prepare('INSERT INTO app (name, description, target_audience, goal, status) VALUES (@name, @description, @target_audience, @goal, \'generating\')');
    const result = stmt.run(app);
    
    // Trigger background generation
    // @ts-ignore
    const appId = result.lastInsertRowid as number;
    generateProject(appId, app).catch(err => {
      console.error('Background generation failed:', err);
    });

    return result;
  }

  updateStatus(id: number, status: 'generating' | 'ready' | 'error'): void {
    const stmt = db.prepare('UPDATE app SET status = @status, updated_at = CURRENT_TIMESTAMP WHERE id = @id');
    stmt.run({ id, status });
  }

  regenerate(app: App): boolean {
     // Reset status to generating
     this.updateStatus(app.id, 'generating');
    
     const payload: CreateAppPayload = {
       name: app.name,
       description: app.description,
       target_audience: app.target_audience,
       goal: app.goal
     };
 
     generateProject(app.id, payload).catch(err => {
       console.error('Background regeneration failed:', err);
       this.updateStatus(app.id, 'error');
     });
     
     return true;
  }

  runApp(appId: number): boolean {
    const appPath = path.join(app.getPath('userData'), 'apps', appId.toString(), 'index.html');
    
    if (!fs.existsSync(appPath)) {
      console.error(`App ${appId} missing index.html at ${appPath}`);
      this.updateStatus(appId, 'error');
      return false; 
    }

    // Check if already running
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

    // Track the window
    runningApps.set(appId, appWin);

    // Remove from map when closed
    appWin.on('closed', () => {
      runningApps.delete(appId);
    });
    
    appWin.loadFile(appPath);
    return true;
  }

  async generateIdea(): Promise<GeneratedAppIdea> {
    return generateAppIdea();
  }
}

export const appRepository = new AppRepository();
