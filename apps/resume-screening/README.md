# 简历初筛 Agent（resume-screening）

本地可跑的简历初筛 Web 应用：上传 PDF 简历 + JD → LLM 批量抽取打分 → 人工审核队列改判 → 导出 CSV。

## 技术栈

Next.js 15（App Router）· TypeScript · Tailwind · better-sqlite3（WAL）· @anthropic-ai/sdk · pdf-parse · Vitest

## 安装

```bash
cd apps/resume-screening
npm install
```

## 配置

```bash
cp .env.example .env.local
```

编辑 `.env.local` 填入 Anthropic API key：

```
ANTHROPIC_API_KEY=sk-ant-...
# DB_PATH 可选，默认 ./data.db
```

不配置 key 也能启动应用和跑测试 / smoke，但真实 LLM 抽取打分会失败（候选人标记 `failed`）。

## 运行

```bash
npm run dev        # http://localhost:3000
```

使用流程：

1. 首页粘贴 JD，多选上传 PDF 简历，点「开始筛选」
2. 页面每 2s 轮询进度（done/total），完成后自动跳转审核队列
3. 审核队列：按档位过滤 / 姓名搜索 / 分数排序（needs_manual、failed 沉底）
4. 点「详情」打开 drawer：查看完整 extract / score JSON，人工改判档位 + 备注（PATCH 保存）
5. 「导出 CSV」下载本批次结果

## 冒烟测试（不需要 API key）

```bash
npm run smoke
```

用 `test-fixtures/` 的 4 份合成简历跑全流程：真实 PDF 解析 + mock LLM（依赖注入，不调 Anthropic API），断言：

- zhangsan / lisi / wangwu 三份文本简历有 AI 分数与档位（`scored`）
- `scanned_empty.pdf`（模拟扫描件）标记 `needs_manual`
- run 的 done / status / token 用量正确累加

fixtures 重新生成：`npx tsx scripts/gen-fixtures.ts`

> 注意：fixture PDF 由 pdfkit 内置 Helvetica 生成，无 CJK 字形，中文文本抽取为乱码。smoke 的 mock LLM 因此按 ASCII 邮箱匹配候选人。真实使用走 Anthropic API，无此限制。

## 测试

```bash
npx vitest run     # 22 个单元测试（db / llm client / pipeline / csv）
```

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
  llm/                       Anthropic 封装（模型分层 + 重试 + zod 校验）
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
