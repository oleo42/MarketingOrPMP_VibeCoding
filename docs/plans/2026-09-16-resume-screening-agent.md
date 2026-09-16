# 简历初筛 Agent 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 按任务顺序执行，每个任务结束跑测试+提交。步骤用 checkbox 追踪。

**Goal:** 交付一个本地可跑的简历初筛 Web 应用：上传 PDF+JD → LLM 批量抽取打分 → 审核队列改判 → 导出 CSV。

**Architecture:** Next.js 15 App Router 全栈应用，SQLite 持久化，Anthropic SDK 直连。处理逻辑在 Route Handler 后台异步执行，前端轮询进度。无外部服务依赖（除 Anthropic API）。

**Tech Stack:** Next.js 15, TypeScript, Tailwind, better-sqlite3, @anthropic-ai/sdk, pdf-parse, Vitest

**Spec:** `docs/specs/2026-09-16-resume-screening-agent.md`

## Global Constraints

- 包管理：npm（无 bun/pnpm）
- Node 24；ESM；TypeScript strict
- 所有 LLM 调用必须记录 token 用量到 `runs` 表
- PDF 解析失败/扫描件不抛异常阻塞整批，标记状态继续
- 并发 LLM 调用上限 5（p-limit）
- 环境变量：`ANTHROPIC_API_KEY` 从 `.env.local` 读，提供 `.env.example`

---

### Task 1: 项目脚手架 + 数据库层

**Files:**
- Create: `apps/resume-screening/package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.example`, `.gitignore`
- Create: `apps/resume-screening/src/db/index.ts`（连接+迁移）
- Create: `apps/resume-screening/src/db/schema.sql`
- Test: `apps/resume-screening/src/db/index.test.ts`

**Interfaces:**
- Produces: `getDb(): Database.Database`（better-sqlite3 单例，WAL）；`migrate(): void`
- Consumes: 无

- [ ] **Step 1: 初始化 Next.js + 依赖**

```bash
mkdir -p apps/resume-screening && cd apps/resume-screening
npm init -y
npm install next@15 react react-dom better-sqlite3 @anthropic-ai/sdk pdf-parse p-limit
npm install -D typescript @types/react @types/node @types/better-sqlite3 @types/pdf-parse tailwindcss postcss autoprefixer vitest @vitejs/plugin-react jsdom
npx tsc --init
```

`package.json` scripts:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest",
  "db:migrate": "node --experimental-strip-types src/db/migrate-cli.ts"
}
```

- [ ] **Step 2: 写 schema.sql + 迁移**

`src/db/schema.sql`:
```sql
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
```

- [ ] **Step 3: 写 getDb + migrate，测试建表**

`src/db/index.ts`:
```ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db');
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function migrate(): void {
  const sql = fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8');
  getDb().exec(sql);
}
```

`src/db/index.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, migrate } from './index';

describe('db', () => {
  beforeEach(() => { process.env.DB_PATH = ':memory:'; });
  it('creates tables', () => {
    migrate();
    const tables = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[];
    expect(tables.map(t=>t.name)).toContain('runs');
    expect(tables.map(t=>t.name)).toContain('candidates');
  });
});
```

- [ ] **Step 4: 跑测试通过**

```bash
cd apps/resume-screening && npx vitest run src/db/index.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/resume-screening && git commit -m "feat(resume-screening): scaffold next.js + sqlite schema"
```

---

### Task 2: LLM 客户端封装（模型分层 + 重试 + token 统计）

**Files:**
- Create: `apps/resume-screening/src/llm/client.ts`
- Create: `apps/resume-screening/src/llm/schemas.ts`
- Test: `apps/resume-screening/src/llm/client.test.ts`

**Interfaces:**
- Produces:
  - `extractResume(text: string): Promise<{data: ExtractResult, usage: Usage}>`
  - `scoreCandidate(jd: string, extract: ExtractResult): Promise<{data: ScoreResult, usage: Usage}>`
  - Types: `ExtractResult`, `ScoreResult`, `Usage{input_tokens,output_tokens}`
- Consumes: `@anthropic-ai/sdk`

- [ ] **Step 1: 写 schemas.ts（zod 校验）**

```bash
npm install zod
```

`src/llm/schemas.ts`:
```ts
import { z } from 'zod';
export const ExtractSchema = z.object({
  name: z.string(),
  years_experience: z.number(),
  skills: z.array(z.string()),
  highlights: z.array(z.string()),
  raw_summary: z.string().max(500),
});
export type ExtractResult = z.infer<typeof ExtractSchema>;
export const ScoreSchema = z.object({
  verdict: z.enum(['recommend','hold','reject']),
  score: z.number().min(0).max(100),
  reason: z.string().max(300),
  risks: z.array(z.string()),
});
export type ScoreResult = z.infer<typeof ScoreSchema>;
export interface Usage { input_tokens: number; output_tokens: number; }
```

- [ ] **Step 2: 写 client.ts**

模型常量：抽取用 `claude-sonnet-4-5`，打分用 `claude-opus-4-5`。JSON mode：system prompt 要求只输出 JSON，用 zod 解析。重试：失败抛错前重试 1 次（指数退避 500ms）。

`src/llm/client.ts` 骨架：
```ts
import Anthropic from '@anthropic-ai/sdk';
import { ExtractSchema, ScoreSchema, type ExtractResult, type ScoreResult, type Usage } from './schemas';

const client = new Anthropic(); // ANTHROPIC_API_KEY from env
const EXTRACT_MODEL = 'claude-sonnet-4-5';
const SCORE_MODEL = 'claude-opus-4-5';

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) { await new Promise(r=>setTimeout(r,500)); return fn(); }
}

export async function extractResume(text: string): Promise<{data: ExtractResult, usage: Usage}> { /* 实现 */ }
export async function scoreCandidate(jd: string, extract: ExtractResult): Promise<{data: ScoreResult, usage: Usage}> { /* 实现 */ }
```

- [ ] **Step 3: 写测试（mock Anthropic SDK）**

用 vitest `vi.mock('@anthropic-ai/sdk')` 验证：zod 解析失败会重试一次仍失败则抛错；成功路径返回 parsed data + usage。

- [ ] **Step 4: 跑测试通过**

- [ ] **Step 5: Commit** `feat(resume-screening): llm client with model routing + retry`

---

### Task 3: PDF 解析 + 单份处理 pipeline

**Files:**
- Create: `apps/resume-screening/src/lib/pdf.ts`
- Create: `apps/resume-screening/src/lib/process.ts`
- Test: `apps/resume-screening/src/lib/process.test.ts`

**Interfaces:**
- Produces:
  - `parsePdf(filePath: string): Promise<{text: string, needsManual: boolean}>`
  - `processCandidate(candidateId: number): Promise<void>`（读 DB→解析→抽取→打分→写回）
- Consumes: `db`, `llm/client`, `pdf-parse`

- [ ] **Step 1: pdf.ts**

`parsePdf`：读文件 buffer → pdf-parse 提取 text；text 长度 <100 字符 → `needsManual=true`。

- [ ] **Step 2: process.ts**

`processCandidate(id)`：
1. 从 candidates 读记录
2. `parsePdf` → needsManual 则 update parse_status='needs_manual' 返回
3. `extractResume(text)` → 存 extract_json
4. `scoreCandidate(run.jd_text, extract)` → 存 score_json + ai_verdict + ai_score
5. 累加 run 的 input/output tokens，done+1
6. 任何步骤失败：重试 1 次后 update parse_status='failed'，done+1，不抛错

- [ ] **Step 3: 测试（mock llm + pdf）**

构造 :memory: db，insert run + candidate，mock extractResume/scoreCandidate 返回固定值，断言 DB 写入正确、token 累加正确、needsManual 分支正确。

- [ ] **Step 4: 跑测试通过**

- [ ] **Step 5: Commit** `feat(resume-screening): pdf parse + candidate processing pipeline`

---

### Task 4: API 路由（上传/处理/查询/改判/导出）

**Files:**
- Create: `apps/resume-screening/src/app/api/runs/route.ts`（POST 创建）
- Create: `apps/resume-screening/src/app/api/runs/[id]/route.ts`（GET 查询）
- Create: `apps/resume-screening/src/app/api/runs/[id]/process/route.ts`（POST 触发处理）
- Create: `apps/resume-screening/src/app/api/runs/[id]/export/route.ts`（GET CSV）
- Create: `apps/resume-screening/src/app/api/candidates/[id]/route.ts`（PATCH 改判）
- Create: `apps/resume-screening/src/lib/csv.ts`

**Interfaces:**
- Consumes: `db`, `process.ts`, `p-limit`

- [ ] **Step 1: POST /api/runs**

接收 multipart/form-data：jd_text + files[]。存文件到 `uploads/<run_id>/`，insert run + candidates(status pending)，返回 `{run_id}`。

- [ ] **Step 2: POST /api/runs/[id]/process**

异步触发（不 await）：读该 run 所有 pending candidates，p-limit(5) 并发跑 `processCandidate`，全部完成 update run status='done', finished_at。立即返回 `{started: true}`。

- [ ] **Step 3: GET /api/runs/[id]**

返回 run 元信息 + candidates 列表（id, filename, parse_status, extract_json.name, years_experience, ai_verdict, ai_score, human_verdict, score_json.reason）。

- [ ] **Step 4: PATCH /api/candidates/[id]**

body `{human_verdict?, human_note?}`，update 并返回更新后记录。

- [ ] **Step 5: GET /api/runs/[id]/export**

`csv.ts`：`toCsv(rows: object[]): string`（处理引号转义）。导出列：姓名、年限、AI档位、人工档位、分数、理由、风险点、备注、文件名。`Content-Disposition: attachment; filename=run_<id>.csv`。

- [ ] **Step 6: 手写 curl 冒烟（或 vitest 集成测试用 next 测试工具）**

- [ ] **Step 7: Commit** `feat(resume-screening): api routes for runs/candidates/export`

---

### Task 5: 前端页面（首页 + 审核队列 + 详情）

**Files:**
- Create: `apps/resume-screening/src/app/layout.tsx`, `globals.css`
- Create: `apps/resume-screening/src/app/page.tsx`（首页：JD+上传+进度）
- Create: `apps/resume-screening/src/app/runs/[id]/page.tsx`（审核队列）
- Create: `apps/resume-screening/src/components/CandidateDrawer.tsx`（详情+改判）

**Interfaces:**
- Consumes: Task 4 的 API

- [ ] **Step 1: layout + globals.css（Tailwind 引入）**

- [ ] **Step 2: 首页 page.tsx**

客户端组件。JD textarea + `<input type=file multiple accept=.pdf>` + 开始按钮。提交：先 POST /api/runs（FormData），再 POST process，然后每 2s 轮询 GET /api/runs/[id]，进度 = done/total。完成后自动跳转 `/runs/[id]`。

- [ ] **Step 3: 审核队列 page.tsx**

服务端组件取数 + 客户端交互。表格列：姓名、年限、档位 badge（recommend 绿/hold 黄/reject 红/needs_manual 灰）、分数、一句话理由、操作（详情）。顶部：档位过滤按钮组 + 姓名搜索框 + 导出 CSV 按钮（`<a href=/api/runs/[id]/export>`）。按 ai_score 降序，needs_manual/failed 沉底。

- [ ] **Step 4: CandidateDrawer.tsx**

点击行展开右侧 drawer：显示完整 extract_json + score_json + 改判下拉 + 备注 textarea + 保存（PATCH）。

- [ ] **Step 5: 手动验证 `npm run dev` 全流程**

- [ ] **Step 6: Commit** `feat(resume-screening): upload page + review queue ui`

---

### Task 6: 端到端冒烟 + 文档 + 环境样例

**Files:**
- Create: `apps/resume-screening/.env.example`
- Create: `apps/resume-screening/README.md`（如何跑）
- Create: `apps/resume-screening/scripts/smoke.ts`（生成 3 份合成 PDF 简历→跑全流程→断言 DB 有结果）
- Modify: 根 `README.md`（加 Wave 1 链接）

- [ ] **Step 1: .env.example**

```
ANTHROPIC_API_KEY=sk-ant-...
# DB_PATH 可选，默认 ./data.db
```

- [ ] **Step 2: smoke.ts**

用 pdfkit 或现成库生成 3 份文本型 PDF（合成简历：张三 5 年前端、李四 3 年产品、王五扫描件模拟=空文本 PDF），插入 run，跑 processCandidate，断言 2 份有分数、1 份 needs_manual。

- [ ] **Step 3: 跑 smoke 通过**

- [ ] **Step 4: README.md（app 级）**：安装、配 key、`npm run dev`、smoke 命令

- [ ] **Step 5: Commit** `test(resume-screening): e2e smoke + docs`

---

## Self-Review

**Spec coverage:** §3.1 输入→T4 Step1；§3.2 处理→T2/T3；§3.3 队列→T5；§3.4 非功能→T1(WAL)/T3(token)/T6(smoke)；§5 验收→T6+手动验证。覆盖完整。

**Placeholder scan:** 无 TBD/TODO；所有测试和关键实现给了代码骨架。

**Type consistency:** `ExtractResult`/`ScoreResult`/`Usage` 在 T2 定义，T3/T4 引用一致；`processCandidate(candidateId: number)` T3 定义 T4 消费一致。

## 执行方式

Subagent-Driven：每 Task 一个 subagent，两阶段评审（实现后 + 测试后）。T1–T3 可串行快速过，T4–T5 是主体，T6 收尾。
