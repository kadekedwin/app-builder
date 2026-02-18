import { BrowserWindow, ipcMain } from 'electron';
import {
  bluetoothRepository,
  type BluetoothActionRequest,
} from '../repositories/BluetoothRepository';

let eventBridgeInitialized = false;

export function setupBluetoothHandlers() {
  ipcMain.handle(
    'bluetooth:action',
    async (_event, request: BluetoothActionRequest) => {
      try {
        const payload = await bluetoothRepository.execute(request);
        return {
          ok: true,
          endpoint: request.endpoint,
          action: request.action,
          payload,
        };
      } catch (error) {
        const mapped = mapError(error);
        return {
          ok: false,
          endpoint: request.endpoint,
          action: request.action,
          error: mapped,
        };
      }
    }
  );

  if (!eventBridgeInitialized) {
    const unsubscribe = bluetoothRepository.subscribe((event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('bluetooth:event', event);
        }
      }
    });

    eventBridgeInitialized = true;

    ipcMain.once('bluetooth:dispose', () => {
      unsubscribe();
      eventBridgeInitialized = false;
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
