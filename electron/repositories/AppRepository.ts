import db from '../database/index';
import { App, CreateAppPayload } from '../../shared/types/app';

export class AppRepository {
  getAll(): App[] {
    return db.prepare('SELECT * FROM app ORDER BY created_at DESC').all() as App[];
  }

  getById(id: number): App | undefined {
    return db.prepare('SELECT * FROM app WHERE id = @id').get({ id }) as App | undefined;
  }

  create(app: CreateAppPayload): { lastInsertRowid: number | bigint } {
    const stmt = db.prepare('INSERT INTO app (name, description, target_audience, goal, status) VALUES (@name, @description, @target_audience, @goal, \'generating\')');
    return stmt.run(app);
  }

  updateStatus(id: number, status: 'generating' | 'ready' | 'error'): void {
    const stmt = db.prepare('UPDATE app SET status = @status, updated_at = CURRENT_TIMESTAMP WHERE id = @id');
    stmt.run({ id, status });
  }
}

export const appRepository = new AppRepository();
