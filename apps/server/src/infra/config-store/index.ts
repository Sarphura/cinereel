import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'

const CONFIG_DB_FILE = 'cinereel.sqlite'

export function getConfigDatabasePath(storeDir: string) {
  return path.join(storeDir, CONFIG_DB_FILE)
}

export function withConfigDatabase<T>(
  storeDir: string,
  run: (db: Database.Database) => T,
) {
  fs.mkdirSync(storeDir, { recursive: true })

  const db = new Database(getConfigDatabasePath(storeDir))
  db.pragma('journal_mode = WAL')
  initializeSchema(db)

  try {
    return run(db)
  } finally {
    db.close()
  }
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS owned_drives (
      drive_key TEXT PRIMARY KEY,
      namespace TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      remark TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscribed_drives (
      drive_key TEXT PRIMARY KEY,
      name TEXT,
      type TEXT NOT NULL DEFAULT 'generic',
      remark TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movies (
      drive_key TEXT NOT NULL,
      resource_path TEXT NOT NULL,
      title TEXT,
      original_title TEXT,
      plot TEXT,
      year INTEGER,
      premiered TEXT,
      rating REAL,
      poster_path TEXT,
      fanart_path TEXT,
      nfo_path TEXT,
      source_updated_at INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL,
      PRIMARY KEY (drive_key, resource_path)
    );

    CREATE INDEX IF NOT EXISTS idx_owned_drives_created_at
      ON owned_drives(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_subscribed_drives_created_at
      ON subscribed_drives(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_movies_indexed_at
      ON movies(indexed_at DESC);
  `)

  ensureColumn(db, 'subscribed_drives', 'type', `ALTER TABLE subscribed_drives ADD COLUMN type TEXT NOT NULL DEFAULT 'generic'`)
}

function ensureColumn(
  db: DatabaseType,
  tableName: string,
  columnName: string,
  statement: string,
) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>

  if (columns.some((column) => column.name === columnName)) {
    return
  }

  db.exec(statement)
}
