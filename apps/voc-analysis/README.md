# VoC 用户之声 · 卖点共鸣榜

消费电子用户评价 → 情感分类 → 卖点共鸣榜。GTM 团队看"用户真实认可我们产品的哪些卖点"，反哺内容策略。

**当前状态**：卖点共鸣/吐槽双面榜已落地（好评 6134 + 差评 5825 → 10 卖点双侧声量+净共鸣+品类×净共鸣 + Web UI）。**数据接入接口已通**（CSV 上传 → 自动重跑 → 刷新榜单+趋势）。**趋势卡已落地**（品类×月份净共鸣，无时间戳数据用合成占位+诚实标注，真实 date 自动变真）。**产品线对比视图已落地**（卖点×品类净共鸣矩阵）。竞品对比（需多品牌数据）留后续。

## 数据源

开源数据集 [`ttxy/online_shopping_10_cats`](https://huggingface.co/datasets/ttxy/online_shopping_10_cats)（HuggingFace，62773 条真实电商评价，零抓取风险）。取消费电子子集（平板/手机/计算机）16241 条。

> 手游外设真实语料后续补充：管道与数据源解耦，换 `ce_reviews.jsonl` 即可复用全流程。

## 方法（两次实测修正后的落地链路）

```
原始评价 62773
  → 消费电子子集 16241（清洗 BOM/过短/去重/截断）
  → LLM 情感分类（ark-code-latest + reasoning_effort=low）
      pos 6134 / neg 5825 / neu 2321 / unknown 1961
  → 方面级关键词匹配（10 卖点维度词表，pos + neg 双侧跑）
      每卖点：好评声量(共鸣) + 差评声量(吐槽) + 净共鸣度(好评占比)
  → 双面榜：共鸣/吐槽双侧声量 + 净共鸣 + 品类×净共鸣 + 双侧代表引文
  → Next.js 读 sp_board_ui.json 渲染双面榜
```

**为什么是关键词匹配不是嵌入聚类**（实测教训，详见 RECORDS 第 33/34 行）：
- HDBSCAN 密度聚类 → 738/800 条并一坨（真实评价是连续高密度云）
- KMeans 硬划分 → 簇混合、一条夸多卖点只计一次（声量失真）
- 多标签嵌入匹配 → 相似度挤 0.55-0.73 窄带无法区分（嵌入做不了卖点级区分）
- **关键词规则匹配** → 可解释、零成本、声量真实（一条夸 3 卖点计 3 次）

## 从零复现

前置：Python 3.13 + `uv`；Node 24；环境变量 `VOLCENGINE_API_KEYwinomp`（Ark key，情感分类用）。

```bash
# 1. Python 环境 + 依赖
cd apps/voc-analysis
uv venv
uv pip install --python .venv/Scripts/python.exe pandas pyarrow openai sentence-transformers scikit-learn jieba

# 2. 下载数据集（62773 条 parquet，7.5MB）
curl -L -o pipeline/data/osc_train.parquet \
  "https://huggingface.co/datasets/ttxy/online_shopping_10_cats/resolve/main/data/train-00000-of-00001.parquet"

# 3. 导出消费电子子集（16241 条）
.venv/Scripts/python.exe pipeline/export_ce_subset.py

# 4. LLM 情感分类（16241 条 ≈ 25min，断点续跑）
.venv/Scripts/python.exe pipeline/sentiment_classify.py

# 5. 卖点关键词匹配 + 榜单导出
.venv/Scripts/python.exe pipeline/match_selling_points_kw.py
.venv/Scripts/python.exe pipeline/export_sp_board.py

# 6. Web UI
npm install
node node_modules/next/dist/bin/next dev -p 3010
# 打开 http://localhost:3010
```

## 导入新评价数据（数据接入接口）

榜单不是焊死的——可上传新评价 CSV，自动重跑管道刷新榜单（对标市场 VoC 产品的"可重复数据接入"第一层）。

**方式 1：Web UI 上传**
打开榜单页 → 顶部"导入评价数据"卡 → 选 CSV → "上传并重跑榜单"。进度条实时显示：清洗 → 情感分类 → 卖点匹配 → 刷新榜单，完成后页面自动刷新。

**方式 2：命令行（无 UI）**
```bash
# CSV 放 pipeline/data/uploads/<job>.csv，需含 text 列(评价正文)，可选 cat/rating/date 列
.venv/Scripts/python.exe pipeline/run_ingestion.py <job>
# 查看进度：pipeline/data/uploads/<job>.status.json
```

CSV 格式示例：
```csv
text,cat,rating
"手柄握持手感特别好,摇杆很跟手,打原神很流畅",平板,5
"散热背夹风力很大,手机玩久了也不烫了",手机,5
```

增量逻辑：新评价与既有 `ce_reviews.jsonl` 按文本去重合并，情感分类断点续跑（只跑新增），榜单反映全量。

## 卖点共鸣 / 吐槽双面榜（当前结果）

好评 6134 条 / 差评 5825 条。净共鸣度 = 该卖点所有提及里好评的占比（>0.7 强共鸣 / 0.5-0.7 中性 / <0.5 雷区）。

| 卖点 | 好评(共鸣) | 差评(吐槽) | 净共鸣 | 解读 |
|---|---|---|---|---|
| 外观做工 | 1231 | 285 | **0.81** | 最强共鸣项 |
| 价格性价比 | 1276 | 318 | **0.80** | 强共鸣 |
| 品牌品质 | 433 | 150 | 0.74 | 净共鸣高 |
| 运行性能 | 1926 | 813 | 0.70 | 声量最大，仍偏正面 |
| 屏幕显示 | 1353 | 1297 | 0.51 | **爱恨参半**（差评几乎追平好评）|
| 音质音效 | 756 | 564 | 0.57 | 偏弱 |
| 手感体验 | 585 | 486 | 0.55 | 偏弱 |
| 散热温控 | 315 | 378 | 0.46 | **吐槽多于共鸣** |
| 拍照影像 | 371 | 480 | 0.44 | **吐槽多于共鸣** |
| 续航能力 | 536 | **854** | **0.39** | **最大痛点**（差评远超好评）|

**核心洞察**（单看声量榜看不出的）：
- **卖点（净共鸣 >0.7）**：外观做工、价格性价比、品牌品质 → GTM 主打这三个
- **雷区（净共鸣 <0.5）**：续航、拍照、散热 → IPD 改进优先级；续航 854 条差评是最大短板
- **屏幕显示爱恨参半**：声量第 2 但差评几乎追平好评，不能当卖点宣传，要先解决一致性

**品类×净共鸣**（数据含年代偏差：手机多为功能机时代评价，差评偏多）：
- 计算机整体偏正面（外观 0.84 / 价格 0.86 / 品牌 0.82）
- 手机是全品类问题区（散热 0.25 / 续航 0.34 / 品牌 0.39 / 运行性能 0.46）

## 趋势（品类 × 月份）· 演示占位

**诚实标注**：osc 开源数据集**无 date 字段**（只 cat/text/label），时间趋势用**确定性合成均匀分布**演示，UI 带「演示数据（无时间戳）」琥珀徽章，`trend_ui.json` 标 `simulated: true`。**真实上传数据带 `date` 列，趋势自动用真实月份**——csv_to_jsonl 透传 date 列，export_trend 解析真实 YYYY-MM。

当前合成趋势（各品类净共鸣稳定值，平线占位）：平板 0.55 / 手机 0.45 / 计算机 0.45，每月数据齐全。TrendCard 支持 净共鸣 ⇄ 声量 切换、0.5 雷区参考线、悬停看单月数值。

## 产品线对比视图（卖点 × 品类 净共鸣矩阵）

Board 顶部「共鸣榜 ⇄ 产品线对比」切换。矩阵横向看"同一卖点在不同产品线的共鸣差异"（GTM 差异化内容），纵向看"某产品线的卖点 vs 雷区"。复用双面榜 `byCategory` 数据，零额外管道。颜色同净共鸣语义（绿≥70% 卖点 / 琥珀 50-70% / 红<50% 雷区）。

## 3 分钟 Demo 流程

1. 打开榜单页 → 顶部看数据源/方法/好评差评数；讲"声量×情感交叉"（市场 ABSA 概念，共鸣必须分正负否则只是词频）
2. 讲方法修正链：为什么从嵌入聚类改成关键词匹配（真实数据实测）
3. 指双面声量条 + 净共鸣徽章：一眼分清"卖点"(外观/价格 0.8+)vs"雷区"(续航/拍照/散热 <0.5)——这是单看声量榜看不出的
4. 点「续航能力」展开 → 好评引文 vs 差评引文两栏对照 + 品类×净共鸣（续航是全品类痛点，净共鸣 0.39）
5. 切「产品线对比」视图 → 卖点×品类净共鸣矩阵，指"手机是全品类问题区/计算机偏正面"（数据含年代偏差点名）
6. 指趋势卡 → 讲"无时间戳数据如何诚实做趋势"：合成占位+徽章标注，真实数据带 date 列自动变真；现场演示数据接入：上传一个 CSV → 进度条走完 → 榜单+趋势自动刷新（对标市场"可重复数据接入"）

## 目录

```
pipeline/
  export_ce_subset.py       # 消费电子子集导出（清洗）
  sentiment_classify.py     # LLM 情感分类（批量+并发+断点续跑）
  match_selling_points_kw.py# 卖点关键词多标签匹配（当前方法）
  export_sp_board.py        # 榜单导出（含品类分层 + pos/neg 双侧）
  export_trend.py           # 趋势导出（品类×月份净共鸣，真实 date / 无 date 合成占位）
  data/trend_ui.json        # 趋势 UI 数据契约（simulated 标注）
  data/sp_board_ui.json     # UI 数据契约
  # 以下为方法修正链的实证记录（保留备查）
  compare_cluster_algo.py   # HDBSCAN vs KMeans 对比
  cluster_selling_points.py # KMeans 硬划分（已弃用）
  match_selling_points.py   # 多标签嵌入匹配（已弃用，嵌入失效实证）
src/
  app/page.tsx              # 榜单页（读 sp_board_ui.json + trend_ui.json）
  components/Board.tsx      # 交互榜单（共鸣榜 ⇄ 产品线对比矩阵切换）
  components/TrendCard.tsx  # 趋势卡（品类×月份净共鸣/声量 SVG 折线 + simulated 徽章）
  components/IngestCard.tsx # 数据接入上传卡（进度条 + 完成自动刷新）
```

## 后续扩展（接口已留）

- **真实语料**：手游外设评价导出/抓取（带 date/brand 列）→ 上传 → 趋势自动用真实月份、品类维度可换品牌维度
- **竞品对比**：需多品牌/多产品数据（当前单一品类混数据），数据到位后复用对比矩阵换维度
- **可导出报告**：榜单/趋势/对比 → PDF/Markdown 报告导出（市场及格线#4，GTM 标准交付物）
