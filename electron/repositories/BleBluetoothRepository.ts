import {
  bleBluetoothService,
  type BleActionRequest,
  type BleEvent,
} from '../services/ble-bluetooth-service';

export type { BleActionRequest };
export type BleBluetoothRepositoryEvent = BleEvent;

export class BleBluetoothRepository {
  execute(request: BleActionRequest): Promise<unknown> {
    return bleBluetoothService.execute(request);
  }

  subscribe(listener: (event: BleBluetoothRepositoryEvent) => void): () => void {
    return bleBluetoothService.subscribe(listener);
  }

  destroy(): Promise<void> {
    return bleBluetoothService.destroy();
  }
}

export const bleBluetoothRepository = new BleBluetoothRepository();
