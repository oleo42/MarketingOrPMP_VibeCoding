# 简历初筛 Agent Spec

- 日期：2026-09-16
- 状态：已确认（用户全权委托，按推荐项执行）
- 所属：Wave 1 / 母模板基线

## 1. 目标

上传一批简历 PDF + 一个 JD，系统自动完成结构化抽取、按 JD 打分、分三档，HR 在审核队列里确认/改判后导出结果。单租户、无登录、本地可跑。

## 2. 用户流程

1. 打开首页 → 粘贴 JD 文本 → 拖入 1–50 份 PDF → 点"开始初筛"
2. 系统逐份解析 PDF → LLM 抽取+打分 → 实时显示进度（n/50 完成）
3. 全部完成后跳转审核队列页：表格按分数降序，列：姓名、年限、档位、分数、一句话理由、操作
4. HR 可点任意行看详情（完整 JSON + 理由 + 风险点），可改判档位、写备注
5. 点"导出 CSV"下载当前队列快照

## 3. 功能需求

### 3.1 输入
- JD：纯文本，textarea，必填，上限 8000 字
- 简历：PDF 文件，1–50 份，单份 ≤10MB，拖入或点选
- 扫描件/图片型 PDF：不强制解析，标记 `parse_status=needs_manual`，进队列底部

### 3.2 处理
- 每份简历独立调用 LLM（逐份并发，失败隔离），并发上限 5
- 模型分层：
  - 抽取：Claude Sonnet → 固定 JSON schema（见 4.2）
  - 打分+理由：Claude Opus → 基于抽取结果+JD，出三档判定+分数(0-100)+理由+风险点
- 失败重试：单次失败自动重试 1 次，仍失败标记 `parse_status=failed`，不阻塞整批

### 3.3 审核队列
- 表格视图：姓名、工作年限、当前档位（推荐/待定/不合适/解析失败）、分数（降序）、一句话理由、操作（详情/改判/备注）
- 改判：下拉选新档位，立即生效，记录 `human_verdict` 和 `human_note`
- 过滤：按档位筛选；搜索：姓名关键词
- 导出 CSV：列 = 姓名、年限、AI档位、人工档位、分数、理由、风险点、备注、文件名

### 3.4 非功能
- 单租户无认证；数据只存本地 SQLite
- 50 份简历端到端 ≤10 分钟（含解析+LLM）
- Token 用量记录到 `runs` 表

## 4. 技术设计

### 4.1 栈
- Next.js 15 App Router + TypeScript + Tailwind
- SQLite (better-sqlite3)，WAL 模式
- Anthropic SDK（@anthropic-ai/sdk）
- PDF 解析：pdf-parse（Node 原生）；扫描件检测 = 提取文本 <100 字则标记 needs_manual
- 导出：服务端生成 CSV，Blob 下载

### 4.2 LLM 输出 schema

抽取（Sonnet）：
```json
{
  "name": "string",
  "years_experience": "number",
  "skills": ["string"],
  "highlights": ["string"],
  "raw_summary": "string (<=200字)"
}
```

打分（Opus）：
```json
{
  "verdict": "recommend | hold | reject",
  "score": "number 0-100",
  "reason": "string (<=100字)",
  "risks": ["string"]
}
```

### 4.3 数据模型

```sql
runs(id INTEGER PK, jd_text TEXT, total INT, done INT, status TEXT,  -- pending/running/done/failed
     input_tokens INT, output_tokens INT, created_at TEXT, finished_at TEXT)

candidates(id INTEGER PK, run_id INT FK, filename TEXT, file_path TEXT,
           parse_status TEXT,  -- ok/needs_manual/failed
           extract_json TEXT,  -- 抽取结果 JSON
           score_json TEXT,    -- 打分结果 JSON
           ai_verdict TEXT, ai_score INT,
           human_verdict TEXT, human_note TEXT,
           created_at TEXT)
```

### 4.4 页面/路由
- `/` 首页：JD 输入 + 文件上传 + 开始按钮 + 进度条
- `/runs/[id]` 审核队列：表格 + 过滤 + 搜索 + 导出按钮
- `/runs/[id]/candidates/[cid]` 详情侧栏（或 modal）：完整 JSON + 改判 + 备注

### 4.5 API
- `POST /api/runs` 创建 run（JD + 文件列表），返回 run_id
- `POST /api/runs/[id]/process` 触发后台处理（流式或轮询进度）
- `GET /api/runs/[id]` 队列数据（含进度）
- `PATCH /api/candidates/[id]` 改判/备注
- `GET /api/runs/[id]/export` 下载 CSV

## 5. 验收标准

- [ ] 上传 10 份真实/合成 PDF + JD，10 分钟内全部出结果
- [ ] 扫描件正确标记 needs_manual，不阻塞其他
- [ ] 改判后导出 CSV 含 human_verdict
- [ ] 中途刷新页面，进度和已结果不丢（SQLite 持久化）
- [ ] `npm run dev` 一键启动，无需额外服务

## 6. 范围外（v2+）

- 用户体系/权限
- 改判案例回流训练 prompt
- 多 JD 对比、人才库激活
- 部署到公网

## 7. 母模板沉淀要求

本系统完成后，以下内容抽到 `template/`：
- 数据库初始化+迁移模式
- LLM 客户端封装（模型分层、重试、token 统计）
- 审核队列 UI 组件（表格+过滤+改判+导出）
- 文件上传→处理→进度 的 API 模式
