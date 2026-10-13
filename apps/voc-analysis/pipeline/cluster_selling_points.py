"""卖点共鸣榜聚类——KMeans 质心划分，只跑正向评价子集。

算法选型（2026-10-13 真实数据实证修正 spec §7.2）：
- HDBSCAN(密度) 在真实电商评价上失效：738/800 条并成一坨（真实评价在嵌入空间是连续
  高密度云，卖点差异是云内细微方向，非密度分离的岛）。
- KMeans(质心划分) 分出均衡簇，簇词对应可区分卖点维度。
- 卖点是已知商业维度(屏幕/续航/散热/音质/价格)，簇数大致已知 → KMeans 的"预设 k"
  不是缺陷而是契合；HDBSCAN 的噪声识别价值用情感前置过滤 + 簇置信度替代。

前置：sentiment_classify.py 已把评价分 正/负/中，本脚本只取 pos（卖点共鸣榜只看正向）。
输出：pipeline/data/sp_clusters.json，供命名三阶段消费。
"""
import json
import argparse
from collections import defaultdict

import jieba
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sentence_transformers import SentenceTransformer

STOPWORDS = set("""
的 了 是 我 也 就 都 很 还 在 和 有 不 这 那 你 他 她 它 们 个 上 下 到 说 要 会 着 没 好 一 个
真的 这个 那个 什么 怎么 这样 一样 比较 非常 特别 有点 一些 感觉 觉得 还是 就是 不是 没有 可以
不错 东西 京东 淘宝 天猫 卖家 买家 客服 物流 快递 发货 包装 收到 购买 买了 值得 好评 满意 性价比
一款 一次 用 用用 使用 没用 还行 一般 总体 来说 第一次 一直 现在 以后 目前 之前
不能 没有 问题 功能 系统 一个 苹果 华为 小米 品牌 国产 支持 信赖 相信 质量
""".split())


def tok(t):
    return [w for w in jieba.lcut(t) if w.strip() and w not in STOPWORDS and len(w) > 1]


def top_words(texts, n=10):
    if not texts:
        return []
    v = TfidfVectorizer(tokenizer=tok, token_pattern=None, min_df=1)
    X = v.fit_transform(texts)
    scores = np.asarray(X.sum(axis=0)).ravel()
    idx = scores.argsort()[::-1][:n]
    return [v.get_feature_names_out()[i] for i in idx]


def run(data_path, k, sample, out_path):
    rows = [json.loads(l) for l in open(data_path, encoding="utf-8")]
    pos = [r for r in rows if r.get("sentiment") == "pos"]
    print(f"[load] 总 {len(rows)} | 正向 {len(pos)} ({len(pos)/max(len(rows),1)*100:.0f}%)")
    if sample and 0 < sample < len(pos):
        import random
        random.seed(42)
        pos = random.sample(pos, sample)
        print(f"[sample] 子采样 {sample}")
    docs = [" ".join(r["text"].split()) for r in pos]

    print("[embed] BGE-M3 …")
    em = SentenceTransformer("BAAI/bge-m3")
    X = em.encode(docs, show_progress_bar=True, normalize_embeddings=True)

    print(f"[cluster] KMeans k={k} …")
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X)
    # 质心距离 → 置信度（越近越典型）
    dists = km.transform(X).min(axis=1)

    clusters = []
    for c in range(k):
        idxs = np.where(labels == c)[0]
        texts = [docs[i] for i in idxs]
        # 代表引文：离质心最近的 3 条（最典型）
        order = idxs[np.argsort(dists[idxs])][:3]
        clusters.append({
            "topic_id": int(c),
            "size": int(len(idxs)),
            "top_words": top_words(texts, 10),
            "samples": [docs[i] for i in idxs[:12]],
            "exemplars": [docs[i] for i in order],
            "avg_dist": round(float(dists[idxs].mean()), 3),
        })
    clusters.sort(key=lambda c: -c["size"])

    result = {
        "embed_model": "BAAI/bge-m3",
        "algo": f"KMeans k={k}",
        "sentiment_filter": "pos",
        "n_input": len(docs),
        "n_clusters": k,
        "clusters": clusters,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[save] → {out_path}")

    print("\n===== 人工看簇（卖点维度是否合理）=====")
    for c in clusters:
        print(f"\n--- 簇 {c['topic_id']} | {c['size']} 条 | avg_dist {c['avg_dist']} ---")
        print("词:", " ".join(c["top_words"][:8]))
        for s in c["exemplars"][:2]:
            print("  ·", s[:50])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="pipeline/data/ce_sentiment.jsonl")
    ap.add_argument("--k", type=int, default=8, help="卖点维度数（屏幕/续航/散热/音质/手感/价格/外观/性能 ≈ 8）")
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--out", default="pipeline/data/sp_clusters.json")
    args = ap.parse_args()
    run(args.data, args.k, args.sample, args.out)
