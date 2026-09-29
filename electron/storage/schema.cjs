const { createHash } = require('node:crypto');

const migrations = [
  {
    version: 1,
    name: 'library',
    sql: `
    CREATE TABLE books (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL,
      filename TEXT NOT NULL, format TEXT, pages INTEGER NOT NULL CHECK(pages > 0),
      cover TEXT NOT NULL, added_at REAL NOT NULL, opened_at REAL NOT NULL,
      page INTEGER NOT NULL, favorite INTEGER NOT NULL CHECK(favorite IN (0, 1)),
      details TEXT NOT NULL CHECK(json_valid(details))
    ) STRICT;
    CREATE INDEX books_opened_at ON books(opened_at);
    CREATE TABLE content_objects (
      hash TEXT PRIMARY KEY, size INTEGER NOT NULL CHECK(size >= 0)
    ) STRICT;
    CREATE TABLE content_pins (
      owner TEXT NOT NULL, hash TEXT NOT NULL REFERENCES content_objects(hash),
      PRIMARY KEY(owner, hash)
    ) STRICT;
    CREATE TABLE book_contents (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      hash TEXT NOT NULL REFERENCES content_objects(hash), mime TEXT NOT NULL,
      has_chapters INTEGER NOT NULL, has_assets INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE chapters (
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL, path TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, PRIMARY KEY(book_id, ordinal)
    ) STRICT;
    CREATE TABLE book_assets (
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL, path TEXT NOT NULL,
      hash TEXT NOT NULL REFERENCES content_objects(hash), mime TEXT NOT NULL,
      PRIMARY KEY(book_id, ordinal)
    ) STRICT;
    CREATE TABLE bookmarks (
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      page INTEGER NOT NULL, location TEXT CHECK(location IS NULL OR json_valid(location)),
      PRIMARY KEY(book_id, page)
    ) STRICT;
    CREATE TABLE annotations (
      id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      page INTEGER NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
      quote TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL, note TEXT NOT NULL,
      rects TEXT NOT NULL CHECK(json_valid(rects)), created_at REAL NOT NULL,
      source TEXT NOT NULL
    ) STRICT;
    CREATE INDEX annotations_book_id ON annotations(book_id);
    CREATE TABLE reading_states (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      state TEXT NOT NULL CHECK(json_valid(state))
    ) STRICT;
    CREATE TABLE legacy_imports (source TEXT PRIMARY KEY, digest TEXT NOT NULL) STRICT;
    CREATE TABLE legacy_cache (id TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
    CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  `,
  },
];

function migrateSchema(db, beforeUpgrade) {
  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all();
  const hasLedger = tables.some((row) => row.name === 'schema_migrations');
  if (tables.length && !hasLedger) throw new Error('无法识别书库结构');
  const applied = hasLedger
    ? db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
    : [];
  if (applied.length > migrations.length) throw new Error('请使用更新版本的 Leaf 打开此书库');
  const checksum = (sql) => createHash('sha256').update(sql).digest('hex');
  for (const [index, record] of applied.entries()) {
    const migration = migrations[index];
    if (record.version !== migration.version || record.checksum !== checksum(migration.sql))
      throw new Error(`数据库迁移记录不一致：${record.version}`);
  }
  if (Number(db.prepare('PRAGMA user_version').get().user_version) !== applied.length)
    throw new Error('数据库版本与迁移记录不一致');
  if (applied.length && applied.length < migrations.length) beforeUpgrade();
  for (const migration of migrations.slice(applied.length)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL
      ) STRICT;`);
      db.exec(migration.sql);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('外键校验失败');
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?, ?)').run(
        migration.version,
        migration.name,
        checksum(migration.sql),
        Date.now(),
      );
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`书库升级 ${migration.version} 失败：${error.message}`, { cause: error });
    }
  }
}

module.exports = { migrateSchema };
