import { setupAppHandlers } from './apps';
import { setupBleBluetoothHandlers } from './bluetooth-ble';

export function setupIPC() {
  setupAppHandlers();
  setupBleBluetoothHandlers();
}
