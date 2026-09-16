import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // 惰性求值：在 getDb() 内读 env，保证测试在 beforeEach 里改 DB_PATH 生效。
    // better-sqlite3 把 ':memory:' 识别为内存库，不会落成文件。
    const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function migrate(): void {
  const sql = fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8');
  getDb().exec(sql);
}

/** Test-only: reset the singleton so a new DB_PATH takes effect. */
export function _resetDbForTest(): void {
  if (db) {
    db.close();
    db = null;
  }
}
