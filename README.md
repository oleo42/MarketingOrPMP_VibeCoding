# MarketingOrPMP_VibeCoding

面向消费电子企业业务场景的 **VibeCoding 方案库**：用 agentic coding 工具（Claude Code / Codex）为市场营销（GTM）、研发项目管理（IPD）、招聘与人才管理三大业务域设计和交付可生产的 Agent 系统，并沉淀工程化方法让业务专家能自助开发简单 Agent。

本仓库将问题拆解为三层资产：

1. **系统方案库**（17 项）—— 三大业务域可 vibe 的系统清单，含数据来源、核心 AI 环节、工程量及依据
2. **工程加速方法论** —— 需求不精简前提下的四条工程加速路径（多 Agent 并行 / 模型分层 / Worktree 隔离 / 规约驱动开发），附外部研究佐证与代价对比
3. **实现** —— 母模板先行，按复用链逐域落地。已交付三个可跑实例：**简历初筛 Agent**（Wave 1，真实 LLM 端到端验证）、**邮件安全排障 RAG**（107 份真实 case 的词法检索+LLM+评委打分闭环）、**用户之声 VoC 卖点共鸣榜**（市场及格线 4/4：可重复数据接入 / 声量×情感交叉双面榜 / 趋势 / 可导出报告，附真实数据洞察）


## 目录

```
template/                      # 母模板 + 《Agent 工程化手册》(README.md)
  src/{db,llm,lib,components}  # 可复用骨架：数据接入→LLM批处理→人工审核→看板/导出
apps/
  resume-screening/            # Wave 1 实例：简历初筛 Agent（可 npm run dev）
  support-assistant/           # 邮件安全排障 RAG 原型（107 真实 case，词法检索+LLM+评委打分）
  voc-analysis/                # 用户之声 VoC 卖点共鸣榜（市场及格线 4/4，最成熟实例）
    pipeline/                  #   Python 管道：清洗→LLM情感→关键词卖点匹配→榜单/趋势/报告导出
    src/                       #   Next.js Web UI：双面榜 + 趋势卡 + 产品线对比 + 数据接入 + 报告下载
docs/
  RECORDS.md                                        记录台账（所有关键产出登记）
  analysis/
    2026-09-16-vibecoding-catalog-and-acceleration.md   系统清单 + 工程量 + 加速方案（核心文档）
  specs/   plans/                                   各系统 spec 与实施计划
.omp/AGENTS.md                                      项目约定
```

## 快速开始

三个可跑实例（各 app 有自己的 README 详述）：

**① 用户之声 VoC 卖点共鸣榜**（最成熟，市场及格线 4/4）：
```bash
cd apps/voc-analysis
# 数据已内置(消费电子子集)，直接起 Web UI：
node node_modules/next/dist/bin/next dev -p 3010    # 打开 http://localhost:3010
```
双面榜（好评共鸣/差评吐槽+净共鸣）· 趋势卡 · 产品线对比矩阵 · CSV 上传重跑 · 页头一键导出 Markdown 报告。从零复现管道见 `apps/voc-analysis/README.md`。

**② 简历初筛 Agent（Wave 1）：**
```bash
cd apps/resume-screening
npm install
cp .env.example .env.local        # 编辑填入 LLM key
npm run dev                        # 打开 http://localhost:3000
```

**③ 邮件安全排障 RAG 原型：**
```bash
cd apps/support-assistant
python scripts/desensitize.py     # 脱敏+产出语料（需 D:/Learning_ob_vault 的 107 个 #case 文件）
# 后续步骤见 apps/support-assistant/README.md
```

LLM provider 默认 Volcengine Ark（Coding Plan），在 `.env.local` 配 `VOLCENGINE_API_KEYwinomp=<key>`；切 Anthropic 则设 `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`。详见各 app `.env.example` 与 `template/README.md`。

**做一个新系统：** 按 `template/README.md`（《Agent 工程化手册》）的五步流程——复制 template → 定义 schema → 写领域 prompt → 配置队列列 → 接数据源。

## 方案库速览

| 业务域 | 系统（⭐ 为需求方点名） | 工程量 |
|---|---|---|
| 市场营销 | ⭐达人自动筛选建联、⭐产品客服培训、竞品情报监控、用户之声 VoC、GTM 内容工厂、达人寄样跟踪、营销素材库 | 1–5 天 |
| 研发项目管理 | ⭐会议→行动项自动看板、IPD 阶段门评审助手、研发周报、缺陷/客诉分诊、项目风险雷达 | 1–5 天 |
| 招聘人才 | 简历初筛、候选人 outreach、面试题+纪要分析、人才库激活、入职引导 Bot | 0.5–2 天 |

## 工程加速四方案（需求不变，纯工程视角）

| 方案 | 解决什么 | 日历时间 | Token 成本 | 返工风险 |
|---|---|---|---|---|
| A 多 Agent 并行流水线 | 串行等待 | 0.5x | 3–5x | 中 |
| B 模型分层路由 | 返工（设计错误） | 0.8x | 1.5–2x | 低 |
| C Worktree 隔离并行 | 代码冲突等待 | 0.7x | 2–3x | 中低 |
| D 规约驱动开发 SDD | 需求误解返工 | 0.7x（含 spec） | 1.2–1.5x | 最低 |

依据与外部研究（ChatDev / MetaGPT / UA-ChatDev / METR 2025 RCT / Claude Code Sub-Agents 生产案例 / Spec Kit·Kiro·BMAD）详见核心文档。

## 三条业务红线

1. 外发内容（建联话术、候选人沟通）必须人工点头发送
2. 招聘 Agent 不做全自动拒人，人做最终决定
3. 抓取类功能优先用导出数据，注意平台 ToS
