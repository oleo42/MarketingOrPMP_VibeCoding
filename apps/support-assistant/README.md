# support-assistant —— 邮件安全排障 RAG 原型

> 作品集级原型：107 份真实 Microsoft 邮件安全排障 case（脱敏后），验证一条「词法检索 + 标题索引 → LLM 生成 → 评委打分」的 RAG 最小闭环。
> 定位：作为 `template/src/rag/` 的第一个语料实例。核心检索代码已泛化进 template，本目录保留语料 + 领域评测数据。

---

## 从零复现（3 步）

前置：`D:/Learning_ob_vault` 里已有 107 个 `#case` 排障文件（含 `templates` 子目录，脚本自动排除）。

支持复杂工程没有独立的 node_modules，`tsx`/`vitest`/`tsc` 借用 `apps/resume-screening` 的（monorepo「复制优于复用」约定，本目录是轻量原型未独立 install）。

### 第 1 步：脱敏 + 产出语料（Python，唯一真相源）

```bash
cd apps/support-assistant
python scripts/desensitize.py
```

产出 3 个文件（`data/`）：
- `corpus.jsonl` —— 107 行，`{id, title, text}` 脱敏全文
- `chunks.jsonl` —— by-file 单 chunk（当前无生产消费者，evaluate 内存重新 chunk）
- `desensitization-report.md` —— 20 类 PII 脱敏统计（明文密码 1 / GUID 340 / 客户邮箱 219 / 租户 65 …）

> 脱敏规则（10 步，按泄露风险降序）只在此脚本，零泄露验证通过。TS 侧**不**二次脱敏。

### 第 2 步：跑检索评测（canonical 数字）

```bash
cd apps/resume-screening
npx --no-install tsx ../support-assistant/scripts/evaluate.ts \
  --corpus ../support-assistant/data/corpus.jsonl --topK 5
```

期望输出（2026-10-08 实测）：

```
recall@5: 100.0%
MRR: 0.979
24/24 queries hit a gold doc in top-5
```

### 第 3 步：标题权重消融（证真，非标题循环）

```bash
cd apps/resume-screening
npx --no-install tsx ../support-assistant/scripts/ablate-title.ts
```

期望输出：`titleWeight=0`（纯正文）下 recall@5 仍 100%——证明检索质量来自正文，不是靠 title=文件名 的循环命中。

---

## 文件结构

```
apps/support-assistant/
├── data/
│   ├── corpus.jsonl               # 脱敏后全文（第 1 步产物）
│   ├── chunks.jsonl               # by-file 单 chunk（当前无消费者）
│   └── desensitization-report.md  # 脱敏审计
├── scripts/
│   ├── desensitize.py             # 唯一真相源：脱敏 + 产出语料
│   ├── evaluate.ts                # 检索评测 CLI（recall@k + MRR）
│   ├── ablate-title.ts            # titleWeight 消融对照实验
│   ├── judge-calibrate.ts         # judge faithfulness 校准（真实 LLM，串行）
│   └── ingest.ts                  # ⚠️ 早期遗留：职责已被 desensitize.py 吞并
└── src/rag/
    ├── chunker.ts                 # ↓ 语料无关 core（已泛化进 template/src/rag/）
    ├── retrieve.ts
    ├── generate.ts
    ├── judge.ts
    ├── eval.ts
    ├── corpus.ts                  # ⚠️ 早期遗留：case 包装层，无生产调用者
    ├── goldset.ts                 # 领域数据：24 条内容锚定评测条目
    └── judge-calibration.ts       # 领域数据：20 条 judge 校准集
```

**core 与领域数据的边界**：`chunker/retrieve/generate/judge/eval` 五份导入闭包零领域依赖（已复刻进 `template/src/rag/`，diff 仅注释泛化、语义等价）；`goldset/judge-calibration` 引用具体 case 主题，是领域数据，留在本目录。

---

## 评测方法（为什么数字可辩护）

- **gold set 内容锚定**（`goldset.ts`）：query = 自然用户症状描述；gold 判定 = 正文 symptom/cause/resolution 含答案，每条 `reason` 引用正文原文作证。
- **三阶段收敛**：迭代 #1 发现 title 权重让 recall 假 100%（循环论证）→ 迭代 #2 杀掉循环（query 脱文件名）→ 迭代 #3 剔除「无答案」的低信号 case。详见 `D:/projects/knowMyself/docs/verification/2026-10-08-rag-iteration-*.md`。

### 已知限制（诚实声明，不假装解决）

recall@5 = 100% 依然**可能**是更隐蔽的同源偏差：query 由我自己照正文症状撰写，可能从「标题循环」滑向「正文循环」。公平评测的正解是用**独立 query 源**（真实用户提问语料，或 LLM 只看 symptom 提纲、不看正文时独立生成 query）。当前数字的诚实边界是「symptom 形式的 query + 正文检索能找回全部有答案的 case」，**不对外宣称召回率 100%**。

---

## 死代码说明

`scripts/ingest.ts` + `src/rag/corpus.ts`：早期「读 md → 切 chunk」路径。2026-10-09 脱敏收敛后，`desensitize.py` 单点完成「收集 #case 文件 + 脱敏 + by-file chunk」，这两份职责被吞并，grep 确认无生产调用者（仅 corpus.test.ts 自测）。保留原因是此前任务有意收敛为「TS 侧仅做 case 包装透传」的入口；若要接入 TS 直读 raw md 的场景可复用，否则可删。