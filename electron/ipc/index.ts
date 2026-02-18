import { setupAppHandlers } from './apps';
import { setupBleBluetoothHandlers } from './bluetooth-ble';
import { setupClassicBluetoothHandlers } from './bluetooth-classic';

export function setupIPC() {
  setupAppHandlers();
  setupBleBluetoothHandlers();
  setupClassicBluetoothHandlers();
}
