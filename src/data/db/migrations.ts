/**
 * Numbered migrations applied by `migrate`, tracked with PRAGMA user_version.
 * Shipped entries must never be edited; add a new one instead.
 */
export const MIGRATIONS: readonly { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: '0001_init',
    sql: `
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES folders(id),
  name TEXT NOT NULL,
  color TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX idx_folders_live ON folders(sort_order) WHERE deleted_at IS NULL;

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX idx_media_sha ON media(sha256);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES folders(id),
  media_id TEXT NOT NULL REFERENCES media(id),
  title TEXT,
  source TEXT NOT NULL,
  external_id TEXT,
  created_device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX idx_cards_folder ON cards(folder_id, created_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_cards_external ON cards(source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE masks (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id),
  ord INTEGER NOT NULL,
  geometry TEXT NOT NULL,
  bbox_x REAL NOT NULL, bbox_y REAL NOT NULL, bbox_w REAL NOT NULL, bbox_h REAL NOT NULL,
  answer_text TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE INDEX idx_masks_card ON masks(card_id, ord) WHERE deleted_at IS NULL;

CREATE TABLE review_states (
  card_id TEXT PRIMARY KEY REFERENCES cards(id),
  algorithm TEXT NOT NULL DEFAULT 'sm2b-v1',
  phase TEXT NOT NULL DEFAULT 'new' CHECK (phase IN ('new','learning','review','relearning')),
  due_at INTEGER NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  ease REAL NOT NULL DEFAULT 2.5 CHECK (ease >= 1.3),
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_review_due ON review_states(due_at);

CREATE TABLE review_logs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id),
  reviewed_at INTEGER NOT NULL,
  time_zone TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (1,3)),
  algorithm TEXT NOT NULL,
  duration_ms INTEGER,
  revealed_count INTEGER NOT NULL,
  mask_count INTEGER NOT NULL,
  prev_phase TEXT NOT NULL, prev_interval INTEGER NOT NULL, prev_ease REAL NOT NULL,
  prev_reps INTEGER NOT NULL, prev_lapses INTEGER NOT NULL, prev_due_at INTEGER NOT NULL,
  new_phase TEXT NOT NULL, new_interval INTEGER NOT NULL, new_ease REAL NOT NULL,
  new_reps INTEGER NOT NULL, new_lapses INTEGER NOT NULL, new_due_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  undone_at INTEGER
);
CREATE INDEX idx_logs_card ON review_logs(card_id, reviewed_at);
`,
  },
  {
    version: 2,
    name: '0002_cards_external_live_only',
    sql: `
DROP INDEX IF EXISTS idx_cards_external;
CREATE UNIQUE INDEX idx_cards_external ON cards(source, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;
`,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
