import { setupAppHandlers } from './apps';
import { setupRunnerHandlers } from './runner';
import { setupAiHandlers } from './ai';

export function setupIPC() {
  setupAppHandlers();
  setupRunnerHandlers();
  setupAiHandlers();
}
