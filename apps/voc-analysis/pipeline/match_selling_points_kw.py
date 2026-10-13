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


def _hits(docs, kw):
    return [i for i, (_, t) in enumerate(docs) if match(t, kw)]


def run(data_path, out_path):
    rows = [json.loads(l) for l in open(data_path, encoding="utf-8")]
    pos = [(r.get("cat", ""), " ".join(r["text"].split())) for r in rows if r.get("sentiment") == "pos"]
    neg = [(r.get("cat", ""), " ".join(r["text"].split())) for r in rows if r.get("sentiment") == "neg"]
    print(f"[load] 正向 {len(pos)} 条 | 负向 {len(neg)} 条")

    dims = list(SELLING_POINT_KEYWORDS.keys())
    board = []
    for dim in dims:
        kw = SELLING_POINT_KEYWORDS[dim]
        p_idx = _hits(pos, kw)
        n_idx = _hits(neg, kw)
        pv, nv = len(p_idx), len(n_idx)
        total = pv + nv
        board.append({
            "selling_point": dim,
            # 共鸣(好评)侧
            "pos_volume": pv,
            "pos_rate": round(pv / max(len(pos), 1) * 100, 1),
            "pos_exemplars": [pos[i][1] for i in p_idx[:3]],
            # 吐槽(差评)侧
            "neg_volume": nv,
            "neg_rate": round(nv / max(len(neg), 1) * 100, 1),
            "neg_exemplars": [neg[i][1] for i in n_idx[:3]],
            # 净共鸣度 = 好评占比(该卖点所有提及里好评的比例)
            "net_resonance": round(pv / total, 3) if total else 0,
            "volume": total,  # 兼容旧字段(总提及)
            "hit_rate": round(total / max(len(pos) + len(neg), 1) * 100, 1),
            "keywords": kw,
        })
    # 主排序: 好评声量(共鸣榜主视角)
    board.sort(key=lambda b: -b["pos_volume"])

    # 每条评价命中卖点数分布(pos+neg 各自)
    def dist(docs):
        c = Counter(sum(1 for d in dims if match(t, SELLING_POINT_KEYWORDS[d])) for _, t in docs)
        return dict(sorted(c.items()))

    result = {
        "method": "multi-label keyword match (aspect-based, pos/neg cross)",
        "n_positive": len(pos),
        "n_negative": len(neg),
        "pos_hits_per_doc_dist": dist(pos),
        "neg_hits_per_doc_dist": dist(neg),
        "board": board,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[save] → {out_path}")

    print(f"\n===== 卖点共鸣/吐槽双面榜 =====")
    print(f"{'卖点':<6} {'好评':>5} {'差评':>5} {'净共鸣':>7}")
    for b in board:
        print(f"{b['selling_point']:<6} {b['pos_volume']:>5} {b['neg_volume']:>5} {b['net_resonance']:>7.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="pipeline/data/ce_sentiment.jsonl")
    ap.add_argument("--out", default="pipeline/data/selling_points.json")
    args = ap.parse_args()
    run(args.data, args.out)
