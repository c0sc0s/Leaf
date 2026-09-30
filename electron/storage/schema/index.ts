import type { DatabaseSync } from 'node:sqlite';

const applicationId = 0x4c465232;
const schemaVersion = 1;
const schema = `
CREATE TABLE documents (
  id TEXT PRIMARY KEY, revision TEXT NOT NULL, format_id TEXT NOT NULL,
  metadata TEXT NOT NULL CHECK(json_valid(metadata)), source_data TEXT NOT NULL CHECK(json_valid(source_data)),
  UNIQUE(format_id, revision)
) STRICT;
CREATE TABLE content_objects (hash TEXT PRIMARY KEY, size INTEGER NOT NULL CHECK(size >= 0)) STRICT;
CREATE TABLE content_pins (owner TEXT NOT NULL, hash TEXT NOT NULL REFERENCES content_objects(hash), PRIMARY KEY(owner, hash)) STRICT;
CREATE TABLE document_resources (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  path TEXT NOT NULL, hash TEXT NOT NULL REFERENCES content_objects(hash), mime TEXT NOT NULL,
  PRIMARY KEY(document_id, path)
) STRICT;
CREATE TABLE annotations (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  value TEXT NOT NULL CHECK(json_valid(value))
) STRICT;
CREATE INDEX annotations_document ON annotations(document_id);
CREATE TABLE reading_positions (document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
CREATE TABLE bookmarks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
CREATE TABLE plugins (id TEXT PRIMARY KEY, version TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), manifest TEXT NOT NULL CHECK(json_valid(manifest)), installed_at REAL NOT NULL, package_hash TEXT NOT NULL) STRICT;
CREATE TABLE plugin_data (
  plugin_id TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE, value TEXT NOT NULL CHECK(json_valid(value)),
  PRIMARY KEY(plugin_id, scope, key), CHECK(scope=COALESCE(document_id,''))
) STRICT;
CREATE TABLE task_events (sequence INTEGER PRIMARY KEY, plugin_id TEXT NOT NULL, run_id TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value))) STRICT;
CREATE INDEX task_events_run ON task_events(plugin_id,run_id);
`;

export function initializeSchema(db: DatabaseSync) {
  const tables = db
    .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all();
  if (tables.length) {
    if (
      db.prepare('PRAGMA application_id').get()?.application_id !== applicationId ||
      db.prepare('PRAGMA user_version').get()?.user_version !== schemaVersion
    )
      throw new Error('无法识别当前书库结构');
    return;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(schema);
    db.exec(`PRAGMA application_id=${applicationId}; PRAGMA user_version=${schemaVersion};`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
