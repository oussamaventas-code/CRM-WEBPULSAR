-- 008 · Trabajo: estado de revisión de cada cambio (commit) de GitHub. Solo añade una tabla.

CREATE TABLE change_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sha TEXT NOT NULL CHECK (length(sha) BETWEEN 7 AND 40),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'accepted', 'changes_requested')),
  note TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (project_id, sha)
);
CREATE INDEX idx_change_reviews_status ON change_reviews(status);
