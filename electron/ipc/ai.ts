import { ipcMain } from 'electron';
import { generateAppIdea } from '../services/ai-service';

export function setupAiHandlers() {
  ipcMain.handle('generate-app-idea', async () => {
    try {
      const idea = await generateAppIdea();
      return idea;
    } catch (error) {
      console.error('Error generating app idea:', error);
      throw error;
    }
  });
}
