import { ipcMain, app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { updateAppStatus } from '../database/index';
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Track running app windows: appId -> BrowserWindow
const runningApps = new Map<number, BrowserWindow>();

export function setupRunnerHandlers() {
  ipcMain.handle('run-app', (_event, appId) => {
    const appPath = path.join(app.getPath('userData'), 'apps', appId.toString(), 'index.html');
    
    if (!fs.existsSync(appPath)) {
      console.error(`App ${appId} missing index.html at ${appPath}`);
      updateAppStatus(appId, 'error');
      return false; // Signal failure
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
        // We moved preload, so we need to point to it? 
        // Wait, generated apps used 'app-preload.js' which was deleted.
        // So for now we don't use preload for generated apps or we should restore it if desired.
        // But user reverted it. So adhering to current state: no preload for generated apps?
        // Or simple nodeIntegration: true?
        // The previous main.ts (Step 443) had:
        /*
        webPreferences: {
          // But generated app might be simple HTML/JS.
          contextIsolation: false, // For simple generated apps to work easily with require if they use it
          nodeIntegration: true
        }
        */
        // I will stick to that to avoid breaking changes.
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
    return true; // Signal success
  });
}
