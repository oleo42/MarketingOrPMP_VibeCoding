-- ============================================================
-- 通用批次/条目双表骨架（四段式的存储抽象）
-- 从 resume-screening 的 runs + candidates 泛化：
--   runs   → batches  （一次"批处理批次"：一份上下文 + N 条待办）
--   candidates → items（批内单条记录：一个文件/一行 Excel/一条文本）
-- 新系统复制后：把 context_text 换成你的领域字段名，
-- 在 items 上追加业务需要的冗余展示列（如名称/金额），
-- 但 status 状态机、extract_json/score_json、ai_*/human_* 这组
-- "AI 建议 + 人工裁决"字段请原样保留——它们是审核队列 UI 的数据契约。
-- ============================================================
PRAGMA journal_mode=WAL;

-- 一次批处理：承载批次级上下文（prompt 的对照物）+ 进度 + token 用量
CREATE TABLE IF NOT EXISTS batches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 批次级上下文文本。简历初筛里是 JD 全文；客服质检里是评分标准；
  -- 达人筛选里是合作 brief。没有上下文的系统可存空串。
  context_text TEXT NOT NULL,
  total INT NOT NULL DEFAULT 0,
  done INT NOT NULL DEFAULT 0,
  -- 状态机：pending → processing → done（失败也落 done，单条失败看 items.status）
  status TEXT NOT NULL DEFAULT 'pending',
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

-- 批内单条记录：AI 处理 + 人工审核的最小单元
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INT NOT NULL REFERENCES batches(id),
  -- 接入段的原始定位信息：文件名/Excel 行号/来源 URL
  source_name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  -- 条目状态机（每条独立流转，互不影响）：
  -- pending → extracted → scored
  --   ├→ needs_manual（解析失败/扫描件/数据不全，需要人工补录）
  --   └→ failed（LLM 两次重试仍失败）
  status TEXT NOT NULL DEFAULT 'pending',
  -- LLM 两阶段产出，原文 JSON 全量留档（审核 drawer 直接展示，可回溯）
  extract_json TEXT,
  score_json TEXT,
  -- 冗余高频字段，让列表页不用解析 JSON（由 pipeline 写回）
  ai_verdict TEXT,
  ai_score INT,
  -- 人工审核：AI 只建议，人做最终决定。human_* 永不被 AI 覆盖。
  human_verdict TEXT,
  human_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
