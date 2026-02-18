import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs";
import { initDB, getApps, createApp, updateAppStatus } from "./db";
import { generateProject } from "./project-generator";

import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  initDB();

  ipcMain.handle('get-apps', () => {
    return getApps();
  });

  ipcMain.handle('create-app', async (_event, app, apiKey) => {
    const result = createApp(app);
    // @ts-ignore
    const appId = result.lastInsertRowid;
    // We pass the hardcoded key from frontend if it was passed, or use the one in project-generator if we want to move it there.
    // Ideally we pass it from frontend or env. The plan said pass from frontend.
    generateProject(appId, app, apiKey).catch(err => console.error('Background generation failed:', err));
    return result;
  });

  ipcMain.handle('run-app', (_event, appId) => {
    const appPath = path.join(app.getPath('userData'), 'apps', appId.toString(), 'index.html');
    
    if (!fs.existsSync(appPath)) {
      console.error(`App ${appId} missing index.html at ${appPath}`);
      updateAppStatus(appId, 'error');
      return false; // Signal failure
    }
    
    const appWin = new BrowserWindow({
      width: 800,
      height: 600,
      title: `Running App ${appId}`,
      webPreferences: {
        // But generated app might be simple HTML/JS.
        contextIsolation: false, // For simple generated apps to work easily with require if they use it
        nodeIntegration: true
      }
    });
    
    appWin.loadFile(appPath);
    return true; // Signal success
  });

  ipcMain.handle('regenerate-app', async (_event, app, apiKey) => {
    // Reset status to generating
    updateAppStatus(app.id, 'generating');
    
    // Trigger generation
    generateProject(app.id, app, apiKey).catch(err => {
      console.error('Background regeneration failed:', err);
      updateAppStatus(app.id, 'error');
    });
    
    return true;
  });

  createWindow();
});
