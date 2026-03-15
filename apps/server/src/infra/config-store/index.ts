import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

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

    CREATE TABLE IF NOT EXISTS subscriptions (
      drive_key TEXT PRIMARY KEY,
      name TEXT,
      remark TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_owned_drives_created_at
      ON owned_drives(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at
      ON subscriptions(created_at DESC);
  `)
}
