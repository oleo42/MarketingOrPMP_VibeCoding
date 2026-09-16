# Agent 工程化手册

> 面向业务专家的自助开发指南：照着本手册 + 本目录的代码骨架，就能做出第二个、第三个 Agent 系统。
>
> 本模板的出处：第一个跑通的系统 `apps/resume-screening/`（简历初筛 Agent）已验证了全部模式，本目录是它的泛化副本。遇到不确定的地方，去看 resume-screening 对应的文件怎么写。
>
> 前置：会用 Claude Code / Codex 这类 agentic coding 工具。本手册里"让 AI 改代码"是默认动作。

---

## 目录

1. [四段式架构：所有系统的共同骨架](#1-四段式架构)
2. [五步做出一个新系统](#2-五步做出一个新系统)
3. [LLM provider 切换与模型分层](#3-llm-provider-切换与模型分层)
4. [17 个可复用系统定制索引](#4-17-个可复用系统定制索引)
5. [三条业务红线（不可违反）](#5-三条业务红线)
6. [技术底座速查](#6-技术底座速查)
7. [可观测性：四闸口日志体系](#7-可观测性四闸口日志体系)

---

## 1. 四段式架构

我们验证过的 14 个业务系统都是同一个骨架（详见 `docs/patterns.md` 的模式说明）：

```mermaid
flowchart LR
    A[1 数据接入<br/>PDF/Excel/贴文本] --> B[2 LLM 批处理<br/>抽取→评分<br/>两级模型]
    B --> C[3 人工审核<br/>队列+详情改判<br/>人做最终决定]
    C --> D[4 看板/导出<br/>进度/CSV/飞书推送]
```

| 段 | 职责 | 模板代码 | 可替换点 |
|---|---|---|---|
| 1 数据接入 | 把业务数据变成 pending 记录 + 纯文本 | `src/lib/pdf.ts`（解析）、上传 API 模式 | 解析器类型（PDF/Excel/文本）、上传表单字段 |
| 2 LLM 批处理 | 并发跑"抽取→评分"，落库 + token 统计 | `src/llm/`（provider/client/schemas）、`src/lib/process.ts` | **两个 prompt + 两个 zod schema（唯一必须手写的业务知识）** |
| 3 人工审核 | 浏览 AI 建议，人改判定案 | `src/components/ReviewTable.tsx`、`ReviewDrawer.tsx` | 表格列配置、档位文案、详情展示字段 |
| 4 看板/导出 | 进度跟踪、结果离开系统 | `src/lib/csv.ts`、批次轮询模式 | CSV 列、飞书 webhook、业务状态机扩展 |

**四段之间的关系**：1、2 段是"AI 干活"，3 段是"人把关"，4 段是"结果进流程"。AI 提建议、人做决定——这个分工是设计出来的，不是妥协：全自动意味着错一次就失去业务方信任，人工审核把信任成本降到最低，同时把 AI 的产出变成"越看越有数据"的资产（human_verdict 与 ai_verdict 的差异就是 prompt 调优的方向）。

---

## 2. 五步做出一个新系统

以"达人自动筛选建联"为例（对照：简历初筛的做法写在每一步后面）。

### 第 1 步：复制模板（10 分钟）

```bash
cp -r template apps/<新系统名>     # 如 apps/influencer-screening
cd apps/<新系统名>
```

然后从 `apps/resume-screening/` 复制工程外壳并按需改 `name`：

```bash
cp apps/resume-screening/{package.json,tsconfig.json,next.config.ts,tailwind.config.ts,postcss.config.mjs,.env.example,.gitignore} apps/<新系统名>/
cd apps/<新系统名> && npm install
```

> 对照：简历初筛的 package.json 依赖就是全集——next 15 / better-sqlite3 / @anthropic-ai/sdk / pdf-parse / zod / p-limit / vitest。Excel 场景加 `xlsx` 包。

### 第 2 步：定义 schema（30 分钟）

改 `src/db/schema.sql`：

- `batches.context_text` 改名为你的批次上下文字段（达人筛选：合作 brief；简历初筛：JD 全文 `jd_text`）。
- `items` 表加 1–3 个业务冗余列，只加列表页高频展示的（达人筛选：昵称、粉丝数；简历初筛：姓名 `name`、年限 `years_experience`）。
- **不动**：status 五值状态机、extract_json/score_json、ai_*/human_* 字段组。这是审核 UI 的数据契约。

```bash
npm run db:migrate   # 或启动应用后任一 API 自动迁移（幂等）
```

### 第 3 步：写领域 prompt（1–2 小时，核心工作）

参考 `src/llm/domain.example.ts`，新建 `src/llm/domain.ts`，写四个东西：

1. **ExtractSchema（zod）**：从原始文本抽什么字段。
2. **EXTRACT_SYSTEM（prompt）**：角色 + 输出形状 + `output ONLY a JSON object`（这句必须有）。
3. **ScoreSchema（zod）**：三档 verdict + score 0-100 + reason ≤300 字 + risks[]。
4. **SCORE_SYSTEM（prompt）**：评分 rubric——什么算 recommend、什么算 reject，写得越具体，AI 越稳。

> 对照：简历初筛的 prompt 见 `apps/resume-screening/src/llm/client.ts` 的 EXTRACT_SYSTEM/SCORE_SYSTEM；评分标准（"recruiter 视角、给理由和风险点"）是让人工审核敢确认的关键。
>
> Excel 数据源（如达人名单）跳过抽取 prompt——数据已结构化，LLM 只做评分/生成。

### 第 4 步：配置队列列（30 分钟）

在审核页用 `ReviewTable` 传 `columns` 配置：

```tsx
<ReviewTable
  rows={items}
  columns={[
    { key: 'nickname', title: '昵称' },
    { key: 'followers', title: '粉丝数', align: 'right' },
    { key: 'ai_score', title: 'AI 分', align: 'right' },
    { key: 'reason', title: '理由', render: (r) => <span title={r.reason}>{r.reason}</span> },
  ]}
  verdictLabels={{
    recommend: { label: '优先建联', className: 'bg-green-100 text-green-800' },
    hold:      { label: '备选',     className: 'bg-yellow-100 text-yellow-800' },
    reject:    { label: 'pass',    className: 'bg-red-100 text-red-800' },
  }}
  onSelect={(id) => setSelected(id)}
/>
<ReviewDrawer itemId={selected} apiBase="/api/items" verdictOptions={[...]} ... />
```

档位文案随业务改（推荐/待定/拒绝 → 优先建联/备选/pass），保持三档结构。

### 第 5 步：接数据源（1 小时 – 半天）

三选一（成本升序）：

| 形态 | 做法 | 模板支撑 |
|---|---|---|
| 贴文本 | textarea → POST 建 batch + 单 item | 首页表单模式（见 resume-screening `app/page.tsx`） |
| Excel 导入 | `xlsx` 解析，每行 INSERT 一个 item | `lib/pdf.ts` 同目录加 `excel.ts` |
| 文件上传 | multipart → 存 uploads/ → parse | POST route 模式 + `lib/pdf.ts` |

跑通验收标准：建一个批次 → 处理完成（done/total 满）→ 审核队列能过滤/搜索/改判 → 导出 CSV 中文不乱码。用依赖注入 mock 掉 LLM（`process.ts` 的 hooks 参数）可以先无 key 冒烟全链路。

---

## 3. LLM provider 切换与模型分层

### Provider 切换

环境变量控制，代码零改动（`src/llm/providers.ts`）：

```bash
# 默认：火山引擎 Ark（Coding Plan 端点，成本最低）
LLM_PROVIDER=ark
VOLCENGINE_API_KEYwinomp=...        # 或 ARK_API_KEY
# ARK_BASE_URL 默认 https://ark.cn-beijing.volces.com/api/coding/v1
# 注意：必须用 /api/coding/v1 端点，/api/v3 走普通计费，贵。

# 备选：Anthropic
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

新增 provider（如内部网关）：实现 `LlmProvider` 接口（一个 `chat()` 方法），在 `getProvider()` 加一个分支。

### 模型分层原则

**强模型做判断，弱模型做苦力。** 两次调用分开配模型：

| 调用 | 环境变量 | 默认（Ark / Anthropic） | 选型逻辑 |
|---|---|---|---|
| 抽取 extract | `EXTRACT_MODEL` | ark-code-latest / claude-sonnet-4-5 | 结构化抽取是模式匹配，弱模型足够，量大要省钱 |
| 评分 score | `SCORE_MODEL` | ark-code-latest / claude-opus-4-5 | 理由和风险点直接决定人敢不敢确认 AI，用最强 |

实操建议：

1. **开发期全用最便宜的**跑通链路，再用真数据评哪级需要升级。
2. 升级顺序永远是先升 score 模型。抽取错一两个字段，审核时人一眼能看到；评分理由写得烂，整个系统失去信任。
3. 成本看板数据现成：`batches.input_tokens/output_tokens` 每批次累加，周报直接引用。
4. 同一 provider 内大小模型价差通常 3–5 倍；一批 50 条记录，抽取用弱模型省下的钱够评分用强模型烧还有富余。

---

## 4. 17 个可复用系统定制索引

全清单与工程量评估见 `docs/analysis/2026-09-16-vibecoding-catalog-and-acceleration.md`。下表标注每个系统**四段式中哪几段需要定制**（①接入 ②批处理 ③审核 ④看板导出），未标注的段直接用模板默认：

| # | 系统 | 定制段 | 定制要点 |
|---|---|---|---|
| 1 | 简历初筛 Agent ✅已交付 | — | 参考实例 `apps/resume-screening/`，模板从它泛化 |
| 2 | 候选人 outreach 话术 | ②④ | ②单轮生成替代抽取+评分（跳过 ExtractSchema）；④输出话术到 drawer 供复制，**外发必须人工点头（红线一）** |
| 3 | 面试题+面试纪要分析 | ② | ②SCORE_SYSTEM 换成岗位能力 rubric（每岗位一套锚点评分表）；verdict 只做参考，**不自动淘汰（红线二）** |
| 4 | 沉睡人才库激活 | ①② | ①数据源是历史简历库（跑批匹配而非上传）；②评分方向反转（JD→人 改 人→新 JD），话术生成同 #2 |
| 5 | 入职引导 Bot | ①②④ | ①接入内部文档建 RAG（新增向量检索，四段式唯一结构性扩展）；②LLM 改问答式；④checklist 是个普通 CRUD 页 |
| 6 | 达人自动筛选建联 | ①②④ | ①蝉妈妈/飞瓜/星图导出 Excel 导入（**用导出数据不抓取，红线三**）；④加"建联→已读→寄样→挂车"状态机 tab；话术外发人工点头（红线一） |
| 7 | 产品客服培训系统 | ①②④ | ①内部文档 RAG（与 #5 同构，先做这个热身）；②新增角色扮演演练 prompt；④测验成绩单看板 |
| 8 | 竞品情报监控 | ①④ | ①定时任务多源抓取（维护税最高，优先用平台订阅/导出）；③审核降为"日报人工确认"；④飞书日报推送 |
| 9 | 用户之声 VoC 分析 | ②④ | ②两级调用改"情感打标+主题聚类"（嵌入模型批量跑）；④问题榜/卖点共鸣榜看板，人工校验归因闭环 |
| 10 | GTM 内容工厂 | ②③④ | ②生成+爆款库风格 RAG；③审核加重——**每条出站内容必须人工点发（红线一）**；④多渠道素材库 |
| 11 | 达人寄样履约跟踪 | ①④ | ①快递 100 API 轮询 + 抖音发布检测；②几乎无 LLM（轻 AI 重流程）；④状态机+到期自动催办（内部提醒） |
| 12 | 营销素材智能库 | ①② | ①多模态模型批量打标入库；②语义检索替代评分（向量索引）；审核弱化 |
| 13 | 会议→行动项→自动看板 | ②④ | ②抽取行动项/决策（模板 domain.example.ts 就是这个例子）；④看板状态回写+下次开会自动对账 |
| 14 | IPD 阶段门评审助手 | ①② | ①评审材料多格式解析（BOM/测试报告）；②checklist 核查 prompt + 历史坑 RAG；人工主导最重 |
| 15 | 研发周报自动生成 | ①④ | ①飞书项目/多维表格 API 拉数；②汇总生成单轮调用；③PM 确认发出；④定时生成 |
| 16 | 缺陷/客诉智能分诊 | ②④ | ②分类 prompt + 相似 bug 向量检索；④指派建议看板+错误分诊兜底路由 |
| 17 | 项目风险雷达 | ②④ | ②每条风险信号一个检测器 prompt；④管理层看板；误报率靠 human_verdict 反馈迭代压低 |

复用顺序建议（与清单文档一致）：简历初筛 → 人才库激活/面试分析 → 客服培训 → 入职 Bot → 达人筛选 → 寄样跟踪/素材库 → 会议看板 → 周报/风险雷达。

---

## 5. 三条业务红线

**任何系统、任何迭代、任何人提议"自动化掉"时，先对照这三条。**

1. **外发内容必须人工点头。** 建联话术、候选人沟通、GTM 出站文案——AI 生成、人审、人点发送。系统里永远没有"自动发送给外部"的按钮。技术实现：外发动作只能由 human_verdict 通过后的手动操作触发，API 不提供批量自动外发端点。
2. **招聘不自动拒人。** AI 评分只是排序参考，"拒绝"档位不产生任何自动动作（不发拒信、不移出人才库）。AI 可以建议，只有 HR 的 human_verdict 能定案。
3. **抓取类功能优先用导出数据。** 蝉妈妈/飞瓜/星图/电商后台都有官方导出；用导出 Excel 接入，不逆向抓取（封号风险 + 平台 ToS + 维护税）。确需抓取的（竞品监控），先确认频率、账号隔离和法务边界再动手。

---

## 6. 技术底座速查

- **技术栈**：Next.js 15（App Router）· TypeScript · Tailwind · better-sqlite3（WAL，单文件，免运维）· zod · Vitest。
- **本目录代码**：`src/db`（单例+迁移）· `src/llm`（provider/重试/JSON 解析/模型分层）· `src/lib`（pdf/csv/批处理 pipeline/logger）· `src/components`（ReviewTable/ReviewDrawer/ClientErrorReporter）· `src/app`（global-error、api/log/client）· `src/instrumentation.ts`（进程兜底挂载）· `src/llm/domain.example.ts`（领域层写法示例，会议行动项）。每个文件头部注释写明"从哪泛化、保留什么、哪里必须改"。
- **模式细节**：`docs/patterns.md`（每段职责/可替换点/坑/段间契约）。
- **参考实例**：`apps/resume-screening/`（可跑、有 22 个单测 + 无 key 冒烟脚本）。
- **模板定位**：供复制的骨架，语法已验证（tsc 通过）；复制进 Next.js 工程外壳后即可运行，不独立安装。
- **目录约定**：monorepo 下 `apps/<系统名>/` 一系统一目录，共享的只有本模板与文档，不做跨系统代码依赖——复制优于复用，各系统独立演化。

---

*版本：2026-09-16 · 基于 resume-screening 首个生产验证实例抽取 · 同日补入四闸口日志体系*

---

## 7. 可观测性：四闸口日志体系

系统跑起来之后，真正花时间的地方不是"写功能"，而是"出了问题找不着"。这一章讲的是模板内置的日志体系：**不为每类问题埋点，只为"问题可能被吞掉的边界"设闸。** 四个闸口全部已在模板代码里实现（`src/lib/logger.ts`、`src/instrumentation.ts`、`src/app/global-error.tsx`、`src/components/ClientErrorReporter.tsx`、`src/app/api/log/client/route.ts`、`src/db/schema.sql` 的 `item_events` 表、`src/lib/process.ts` 的 `recordEvent`），新系统复制即用，零额外工作。

### 7.1 核心哲学：消除"静默吞掉"，而不是穷尽式记录

排障最大的敌人不是错误多，而是**错误发生了但你不知道**。一个 catch 里什么都不写的代码、一个只在浏览器 console 里闪过的红字、一次 LLM 返回了不合契约的 JSON 却被当成普通失败重试——这些问题的共同点不是"难修"，而是"根本没人看见"。

所以"不漏掉任何问题"的正解不是给每一种错误类型都写日志（那是无底洞，而且日志多到没人看），而是**消除"静默吞掉"这个行为本身**：找到错误从"发生"到"消失"之间可能被吞掉的边界，在边界上设闸。只要每个边界都有收口，任何错误无论从哪里产生，最终都会在某个闸口显形。

### 7.2 四闸口总览

| 闸口 | 位置 | 覆盖什么问题 | 收敛掉了哪些冗余 | 落到哪 |
|---|---|---|---|---|
| **1 进程边界** | 后端所有 catch + 进程级兜底（`instrumentation.ts` 注册 `uncaughtException`/`unhandledRejection`） | Node 崩溃、Promise 拒绝、外部 API 超时、DB 写失败——一切服务端错误 | 不用为"网络错误""数据库错误""解析错误"分别设计日志方案；它们最终都到达某个 catch | pino 结构化 JSON → stdout + `logs/app.log`（`src/lib/logger.ts`） |
| **2 浏览器边界** | `window.onerror` + `unhandledrejection`（ClientErrorReporter）+ React 渲染崩溃兜底（global-error.tsx） | hydration 失败、组件渲染崩溃、前端 fetch 失败、浏览器扩展注入干扰——一切只活在浏览器里的问题 | 不用按 React 错误类型（ErrorBoundary/hydration/资源加载）分别埋点；它们都是浏览器运行时错误事件 | POST `/api/log/client` → 汇入闸口1 的同一个 `logs/app.log`，排障时一处可查 |
| **3 LLM 边界** | provider 调用层返回 `raw` 原始响应（`llm/client.ts` 的 `runLlmTask`） | zod 校验失败、响应截断、verdict 枚举异常、模型答非所问——LLM 输出层的所有"说不清哪里错" | 不用为"解析失败""字段缺失""格式异常"分别猜原因；原始响应在手，一切可溯源 | `item_events.detail.llm_raw`（由 `process.ts` 在每个 `_done` 事件里落库） |
| **4 数据边界** | 状态迁移留痕（`process.ts` 的 `recordEvent`，每次状态跳转写一行） | 详情页空白、状态停在中间不动、"看起来处理完了但结果不对"——沉默的业务异常 | 不用为"详情为什么空""进度为什么卡住"加排查接口；事件流水本身就是答案 | `item_events` 表（`src/db/schema.sql`），按 `item_id` 索引，详情页可直接展示 |

### 7.3 为什么是 4 个闸口，不是 8 个

因为**大部分错误通道是彼此的下游**，在上游设闸就等于给下游全设了闸：

- Node 进程崩溃、未捕获的 Promise 拒绝、外部 API 超时、磁盘写失败——听起来是四类问题，但前两类被 `uncaughtException`/`unhandledRejection` 接住，后两类最终都会 throw 进某个 `catch`。给"catch 收口 + 进程级兜底"设一个闸口，全部覆盖。
- hydration 失败、React 组件渲染抛错、静态资源 404、浏览器扩展改 DOM 导致的脚本错误——听起来也是四类问题，但在浏览器里它们都以 `error` 事件或 React 错误边界的形态出现。给 `window.onerror` + `global-error` 设一个闸口，全部覆盖。

反过来，如果按错误类型埋点（网络错误一个方案、DB 错误一个方案、解析错误一个方案……），你会得到 8 个半吊子方案，每个都要维护，而且总有一个新错误类型不在清单里。**为边界设闸，不为错误类型埋点**——边界是有限的（4 个），错误类型是无限的。

### 7.4 环境维度只抓分叉点

日志里带环境信息是为了回答一个问题：**"这是我代码的问题，还是环境/外部的问题？"** 回答这个问题只需要三个分叉点，模板已经全部带上：

| 分叉点 | 怎么带 | 能区分什么 |
|---|---|---|
| dev / prod | `logger` 的 `base.env`（`NODE_ENV` 推导） | "本地热重载抽风" vs "线上真崩了" |
| 浏览器 + 是否含扩展 | 闸口2 每条都带 `url` + `ua`（User-Agent） | "用户 Chrome 装了翻译扩展改 DOM" vs "我组件真写错了" |
| 哪个 LLM provider | `logger` 的 `base.provider`（`LLM_PROVIDER` 环境变量） | "Ark 今天限流" vs "我 prompt 写崩了" |

不要穷举所有环境变量（Node 版本、操作系统、内存、时区……）。90% 的排障用这三个分叉点就能二分定位；剩下的 10% 真需要时，`logs/app.log` 里的完整 stack 会告诉你去查什么。

### 7.5 裁掉的冗余（反面教材，不要加回来）

以下做法看起来"更保险"，实际上是噪音制造机或过早复杂化，模板有意不做：

1. **进度轮询日志**：前端每 2s 轮询一次批次进度，如果每次都记日志，`app.log` 会被"GET /api/batches/123 → 200"刷屏，真正的错误反而被淹没。轮询是正常流量，不是事件——不记。
2. **按 React 错误类型分别埋点**：hydration 错误一套、ErrorBoundary 一套、资源加载一套——三者都是浏览器运行时错误，闸口2 的 `window.onerror` 一网打尽。分开埋点只是多了三份要维护的代码。
3. **为每种 Node 错误各设一套**：网络错误重试策略、DB 错误熔断、磁盘错误告警——业务系统规模没到那一步。统一的 catch 收口 + 结构化日志足够；真到需要熔断时，你会发现要改的是重试逻辑，不是日志。
4. **过早引入 APM/Sentry**：14 个系统每个都是单进程 + SQLite + 单日志文件，`tail -f logs/app.log | jq` 就能排所有障。Sentry 的 value 在多服务/大流量场景才显现；现在引入等于给每个系统背一个外部依赖和一份告警噪音。等哪个系统真的日活上千了再说。

### 7.6 踩坑记录：pino-pretty 在 Next dev 下自产噪音

**症状**：dev 模式下日志系统自己抛 `Error: the worker has exited`，错误信息指向 pino 内部，查半天以为是日志配置错了。

**原因**：`pino.transport({ target: 'pino-pretty' })` 把格式化跑在 worker 线程里，而 Next dev 的热重载会重建模块图，worker 被回收后 transport 再写就抛错——**日志系统为了美化输出，自己变成了错误源**，正好违反四闸口的初衷。

**解法**（已在 `src/lib/logger.ts` 实现）：dev 下直接写 stdout（pino 默认 JSON，多路输出到控制台 + 文件），不挂 transport。需要美化时离线处理：

```bash
# 实时看错误级别以上
tail -f logs/app.log | jq 'select(.level >= 50)'
# 查某个条目的处理流水（闸口4 的落点）
sqlite3 data.db "SELECT event, from_status, to_status, detail FROM item_events WHERE item_id = 42 ORDER BY id"
```

记住这条原则：**日志系统的第一要务是自己绝不产生噪音。** 美化是锦上添花，可靠是底线。

### 7.7 新系统接入清单

复制模板后，四闸口自动就位，只有两件事要确认：

1. **根 layout 挂一次 `<ClientErrorReporter />`**（参考 resume-screening 的 `app/layout.tsx`）——闸口2 的前半段靠它注册。
2. **领域 hooks 返回 `raw`**：`runLlmTask` 已经返回 `{ data, usage, raw }`，你的 `domain.ts` 把 `raw` 原样透传给 `DomainHooks.extract/score` 的返回值即可（参考 `llm/domain.example.ts` 的写法），`process.ts` 会自动把它落进 `item_events.llm_raw`。

验证方式（与 resume-screening 端到端验证一致）：故意触发四个闸口各一次——

```bash
# 闸口1：让 pipeline 抛错两次（比如删掉 API key），看 logs/app.log 有 error 且 items.status='failed'
# 闸口2：浏览器 console 里 `throw new Error('test')`，看 logs/app.log 出现 channel:'client'
# 闸口3：把 SCORE_MODEL 换成一个不存在模型，看 item_events 里 failed 事件的 detail.llm_raw / error
# 闸口4：随便处理一条，`SELECT * FROM item_events WHERE item_id=?` 应有 parse_start→…→score_done 完整流水
```

