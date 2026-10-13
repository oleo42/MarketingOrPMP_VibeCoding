"""声量/净共鸣趋势导出——品类 × 月份（市场及格线#3 趋势）。

数据源：ce_sentiment.jsonl。
月份解析：
- 记录带真实 `date` 字段（上传 CSV 含 date 列）→ 用真实 YYYY-MM。
- 无 `date`（osc 开源数据集本身无时间戳）→ 合成：每条记录独立随机落一个月（确定性 seed），
  并在输出标注 `simulated: true`。不按记录顺序切块——osc 按品类聚块，顺序切会让品类只落在
  某几个月、净共鸣伪波动。独立随机让每个品类全月份都有数据，趋势线=该品类净共鸣稳定值，
  诚实表达"无时间维度"，等真实 date 数据上传后自动变真。绝不假装真数据。
指标：每品类 × 月份的 好评数/差评数/总声量/净共鸣度(好评占比)。
输出：pipeline/data/trend_ui.json -> Next.js TrendCard 渲染。
"""
import json
import argparse
import random
from collections import defaultdict

SIM_MONTHS = 6  # 无 date 时合成的月份跨度


def parse_month(rec, simulated_window, rng):
    """返回 (month_str 'YYYY-MM', simulated_flag)。真实 date 优先。"""
    d = (rec.get("date") or "").strip()
    if d:
        # 支持 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY/MM/DD' / 'YYYY/MM'
        s = d.replace("/", "-")
        parts = s.split("-")
        if len(parts) >= 2 and parts[0].isdigit():
            return f"{parts[0]}-{parts[1].zfill(2)}", False
    return simulated_window[rng.randrange(len(simulated_window))], True


def month_window(n):
    """最近 n 个月的 YYYY-MM 升序（以今天为终点）。"""
    import datetime
    today = datetime.date.today()
    out = []
    y, m = today.year, today.month
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return sorted(out)


def run(data_path, out_path):
    rows = [json.loads(l) for l in open(data_path, encoding="utf-8")]
    cats = sorted({r.get("cat", "?") for r in rows})
    window = month_window(SIM_MONTHS)

    # cat -> month -> [pos, neg]
    agg = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    any_simulated = False
    rng = random.Random(42)
    for r in rows:
        month, sim = parse_month(r, window, rng)
        any_simulated = any_simulated or sim
        s = r.get("sentiment")
        if s == "pos":
            agg[r.get("cat", "?")][month][0] += 1
        elif s == "neg":
            agg[r.get("cat", "?")][month][1] += 1

    # 全月份轴（真实+合成并集，升序）
    months = sorted({m for c in agg.values() for m in c})
    series = []
    for c in cats:
        pts = []
        for m in months:
            p, ng = agg[c].get(m, [0, 0])
            tot = p + ng
            pts.append({
                "month": m,
                "pos": p, "neg": ng, "volume": tot,
                "net": round(p / tot, 2) if tot else None,
            })
        series.append({"cat": c, "points": pts})

    result = {
        "generated": __import__("time").strftime("%Y-%m-%d %H:%M"),
        "simulated": any_simulated,
        "note": "时间趋势（开源数据无 date 字段，用确定性合成均匀分布演示；真实上传数据带 date 列即自动用真实月份）" if any_simulated else "真实时间趋势",
        "months": months,
        "categories": cats,
        "series": series,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[save] -> {out_path}  simulated={any_simulated}")

    print(f"\n===== 趋势（品类×月份 净共鸣） simulated={any_simulated} =====")
    print(f"{'品类':<5} " + " ".join(f"{m[5:]:>5}" for m in months))
    for s in series:
        cells = []
        for p in s["points"]:
            cells.append(f"{p['net']:>5.2f}" if p["net"] is not None else f"{'-':>5}")
        print(f"{s['cat']:<5} " + " ".join(cells))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="pipeline/data/ce_sentiment.jsonl")
    ap.add_argument("--out", default="pipeline/data/trend_ui.json")
    args = ap.parse_args()
    run(args.data, args.out)
