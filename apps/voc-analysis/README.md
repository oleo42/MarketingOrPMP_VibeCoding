# VoC 用户之声 · 卖点共鸣榜

消费电子用户评价 → 情感分类 → 卖点共鸣榜。GTM 团队看"用户真实认可我们产品的哪些卖点"，反哺内容策略。

**当前状态**：卖点共鸣榜已落地（真实数据 6134 条正向评价 → 10 个卖点维度声量榜 + Web UI）。**数据接入接口已通**（CSV 上传 → 自动重跑管道 → 刷新榜单）。产品问题榜（负向）留接口后续扩展。

## 数据源

开源数据集 [`ttxy/online_shopping_10_cats`](https://huggingface.co/datasets/ttxy/online_shopping_10_cats)（HuggingFace，62773 条真实电商评价，零抓取风险）。取消费电子子集（平板/手机/计算机）16241 条。

> 手游外设真实语料后续补充：管道与数据源解耦，换 `ce_reviews.jsonl` 即可复用全流程。

## 方法（两次实测修正后的落地链路）

```
原始评价 62773
  → 消费电子子集 16241（清洗 BOM/过短/去重/截断）
  → LLM 情感分类（ark-code-latest + reasoning_effort=low）
      pos 6134 / neg 5825 / neu 2321 / unknown 1961
  → 卖点共鸣榜只跑 pos 子集
  → 关键词规则多标签匹配（10 卖点维度词表）
  → 卖点榜：声量 + 置信度 + 品类分布 + 代表引文
  → Next.js 读 sp_board_ui.json 渲染榜单
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

## 卖点共鸣榜（当前结果）

| 卖点 | 声量 | 命中率 | 计算机 | 手机 | 平板 |
|---|---|---|---|---|---|
| 运行性能 | 1926 | 31% | 49% | 21% | 28% |
| 屏幕显示 | 1353 | 22% | 17% | 39% | 20% |
| 价格性价比 | 1276 | 21% | 40% | 15% | 15% |
| 外观做工 | 1231 | 20% | 44% | 36% | 9% |
| 音质音效 | 756 | 12% | 7% | 35% | 10% |
| 手感体验 | 585 | 10% | 21% | 21% | 3% |
| 续航能力 | 536 | 9% | 11% | 18% | 6% |
| 品牌品质 | 433 | 7% | 5% | 2% | 9% |
| 拍照影像 | 371 | 6% | 6% | 25% | 2% |
| 散热温控 | 315 | 5% | 20% | 0.2% | 1% |

商业洞察：计算机性能导向、手机体验导向（屏幕/外观/音质/拍照）、平板均衡。

## 3 分钟 Demo 流程

1. 打开榜单页 → 顶部看数据源/方法/正向评价数
2. 讲方法修正链：为什么从嵌入聚类改成关键词匹配（真实数据实测）
3. 指品类分布条：同一卖点在不同产品线的声量差异（GTM 差异化内容）
4. 点「运行性能」展开 → 3 条真实代表引文 + 品类声量明细
5. 讲扩展：负向评价 → 产品问题榜（接口已留）；真实语料 → 换 jsonl 即复用

## 目录

```
pipeline/
  export_ce_subset.py       # 消费电子子集导出（清洗）
  sentiment_classify.py     # LLM 情感分类（批量+并发+断点续跑）
  match_selling_points_kw.py# 卖点关键词多标签匹配（当前方法）
  export_sp_board.py        # 榜单导出（含品类分层）
  data/sp_board_ui.json     # UI 数据契约
  # 以下为方法修正链的实证记录（保留备查）
  compare_cluster_algo.py   # HDBSCAN vs KMeans 对比
  cluster_selling_points.py # KMeans 硬划分（已弃用）
  match_selling_points.py   # 多标签嵌入匹配（已弃用，嵌入失效实证）
src/
  app/page.tsx              # 榜单页（读 sp_board_ui.json）
  components/Board.tsx      # 交互榜单（声量条/品类条/展开引文）
```

## 后续扩展（接口已留）

- **产品问题榜**：`ce_sentiment.jsonl` 里 neg 5825 条 → 同一卖点匹配 → 问题榜 UI
- **真实语料**：手游外设评价导出/抓取 → 替换 `ce_reviews.jsonl` → 重跑 4-6 步
- **趋势分析**：评价带时间维度后聚合声量变化
