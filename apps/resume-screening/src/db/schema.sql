PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jd_text TEXT NOT NULL,
  total INT NOT NULL DEFAULT 0,
  done INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS candidates(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INT NOT NULL REFERENCES runs(id),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  extract_json TEXT,
  score_json TEXT,
  ai_verdict TEXT,
  ai_score INT,
  human_verdict TEXT,
  human_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
