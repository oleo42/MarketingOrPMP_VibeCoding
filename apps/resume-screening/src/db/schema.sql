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

-- 闸口4：状态迁移事件。每次状态跳转留痕，异常状态（failed/needs_manual）自然显形。
CREATE TABLE IF NOT EXISTS candidate_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INT NOT NULL REFERENCES candidates(id),
  run_id INT NOT NULL REFERENCES runs(id),
  event TEXT NOT NULL,          -- parse_start/parse_done/extract_start/extract_done/score_start/score_done/failed/needs_manual
  from_status TEXT,
  to_status TEXT,
  detail TEXT,                  -- JSON: {text_len, tokens, error, model, duration_ms, llm_raw}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_candidate ON candidate_events(candidate_id);
