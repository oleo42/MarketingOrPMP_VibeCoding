"""对比测试：真实电商评价上 HDBSCAN(密度) vs KMeans(质心划分) 的卖点簇质量。

背景：spike 选 HDBSCAN（spec §7.2），但真实数据显示密度聚类把 738/800 条并成一坨——
真实电商评价在嵌入空间是连续高密度云，卖点差异是云内细微方向，不是密度分离的岛。
本脚本用同一份 BGE-M3 嵌入跑两种算法，对比：
  - 簇大小分布（HDBSCAN 是否一坨 / KMeans 是否均衡）
  - 各簇 c-TF-IDF 头部词（是否对应可命名的卖点维度：屏幕/续航/散热/音质/价格）
判定：KMeans 簇词若能对应独立卖点维度，则修正 spec §7.2 → KMeans(卖点数已知场景)。
"""
import json
import sys
import numpy as np
import jieba
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.cluster import KMeans
from sentence_transformers import SentenceTransformer

STOPWORDS = set("""
的 了 是 我 也 就 都 很 还 在 和 有 不 这 那 你 他 她 它 们 个 上 下 到 说 要 会 着 没 好 一 个
真的 这个 那个 什么 怎么 这样 一样 比较 非常 特别 有点 一些 感觉 觉得 还是 就是 不是 没有 可以
不错 东西 京东 淘宝 天猫 卖家 买家 客服 物流 快递 发货 包装 收到 购买 买了 值得 好评 满意 性价比
一款 一次 用 用用 使用 没用 还行 一般 总体 来说 第一次 一直 现在 以后 目前 之前
不能 没有 问题 功能 系统 一个 这个 那个 苹果 华为 小米 品牌 国产 支持 信赖 相信 质量
""".split())


def tok(t):
    return [w for w in jieba.lcut(t) if w.strip() and w not in STOPWORDS and len(w) > 1]


def top_words(texts, n=8):
    if not texts:
        return []
    v = TfidfVectorizer(tokenizer=tok, token_pattern=None, min_df=1)
    X = v.fit_transform(texts)
    scores = np.asarray(X.sum(axis=0)).ravel()
    idx = scores.argsort()[::-1][:n]
    return [v.get_feature_names_out()[i] for i in idx]


def main():
    rows = [json.loads(l) for l in open("pipeline/data/ce_reviews.jsonl", encoding="utf-8")]
    import random
    random.seed(42)
    rows = random.sample(rows, 800)
    docs = [" ".join(r["text"].split()) for r in rows]
    print(f"[load] {len(docs)} 条")

    print("[embed] BGE-M3 …")
    em = SentenceTransformer("BAAI/bge-m3")
    X = em.encode(docs, show_progress_bar=False, normalize_embeddings=True)

    print("\n===== KMeans 对比（k=8 卖点维度数）=====")
    km = KMeans(n_clusters=8, random_state=42, n_init=10)
    labels = km.fit_predict(X)
    for c in range(8):
        idxs = np.where(labels == c)[0]
        texts = [docs[i] for i in idxs]
        print(f"\n--- KMeans 簇 {c} | {len(idxs)} 条 ---")
        print("词:", " ".join(top_words(texts, 8)))
        for t in texts[:2]:
            print("  ·", t[:45])


if __name__ == "__main__":
    main()
