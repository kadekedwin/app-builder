import { setupAppHandlers } from './apps';
import { setupBluetoothHandlers } from './bluetooth';

export function setupIPC() {
  setupAppHandlers();
  setupBluetoothHandlers();
}
