import {
  bluetoothService,
  type BluetoothActionRequest,
  type BluetoothEndpoint,
  type BluetoothServiceEvent,
} from '../services/bluetooth-service';

export type { BluetoothActionRequest, BluetoothEndpoint };
export type BluetoothRepositoryEvent = BluetoothServiceEvent;

export class BluetoothRepository {
  execute(request: BluetoothActionRequest): Promise<unknown> {
    return bluetoothService.execute(request);
  }

  subscribe(listener: (event: BluetoothRepositoryEvent) => void): () => void {
    return bluetoothService.subscribe(listener);
  }

  destroy(): Promise<void> {
    return bluetoothService.destroy();
  }
}

export const bluetoothRepository = new BluetoothRepository();
