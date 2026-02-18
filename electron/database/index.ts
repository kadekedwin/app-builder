import { createRequire } from 'node:module';
import path from 'path';
import { app } from 'electron';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const dbPath = path.join(app.getPath('userData'), 'app.db');
const db = new Database(dbPath);

export function initDB() {
  try {
    db.pragma('journal_mode = WAL');
    
    // Check if table needs migration (simple approach: check if new columns exist)
    try {
      const tableInfo = db.pragma('table_info(app)');
      // @ts-ignore
      const hasStatus = tableInfo.some(col => col.name === 'status');
      
      if (!hasStatus && tableInfo.length > 0) {
        // Setup simple migration: drop and recreate since it's dev
        console.log('Migrating database schema...');
        db.exec('DROP TABLE IF EXISTS app');
      }
    } catch (e) {
      console.error('Error checking schema:', e);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS app (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        target_audience TEXT,
        goal TEXT,
        status TEXT DEFAULT 'generating',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.error('Failed to initialize database:', e);
  }
}


export function getApps() {
  return db.prepare('SELECT * FROM app ORDER BY created_at DESC').all();
}

export function createApp(app: { name: string; description: string; target_audience: string; goal: string }) {
  const stmt = db.prepare('INSERT INTO app (name, description, target_audience, goal, status) VALUES (@name, @description, @target_audience, @goal, \'generating\')');
  return stmt.run(app);
}

export function updateAppStatus(id: number, status: 'generating' | 'ready' | 'error') {
  const stmt = db.prepare('UPDATE app SET status = @status, updated_at = CURRENT_TIMESTAMP WHERE id = @id');
  return stmt.run({ id, status });
}

export function getAppById(id: number) {
  return db.prepare('SELECT * FROM app WHERE id = @id').get({ id });
}

export default db;
