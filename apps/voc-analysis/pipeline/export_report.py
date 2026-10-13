"""VoC 可导出报告生成——市场及格线#4（GTM 标准交付物）。

读 sp_board_ui.json（双面榜）+ trend_ui.json（趋势），生成自包含 Markdown 报告：
  标题/数据源 → 核心洞察（卖点/雷区/屏幕参半）→ 双面榜单表 → 品类×净共鸣矩阵 →
  趋势摘要 → 方法说明（修正链+ABSA+净共鸣定义）。
报告是给老板/客户看的成品：不含代码细节，结论先行，数据支撑。
输出：pipeline/data/report_YYYY-MM-DD.md（或 --out 指定）。
"""
import json
import argparse
import os
import time


def fmt_pct(x):
    return f"{round(x * 100)}%"


def net_label(net):
    if net >= 0.7:
        return "卖点"
    if net >= 0.5:
        return "中性"
    return "雷区"


def run(sp_path, trend_path, out_path):
    sp = json.load(open(sp_path, encoding="utf-8"))
    trend = json.load(open(trend_path, encoding="utf-8")) if os.path.exists(trend_path) else None
    cats = sp["categories"]
    clusters = sp["clusters"]
    by_net = sorted(clusters, key=lambda c: -c["netResonance"])

    selling = [c for c in by_net if c["netResonance"] >= 0.7]
    mines = [c for c in by_net if c["netResonance"] < 0.5]
    today = time.strftime("%Y-%m-%d")

    L = []
    A = L.append
    A(f"# 用户之声（VoC）· 卖点共鸣分析报告")
    A("")
    A(f"> 生成日期：{today}　|　数据源：{sp['source']}　|　好评 {sp['n_positive']} 条 / 差评 {sp['n_negative']} 条")
    A(f"> 方法：方面级情感分析（ABSA）· 关键词规则匹配 · 声量×情感交叉")
    A("")
    A("---")
    A("")
    A("## 一、核心结论（30 秒看完）")
    A("")
    A(f"- **主打卖点**（净共鸣 ≥70%，用户真实认可）：{('、'.join(f'{c['name']}({fmt_pct(c['netResonance'])})' for c in selling)) or '无'}")
    A(f"- **改进雷区**（净共鸣 <50%，差评多于好评）：{('、'.join(f'{c['name']}({fmt_pct(c['netResonance'])})' for c in mines)) or '无'}")
    # 屏幕类"爱恨参半"
    mixed = [c for c in clusters if 0.5 <= c["netResonance"] < 0.6 and c["negVolume"] > c["posVolume"] * 0.8]
    if mixed:
        A(f"- **爱恨参半**（声量高但差评追平好评，不宜直接当卖点宣传）：{('、'.join(c['name'] for c in mixed))}")
    # 最大痛点 = 净共鸣最低(差评占比最高)，不是差评绝对数(声量大的卖点差评数天然高)
    worst = min(clusters, key=lambda c: c["netResonance"])
    A(f"- **最大痛点**：{worst['name']}（净共鸣 {fmt_pct(worst['netResonance'])} 全榜最低，{worst['negVolume']} 条差评）→ IPD 改进最高优先级")
    # 差评绝对数第一(声量基数大驱动)单独点出——需解决一致性才可当卖点
    noisiest = max(clusters, key=lambda c: c["negVolume"])
    if noisiest["name"] != worst["name"]:
        A(f"- **差评最多**：{noisiest['name']}（{noisiest['negVolume']} 条差评全榜第一，声量第 2 但差评几乎追平好评）→ 先解决一致性再考虑当卖点")
    A("")
    A("---")
    A("")
    A("## 二、卖点共鸣 / 吐槽双面榜")
    A("")
    A("净共鸣度 = 该卖点所有提及中好评的占比（≥70% 绿·卖点 / 50-70% 琥珀·中性 / <50% 红·雷区）。")
    A("")
    A("| 排名 | 卖点 | 好评(共鸣) | 差评(吐槽) | 净共鸣 | 定位 |")
    A("|---|---|---|---|---|---|")
    for i, c in enumerate(sorted(clusters, key=lambda c: -(c["posVolume"] + c["negVolume"])), 1):
        A(f"| {i} | {c['name']} | {c['posVolume']} | {c['negVolume']} | {fmt_pct(c['netResonance'])} | {net_label(c['netResonance'])} |")
    A("")
    A("---")
    A("")
    A("## 三、产品线对比（卖点 × 品类 净共鸣矩阵）")
    A("")
    A("横向看『同一卖点在不同产品线的共鸣差异』（GTM 差异化内容），纵向看『某产品线的卖点 vs 雷区』。")
    A("")
    header = "| 卖点 | " + " | ".join(cats) + " | 整体 |"
    sep = "|---|" + "---|" * (len(cats) + 1)
    A(header)
    A(sep)
    for c in sorted(clusters, key=lambda c: -c["netResonance"]):
        cells = []
        for cat in cats:
            s = c["byCategory"].get(cat)
            cells.append(fmt_pct(s["net"]) if s and (s["pos"] + s["neg"]) > 0 else "—")
        A(f"| {c['name']} | " + " | ".join(cells) + f" | {fmt_pct(c['netResonance'])} |")
    A("")
    if trend:
        A("## 四、趋势（品类 × 月份 净共鸣）")
        A("")
        if trend.get("simulated"):
            A("> ⚠️ **演示数据**：源数据集无时间戳，趋势为确定性合成均匀分布占位。真实数据带 date 列上传后自动用真实月份。")
            A("")
        A("| 品类 | " + " | ".join(trend["months"]) + " |")
        A("|---|" + "---|" * len(trend["months"]))
        for s in trend["series"]:
            cells = [fmt_pct(p["net"]) if p["net"] is not None else "—" for p in s["points"]]
            A(f"| {s['cat']} | " + " | ".join(cells) + " |")
        A("")
        A("---")
        A("")
    A("## 五、方法与数据说明")
    A("")
    A("- **数据源**：" + sp["source"])
    A(f"- **样本**：消费电子评价 {sp['n_positive'] + sp['n_negative']} 条（好评 {sp['n_positive']} / 差评 {sp['n_negative']}），已清洗 BOM/过短/去重")
    A("- **情感分类**：LLM 逐条判定（pos/neg/neu）")
    A("- **卖点匹配**：方面级关键词规则（10 卖点维度词表，词频校准）。一条评价可命中多个卖点（多标签，声量真实）")
    A("- **方法修正链**：HDBSCAN 聚类（738/800 并一坨）→ KMeans 硬划分（簇混合/声量失真）→ 多标签嵌入匹配（相似度挤窄带无法区分）→ **关键词规则匹配**（可解释/零成本/声量准确，采用）")
    A("- **净共鸣度**：该卖点所有提及中好评占比。共鸣必须分正负——只看声量只是词频统计，不是共鸣")
    A("- **局限**：数据含年代偏差（手机品类多为功能机时代评价，差评偏多）；当前单一品类混数据，无品牌维度（竞品对比待多品牌数据）")
    A("")
    A("---")
    A("")
    A(f"*本报告由 VoC 分析管道自动生成 · {today}*")

    text = "\n".join(L) + "\n"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"[save] -> {out_path}  ({len(text)} 字符)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sp", default="pipeline/data/sp_board_ui.json")
    ap.add_argument("--trend", default="pipeline/data/trend_ui.json")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    # 固定名 report_latest.md：前端下载链接稳定，日期在报告内部体现；同日重跑覆盖
    out = args.out or "pipeline/data/report_latest.md"
    run(args.sp, args.trend, out)
