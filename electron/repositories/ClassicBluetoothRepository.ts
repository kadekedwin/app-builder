import {
  classicBluetoothService,
  type ClassicActionRequest,
  type ClassicEvent,
} from '../services/classic-bluetooth-service';

export type { ClassicActionRequest };
export type ClassicBluetoothRepositoryEvent = ClassicEvent;

export class ClassicBluetoothRepository {
  execute(request: ClassicActionRequest): Promise<unknown> {
    return classicBluetoothService.execute(request);
  }

  subscribe(listener: (event: ClassicBluetoothRepositoryEvent) => void): () => void {
    return classicBluetoothService.subscribe(listener);
  }

  destroy(): Promise<void> {
    return classicBluetoothService.destroy();
  }
}

export const classicBluetoothRepository = new ClassicBluetoothRepository();
