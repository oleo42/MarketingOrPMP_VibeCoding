# 简历初筛 Agent（resume-screening）

HR 每天要手动筛几百份 PDF 简历——逐份打开、对照 JD、凭感觉分堆，一份简历几分钟，一天就没了。这个本地可跑的 Web 应用把「读简历 → 抽取 → 打分 → 分档」交给 LLM 批量完成，**但把最终决定留给人**：AI 给出初筛建议（推荐/待定/拒绝 + 分数 + 理由），HR 在审核队列里复核、改判、备注，最后一键导出 CSV。扫描件、解析失败的简历不强行打分，标记 `needs_manual` 交回人工——不全自动拒人，是招聘场景的业务红线。

## 界面截图

![上传页：粘贴 JD + 上传 PDF 简历 + 实时进度](docs/screenshots/upload.png)

> 首页：粘贴 JD，多选/拖拽上传 PDF 简历，每 2s 轮询处理进度（done/total）。

![审核队列：AI 打分 + 档位过滤 + 人工改判](docs/screenshots/review-queue.png)

> 审核队列：按档位过滤、姓名搜索、分数排序（needs_manual/failed 沉底）；详情 drawer 查看完整 extract/score JSON，人工改判档位 + 备注。

## 核心能力

- **批量初筛**：粘贴一段 JD，一次拖入几十份 PDF 简历，LLM 逐份抽取结构化信息（姓名/年限/技能/亮点）并按 JD 打分分档（recommend/hold/reject，0-100 分 + 理由 + 风险点），实时进度条可见。
- **人工复核与改判**：AI 只给建议，人做最终决定。审核队列支持按档位过滤、按姓名搜索、按分数排序；点开详情 drawer 可查看完整 extract/score JSON、改判档位、写备注（PATCH 保存）。
- **诚实处理异常**：扫描件等抽不出文本的 PDF 标记 `needs_manual`，不假装能读、不强行打分；处理失败的标 `failed`。两者在排序中沉底但不隐藏。
- **结果导出**：一键下载本批次 CSV，含 AI 分数/档位/理由与人工改判结果。
- **成本可控**：模型分层路由（抽取用快模型、打分用强模型，可配置），token 用量逐 run 累加可查。

## Quick Start

```bash
cd apps/resume-screening
npm install
cp .env.example .env.local   # 填入 LLM key（见下）
npm run dev                  # http://localhost:3000
```

`.env.local` 配置（二选一）：

```bash
# 默认 provider：Volcengine Ark（Coding Plan 端点）
LLM_PROVIDER=ark
VOLCENGINE_API_KEYwinomp=...

# 或 Anthropic
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-...
```

模型可用 `EXTRACT_MODEL` / `SCORE_MODEL` 覆盖（默认：ark 用 `ark-code-latest`；anthropic 抽取 `claude-sonnet-4-5`、打分 `claude-opus-4-5`）。`DB_PATH` 可选，默认 `./data.db`。

不配置 key 也能启动应用、跑全部测试和 smoke，但真实 LLM 抽取打分会失败（候选人标记 `failed`）。

**使用流程**：

1. 首页粘贴 JD，多选上传 PDF 简历，点「开始筛选」
2. 页面每 2s 轮询进度（done/total），完成后自动跳转审核队列
3. 审核队列：按档位过滤 / 姓名搜索 / 分数排序（needs_manual、failed 沉底）
4. 点「详情」打开 drawer：查看完整 extract / score JSON，人工改判档位 + 备注（PATCH 保存）
5. 「导出 CSV」下载本批次结果

## 怎么工作

```
上传 PDF + JD
  → POST /api/runs 建 run（multipart: jd_text + files[]）
  → 每份简历走 processCandidate pipeline：
      pdf-parse 解析文本 ──抽不出文本→ needs_manual，不送 LLM
      → LLM 抽取（extract）→ LLM 按 JD 打分（score）
      → 写回 DB，累加 token 用量，逐步记录 candidate_events
  → 前端每 2s 轮询 run 进度，完成跳转审核队列
  → 人工复核 / 改判（PATCH /api/candidates/[id]）
  → GET /api/runs/[id]/export 导出 CSV
```

架构骨架来自母模板 `template/` 的 Wave 1 实例：**数据接入 → LLM 批处理 → 人工审核 → 看板/导出**，可复用到其他「AI 初筛 + 人终审」场景。

**LLM 封装**（`src/llm/`）：provider 抽象（Anthropic / Volcengine Ark 双实现，环境变量切换）→ 模型分层路由（EXTRACT/SCORE 各自可配）→ 失败后重试一次 → zod 校验结构化输出（含 markdown fence 剥离与首个 JSON 对象提取）。LLM 原始响应文本（raw）一并入库，zod 解析失败/截断时可直接排障。

**pipeline 留痕**（`src/lib/process.ts`）：每次状态迁移记录到 `candidate_events` 表，异常状态（failed/needs_manual）由此自然显形，详情页直接可读；catch 不静默，失败记事件和进程日志（含错误消息与堆栈）；单候选人处理永不抛异常，始终累加 run.done 与 token 用量。

## 设计取舍

- **人机协同而非全自动**：AI 打分只是初筛建议，档位/分数/理由全部可被人改判覆盖，导出时人工结论与 AI 结论并存。扫描件与解析失败标 `needs_manual` 而非猜一个分——宁可交回人工，不让算法误拒候选人。
- **better-sqlite3（WAL 模式）**：本地单文件、零外部依赖，clone 下来即可跑；WAL 允许轮询读与批量写并发。对个人/小团队工具，引入外部 DB 是过度工程。
- **mock LLM 依赖注入**：`processCandidate` 的 LLM 实现可通过 `setLlm()` 替换，smoke 测试因此能跑真实 PDF 解析 + 全 pipeline 而不调真实 API、不花一分钱、不需要 key。
- **模型分层**：抽取（结构化、机械）与打分（判断、推理）分离，允许用便宜模型跑大批量抽取、强模型只做打分，平衡成本与质量。

## 效果与验证

- **22 个单元测试**（`npx vitest run`）：覆盖 db / llm client / pipeline / csv。
- **端到端冒烟**（`npm run smoke`，不需要 API key）：用 `test-fixtures/` 的 4 份合成简历跑通 建 run → processCandidate → 断言 DB，PDF 解析走真实 pdf-parse，LLM 依赖注入 mock。断言：
  - zhangsan / lisi / wangwu 三份文本简历有 AI 分数与档位（`scored`）
  - `scanned_empty.pdf`（模拟扫描件）标记 `needs_manual`
  - run 的 done / status / token 用量正确累加
- fixtures 重新生成：`npx tsx scripts/gen-fixtures.ts`

## 局限与边界

- fixture PDF 由 pdfkit 内置 Helvetica 生成，**无 CJK 字形**，中文文本抽取为乱码，smoke 的 mock LLM 因此按 ASCII 邮箱匹配候选人。真实使用走 Anthropic/Ark API，无此限制。
- 重试策略为失败后重试一次，非指数退避；对持续性 API 故障，候选人会落 `failed` 由人工兜底。
- 单机本地应用：无多用户/权限体系，SQLite 单文件即全部状态，适合个人或小团队，不适合多租户 SaaS 部署。

## 技术栈

Next.js 15（App Router）· TypeScript · Tailwind · better-sqlite3（WAL）· @anthropic-ai/sdk · pdf-parse · Vitest

## 目录结构

```
src/
  app/
    page.tsx                 首页（JD + 上传 + 进度轮询）
    runs/[id]/page.tsx       审核队列
    api/runs/                建 run / 查询 / 触发处理 / 导出 CSV
    api/candidates/[id]/     GET 详情 + PATCH 人工改判
  components/CandidateDrawer.tsx   详情 drawer（改判 + 备注）
  db/                        SQLite 单例 + schema 迁移
  llm/                       LLM 封装（provider 抽象 + 模型分层 + 重试 + zod 校验）
  lib/                       pdf 解析 / processCandidate pipeline / csv
scripts/
  gen-fixtures.ts            生成合成简历 PDF
  smoke.ts                   端到端冒烟（mock LLM）
test-fixtures/               4 份合成简历 PDF
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/runs` | multipart：`jd_text` + `files[]` → `{run_id}` |
| POST | `/api/runs/[id]/process` | 异步触发批量处理 → `{started:true}` |
| GET | `/api/runs/[id]` | run 元信息 + 候选人列表 |
| GET | `/api/candidates/[id]` | 单个候选人完整行（含 extract/score JSON） |
| PATCH | `/api/candidates/[id]` | body `{human_verdict?, human_note?}` 人工改判 |
| GET | `/api/runs/[id]/export` | 下载 CSV |
