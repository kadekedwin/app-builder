import { BrowserWindow, ipcMain } from 'electron';
import {
  classicBluetoothRepository,
  type ClassicActionRequest,
} from '../repositories/ClassicBluetoothRepository';

let bridgeInitialized = false;

export function setupClassicBluetoothHandlers() {
  ipcMain.handle('bluetooth:classic:action', async (_event, request: ClassicActionRequest) => {
    try {
      const payload = await classicBluetoothRepository.execute(request);
      return {
        ok: true,
        endpoint: 'classic',
        action: request.action,
        payload,
      };
    } catch (error) {
      const mapped = mapError(error);
      return {
        ok: false,
        endpoint: 'classic',
        action: request.action,
        error: mapped,
      };
    }
  });

  if (!bridgeInitialized) {
    const unsubscribe = classicBluetoothRepository.subscribe((event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('bluetooth:classic:event', event);
        }
      }
    });

    bridgeInitialized = true;

    ipcMain.once('bluetooth:classic:dispose', () => {
      unsubscribe();
      bridgeInitialized = false;
    });
  }
}

function mapError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const codeCandidate = (error as Error & { code?: unknown }).code;
    if (typeof codeCandidate === 'string') {
      return {
        code: codeCandidate,
        message: error.message,
      };
    }

    return {
      code: 'COMMAND_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'COMMAND_ERROR',
    message: String(error),
  };
}
