"""多标签卖点匹配——卖点共鸣榜的核心（修正 KMeans 硬划分的声量失真）。

架构修正（2026-10-13 用户决策，路 2）：
- KMeans 硬划分缺陷：真实评价多卖点共现（"屏幕清晰+运行流畅+外观漂亮"一条夸 3 个），
  强制归一导致簇混合、卖点声量失真（一条夸 3 个只计 1 次）。
- 多标签匹配：每条评价与所有卖点维度算嵌入相似度，命中几个计几次 → 卖点声量真实。
- 卖点维度是已知商业维度（屏幕/性能/续航/散热/音质/外观做工/手感/价格），不需"发现"。

方法：每个卖点维度给多条种子句（覆盖不同表达），嵌入后取质心；
评价嵌入与各卖点质心余弦相似度 ≥ 阈值 → 命中该卖点。
输入：ce_sentiment.jsonl 的 pos 子集（卖点榜只看正向）。
输出：selling_points.json（每卖点：声量/命中率/代表引文/平均相似度）。
嵌入缓存：ce_embed_pos.npy（6134 条 BGE-M3 嵌入算一次 ~20min，复用）。
"""
import json
import os
import argparse
import numpy as np
from sentence_transformers import SentenceTransformer

# 卖点维度 + 种子句（消费电子通用，覆盖不同表达/部位/近义词）
SELLING_POINTS = {
    "屏幕显示": ["屏幕清晰", "显示屏效果好", "分辨率高画面细腻", "看视频屏幕很舒服", "大屏显示出色"],
    "运行性能": ["运行流畅不卡", "速度快", "性能强配置高", "玩游戏流畅", "系统运行很顺畅"],
    "续航能力": ["电池耐用", "待机时间长", "续航给力", "充电一次用很久", "电池很经用"],
    "散热温控": ["散热好不发烫", "风扇散热给力", "长时间用也不热", "温控做得好"],
    "音质音效": ["音质好", "外放音效出色", "声音清晰", "音量大音效棒", "听歌效果不错"],
    "外观做工": ["外观漂亮", "做工精细", "颜值高", "设计感强", "做工扎实有质感"],
    "手感体验": ["手感好", "握着舒服", "触摸手感不错", "按键手感好", "上手体验佳"],
    "价格性价比": ["性价比高", "价格实惠", "这个价位很值", "便宜好用", "物超所值"],
    "拍照影像": ["拍照清晰", "相机效果好", "照相清楚", "像素高成像好"],
    "品牌品质": ["大品牌值得信赖", "品质有保障", "国货精品", "品牌靠谱"],
}


def load_or_embed(em, docs, cache):
    if os.path.exists(cache):
        X = np.load(cache)
        if X.shape[0] == len(docs):
            print(f"[embed] 复用缓存 {cache} ({X.shape})")
            return X
    print(f"[embed] BGE-M3 编码 {len(docs)} 条 …")
    X = em.encode(docs, show_progress_bar=True, normalize_embeddings=True)
    np.save(cache, X)
    return X


def run(data_path, threshold, out_path):
    rows = [json.loads(l) for l in open(data_path, encoding="utf-8")]
    pos = [r for r in rows if r.get("sentiment") == "pos"]
    docs = [" ".join(r["text"].split()) for r in pos]
    print(f"[load] 正向评价 {len(docs)} 条")

    em = SentenceTransformer("BAAI/bge-m3")
    X = load_or_embed(em, docs, "pipeline/data/ce_embed_pos.npy")

    # 卖点质心
    sp_names = list(SELLING_POINTS.keys())
    sp_centroids = []
    for name in sp_names:
        seeds = SELLING_POINTS[name]
        sv = em.encode(seeds, normalize_embeddings=True)
        sp_centroids.append(sv.mean(axis=0))
    C = np.array(sp_centroids)  # (n_sp, dim)
    C = C / np.linalg.norm(C, axis=1, keepdims=True)

    # 评价 × 卖点 相似度矩阵
    sim = X @ C.T  # (n_docs, n_sp)，已归一化→余弦
    hits = sim >= threshold  # 多标签命中

    # 汇总每卖点
    board = []
    for j, name in enumerate(sp_names):
        mask = hits[:, j]
        n = int(mask.sum())
        if n == 0:
            board.append({"selling_point": name, "volume": 0, "hit_rate": 0, "avg_sim": 0, "exemplars": []})
            continue
        # 代表引文：该卖点相似度最高的 3 条
        top_idx = np.argsort(sim[mask, j])[::-1][:3]
        doc_idx = np.where(mask)[0][top_idx]
        board.append({
            "selling_point": name,
            "volume": n,
            "hit_rate": round(n / len(docs) * 100, 1),
            "avg_sim": round(float(sim[mask, j].mean()), 3),
            "exemplars": [docs[i] for i in doc_idx],
        })
    board.sort(key=lambda b: -b["volume"])

    # 每条评价命中卖点数分布（验证多标签是否合理）
    hits_per_doc = hits.sum(axis=1)
    from collections import Counter
    dist = Counter(int(h) for h in hits_per_doc)

    result = {
        "method": "multi-label embedding match",
        "embed_model": "BAAI/bge-m3",
        "threshold": threshold,
        "n_positive": len(docs),
        "hits_per_doc_dist": dict(sorted(dist.items())),
        "board": board,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[save] → {out_path}")

    print(f"\n===== 卖点共鸣榜 (阈值 {threshold}) =====")
    print(f"每条评价命中卖点数分布: {dict(sorted(dist.items()))}")
    for b in board:
        print(f"\n{b['selling_point']} | 声量 {b['volume']} ({b['hit_rate']}%) | 均相似度 {b['avg_sim']}")
        for e in b["exemplars"][:2]:
            print(f"  · {e[:55]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="pipeline/data/ce_sentiment.jsonl")
    ap.add_argument("--threshold", type=float, default=0.5, help="命中阈值(余弦相似度)")
    ap.add_argument("--out", default="pipeline/data/selling_points.json")
    args = ap.parse_args()
    run(args.data, args.threshold, args.out)
