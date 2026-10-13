"""卖点共鸣/吐槽双面榜导出——UI 数据契约（声量×情感交叉，市场及格线#2）。

数据源：match_selling_points_kw.py 的 selling_points.json（已含 pos/neg 双侧）+ ce_sentiment.jsonl。
增强：
- 每卖点拆 共鸣(pos)/吐槽(neg) 双侧声量 + 净共鸣度（好评占比）。
- 品类分层双侧：每品类每卖点的 pos/neg 命中（GTM 看不同产品线的卖点与雷区）。
- 置信度 = 好评声量相对最大归一化；needsReview = 总命中率 <3%。
输出：sp_board_ui.json → Next.js 读渲染双面榜。
"""
import json
import argparse


def run(sp_path, data_path, out_path):
    sp = json.load(open(sp_path, encoding="utf-8"))
    rows = [json.loads(l) for l in open(data_path, encoding="utf-8")]
    pos = [r for r in rows if r.get("sentiment") == "pos"]
    neg = [r for r in rows if r.get("sentiment") == "neg"]

    kw_map = {b["selling_point"]: b["keywords"] for b in sp["board"]}
    cats = sorted({r.get("cat", "?") for r in rows if r.get("cat")})

    def cat_stats(dim, kw):
        out = {}
        for c in cats:
            sub_p = [r for r in pos if r.get("cat") == c]
            sub_n = [r for r in neg if r.get("cat") == c]
            pv = sum(1 for r in sub_p if any(k in r["text"] for k in kw))
            nv = sum(1 for r in sub_n if any(k in r["text"] for k in kw))
            tot = pv + nv
            out[c] = {
                "pos": pv, "neg": nv,
                "rate": round(pv / max(len(sub_p), 1) * 100, 1),
                "net": round(pv / tot, 2) if tot else 0,
            }
        return out

    max_pos = max(b["pos_volume"] for b in sp["board"]) or 1
    clusters = []
    for b in sp["board"]:
        dim = b["selling_point"]
        clusters.append({
            "id": dim,
            "name": dim,
            # 双侧声量
            "posVolume": b["pos_volume"],
            "negVolume": b["neg_volume"],
            "posRate": b["pos_rate"],
            "negRate": b["neg_rate"],
            "netResonance": b["net_resonance"],
            # 代表引文双侧
            "posExemplars": b["pos_exemplars"][:3],
            "negExemplars": b["neg_exemplars"][:3],
            # 兼容旧 UI 字段
            "reviewCount": b["pos_volume"],
            "hitRate": b["hit_rate"],
            "exemplars": b["pos_exemplars"][:3],
            "confidence": round(b["pos_volume"] / max_pos, 2),
            "byCategory": cat_stats(dim, kw_map[dim]),
            "needsReview": b["hit_rate"] < 3,
        })
    clusters.sort(key=lambda c: -c["posVolume"])

    result = {
        "generated": "2026-10-13",
        "method": "multi-label keyword match (aspect-based pos/neg cross)",
        "source": "online_shopping_10_cats 消费电子子集(平板/手机/计算机)",
        "sentiment": "pos+neg",
        "n_positive": len(pos),
        "n_negative": len(neg),
        "categories": cats,
        "pos_hits_per_doc_dist": sp.get("pos_hits_per_doc_dist", {}),
        "neg_hits_per_doc_dist": sp.get("neg_hits_per_doc_dist", {}),
        "clusters": clusters,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[save] → {out_path}")

    print("\n===== 双面榜（UI 数据）=====")
    print(f"{'卖点':<6} {'好评':>5} {'差评':>5} {'净共鸣':>7}  品类净共鸣")
    for c in clusters:
        cat_s = " | ".join(f"{k}:{v['net']}" for k, v in c["byCategory"].items())
        print(f"{c['name']:<6} {c['posVolume']:>5} {c['negVolume']:>5} {c['netResonance']:>7.2f}  {cat_s}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sp", default="pipeline/data/selling_points.json")
    ap.add_argument("--data", default="pipeline/data/ce_sentiment.jsonl")
    ap.add_argument("--out", default="pipeline/data/sp_board_ui.json")
    args = ap.parse_args()
    run(args.sp, args.data, args.out)
