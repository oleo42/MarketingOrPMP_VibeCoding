// ============================================================
// 通用数据库模块（四段式 · 第 2/3 段共用的存储底座）
// 从 apps/resume-screening/src/db/index.ts 泛化而来。
// 模式：better-sqlite3 懒加载单例 + WAL + 幂等迁移。
// 新系统复制本目录后只需要改 schema.sql，本文件原样可用。
// ============================================================
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// DB_PATH 环境变量可覆盖，默认 <应用根>/data.db。
// 本地开发一个系统一个文件即可，无需任何数据库服务。
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db');
let db: Database.Database | null = null;

/**
 * 获取数据库连接（懒加载单例）。
 * Next.js dev 模式热重载会反复 import 本模块，单例保证只开一个连接。
 */
export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    // WAL：批处理写入与 UI 读取互不阻塞，单文件 SQLite 的必备开关。
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * 幂等迁移：直接 exec 整份 schema.sql。
 * schema 里所有 DDL 都必须写 CREATE TABLE IF NOT EXISTS，
 * 因此每次启动/请求前调用都是安全的（resume-screening 在每个 API route 入口调用）。
 */
export function migrate(): void {
  const sql = fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8');
  getDb().exec(sql);
}

/** 测试专用：重置单例，让新的 DB_PATH 生效。 */
export function _resetDbForTest(): void {
  if (db) {
    db.close();
    db = null;
  }
}
