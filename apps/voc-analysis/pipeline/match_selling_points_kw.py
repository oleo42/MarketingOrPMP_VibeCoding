"""多标签卖点匹配——关键词规则版（嵌入相似度失效后的修正，2026-10-13 用户决策 B）。

方法修正链：KMeans 硬划分(簇混合/声量失真) → 多标签嵌入匹配(相似度挤 0.55-0.73 窄带/
分布重叠无法区分) → 关键词规则匹配(卖点词在评价中直接出现,可解释/零成本/声量准确)。
嵌入失效根因：消费电子评价共享大量语义(夸+产品词),BGE-M3 把"夸屏幕"和"夸电池"映射过近。

规则：每卖点配关键词组(任一词命中即计该卖点);一条评价可命中多个卖点(多标签,声量真实)。
词表数据支撑：词频探测(性能37%/价格26%/屏幕24%/外观21%/音质16%/手感13%/续航9%…)。
误判控制：排除词表(如"卡"只在 pos 评价里算性能,但"很卡"已被情感过滤到 neg)。
输入：ce_sentiment.jsonl 的 pos 子集。输出：selling_points.json(卖点声量榜)。
"""
import json
import argparse
from collections import Counter

# 卖点维度 → 关键词组(命中任一即计)。词表经真实词频校准,避免过宽单字。
SELLING_POINT_KEYWORDS = {
    "运行性能": ["运行", "流畅", "速度", "不卡", "配置", "性能", "处理器", "内存", "系统流畅", "反应快"],
    "价格性价比": ["性价比", "价格", "实惠", "便宜", "值得买", "价位", "划算", "超值", "白菜价"],
    "屏幕显示": ["屏幕", "显示", "分辨率", "清晰", "大屏", "画质", "画面", "屏显", "看视频"],
    "外观做工": ["外观", "外形", "做工", "颜值", "漂亮", "好看", "设计感", "质感", "时尚", "精致"],
    "音质音效": ["音质", "音效", "声音", "喇叭", "外放", "铃声", "听歌", "音量大"],
    "手感体验": ["手感", "握着", "触摸", "按键", "键盘", "上手", "拿着舒服"],
    "续航能力": ["电池", "续航", "待机", "充电", "耗电", "电量", "耐用"],
    "拍照影像": ["拍照", "相机", "照相", "像素", "照片", "摄像", "拍出来"],
    "散热温控": ["散热", "发烫", "发热", "温度", "风扇", "不热"],
    "品牌品质": ["大品牌", "国货", "信赖", "放心", "正品", "品质", "牌子"],
}


def match(text, keywords):
    return any(k in text for k in keywords)


def run(data_path, out_path):
    rows = [json.loads(l) for l in open(data_path, encoding="utf-8")]
    pos = [r for r in rows if r.get("sentiment") == "pos"]
    docs = [(r.get("cat", ""), " ".join(r["text"].split())) for r in pos]
    print(f"[load] 正向评价 {len(docs)} 条")

    dims = list(SELLING_POINT_KEYWORDS.keys())
    # 每卖点命中
    board = []
    hits_per_doc = []
    for dim in dims:
        kw = SELLING_POINT_KEYWORDS[dim]
        hit_idx = [i for i, (_, t) in enumerate(docs) if match(t, kw)]
        board.append({
            "selling_point": dim,
            "volume": len(hit_idx),
            "hit_rate": round(len(hit_idx) / len(docs) * 100, 1),
            "keywords": kw,
            # 代表引文：最短且最聚焦的(信息密度高),取前 3
            "exemplars": [docs[i][1] for i in sorted(hit_idx, key=lambda i: len(docs[i][1]))[:3]],
            "sample_random": [docs[i][1] for i in hit_idx[:3]],
        })
    board.sort(key=lambda b: -b["volume"])

    # 每条评价命中卖点数分布
    for _, t in docs:
        h = sum(1 for dim in dims if match(t, SELLING_POINT_KEYWORDS[dim]))
        hits_per_doc.append(h)
    dist = Counter(hits_per_doc)

    result = {
        "method": "multi-label keyword match",
        "n_positive": len(docs),
        "hits_per_doc_dist": dict(sorted(dist.items())),
        "board": board,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[save] → {out_path}")

    print(f"\n===== 卖点共鸣榜（关键词规则）=====")
    print(f"每条命中卖点数分布: {dict(sorted(dist.items()))}")
    for b in board:
        print(f"\n{b['selling_point']} | 声量 {b['volume']} ({b['hit_rate']}%)")
        for e in b["sample_random"][:2]:
            print(f"  · {e[:55]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="pipeline/data/ce_sentiment.jsonl")
    ap.add_argument("--out", default="pipeline/data/selling_points.json")
    args = ap.parse_args()
    run(args.data, args.out)
