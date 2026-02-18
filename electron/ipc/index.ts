import { setupAppHandlers } from './apps';
import { setupRunnerHandlers } from './runner';

export function setupIPC() {
  setupAppHandlers();
  setupRunnerHandlers();
}
