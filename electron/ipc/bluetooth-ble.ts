import { BrowserWindow, ipcMain } from 'electron';
import {
  bleBluetoothRepository,
  type BleActionRequest,
} from '../repositories/BleBluetoothRepository';

let bridgeInitialized = false;

export function setupBleBluetoothHandlers() {
  ipcMain.handle('bluetooth:ble:action', async (_event, request: BleActionRequest) => {
    try {
      const payload = await bleBluetoothRepository.execute(request);
      return {
        ok: true,
        endpoint: 'ble',
        action: request.action,
        payload,
      };
    } catch (error) {
      const mapped = mapError(error);
      return {
        ok: false,
        endpoint: 'ble',
        action: request.action,
        error: mapped,
      };
    }
  });

  if (!bridgeInitialized) {
    const unsubscribe = bleBluetoothRepository.subscribe((event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('bluetooth:ble:event', event);
        }
      }
    });

    bridgeInitialized = true;

    ipcMain.once('bluetooth:ble:dispose', () => {
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
