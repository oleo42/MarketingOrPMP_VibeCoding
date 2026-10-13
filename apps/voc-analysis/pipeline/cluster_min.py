"""VoC 最小聚类管道——spike 验证用。
流程：读 jsonl → 清洗 → 嵌入(BGE-M3 或 MiniLM) → BERTopic(UMAP+HDBSCAN+jieba c-TF-IDF) → 输出簇结果。
spike 目的：对比嵌入模型的簇内聚度，验证管道可行性。不做 LLM 命名（那是下一步）。
"""
import json
import sys
import argparse
from collections import defaultdict

import jieba
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer

# 中文停用词（电商评价常见无意义词）
STOPWORDS = set("""
的 了 是 我 也 就 都 很 还 在 和 有 不 这 那 你 他 她 它 们 个 上 下 到 说 要 会 着 没 好 一 个
真的 这个 那个 什么 怎么 这样 一样 比较 非常 特别 有点 一些 感觉 觉得 还是 就是 不是 没有 可以
不错 东西 京东 淘宝 天猫 卖家 买家 客服 物流 快递 发货 包装 收到 购买 买了 值得 好评 满意 性价比
一款 一次 用 用用 使用 没用 还行 一般 总体 来说 真的 真的不错 第一次 一直 现在 以后 目前 之前
不能 没有 问题 功能 系统 一个 一款 这个 那个 苹果 华为 小米 品牌 国产 支持 信赖 相信 质量
""".split())

# 手游外设自定义词典（防止 jieba 切错术语）
CUSTOM_WORDS = ["摇杆", "扳机键", "霍尔摇杆", "霍尔扳机", "背键", "宏定义", "线性扳机", "人体工学",
                "搓招", "压枪", "见切", "原神", "吃鸡", "怪猎", "apex", "Switch", "握把", "键程", "连发"]
for w in CUSTOM_WORDS:
    jieba.add_word(w)


def jieba_tokenize(text: str):
    return [t for t in jieba.lcut(text) if t.strip() and t not in STOPWORDS and len(t) > 1]


def load_reviews(path: str):
    reviews = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                reviews.append(json.loads(line))
    return reviews


def clean(text: str) -> str:
    return " ".join(text.split()).strip()


def run(embed_model_name: str, data_path: str, min_cluster_size: int, sample: int = 0):
    reviews = load_reviews(data_path)
    if sample and 0 < sample < len(reviews):
        import random
        random.seed(42)
        reviews = random.sample(reviews, sample)
    docs = [clean(r["text"]) for r in reviews]
    print(f"[load] {len(docs)} 条评价" + (f"(子采样 {sample})" if sample else ""))

    print(f"[embed] 加载嵌入模型 {embed_model_name} …")
    embed_model = SentenceTransformer(embed_model_name)

    # 中文 c-TF-IDF：jieba 分词；min_df=3 砍低频泛词，减少"不错/京东"类噪声进入簇代表词
    vectorizer = CountVectorizer(tokenizer=jieba_tokenize, token_pattern=None, min_df=3)

    # UMAP 设 random_state 固定降维结果——BERTopic 默认不固定，每次跑簇结构漂移（实测 10 簇↔8 簇），
    # 生产环境必须可复现。n_neighbors=20(默认10)：真实评价卖点混合、长尾多，增大邻居增强局部结构，
    # 让细分卖点簇(屏幕/续航/散热)从大杂簇中分离。
    from umap import UMAP
    umap_model = UMAP(n_neighbors=20, n_components=5, min_dist=0.0, metric="cosine", random_state=42)

    topic_model = BERTopic(
        embedding_model=embed_model,
        vectorizer_model=vectorizer,
        umap_model=umap_model,
        min_topic_size=min_cluster_size,
        verbose=False,
    )
    print(f"[cluster] BERTopic 聚类 (min_topic_size={min_cluster_size}) …")
    topics, _probs = topic_model.fit_transform(docs)

    # 汇总簇结果
    clusters = defaultdict(list)
    for i, t in enumerate(topics):
        clusters[t].append(i)

    n_noise = len(clusters.get(-1, []))
    n_clusters = len([t for t in clusters if t != -1])
    print(f"[result] {n_clusters} 个簇 + {n_noise} 条噪声")

    # 输出每簇：top 关键词 + 样本 + （spike 专用）真实卖点纯度
    out = []
    for tid in sorted([t for t in clusters if t != -1], key=lambda t: -len(clusters[t])):
        idxs = clusters[tid]
        words = [w for w, _ in topic_model.get_topic(tid)[:10]]
        expected = defaultdict(int)
        for i in idxs:
            exp = reviews[i].get("_expected_cluster")
            if exp is not None:
                expected[exp] += 1
        # 簇纯度：簇内最多的真实卖点占比（spike 验证指标）；真实数据无标注时跳过
        total = len(idxs)
        entry = {
            "topic_id": int(tid),
            "size": total,
            "top_words": words,
            "samples": [docs[i] for i in idxs[:12]],
        }
        if expected:
            dominant, dominant_n = max(expected.items(), key=lambda kv: kv[1])
            entry["purity"] = round(dominant_n / total, 2) if total else 0
            entry["dominant_expected"] = dominant
            entry["expected_dist"] = dict(expected)
        out.append(entry)

    result = {
        "embed_model": embed_model_name,
        "min_cluster_size": min_cluster_size,
        "n_reviews": len(docs),
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "noise_texts": [docs[i] for i in clusters.get(-1, [])][:10],
        "clusters": out,
    }
    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="paraphrase-multilingual-MiniLM-L12-v2")
    ap.add_argument("--data", default="pipeline/data/sample_reviews.jsonl")
    ap.add_argument("--min-cluster-size", type=int, default=5)
    ap.add_argument("--out", default="")
    ap.add_argument("--sample", type=int, default=0, help="子采样 N 条(0=全量)")
    args = ap.parse_args()

    res = run(args.model, args.data, args.min_cluster_size, args.sample)
    out_path = args.out or f"pipeline/data/clusters_{args.model.split('/')[-1]}_mcs{args.min_cluster_size}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(f"[save] → {out_path}")
    # 打印每簇摘要供人工看簇
    print("\n===== 人工看簇 =====")
    for c in res["clusters"]:
        pur = c.get("purity"); dom = c.get("dominant_expected", "-")
        pur_s = f"纯度 {pur} | 主真实卖点: {dom}" if pur is not None else "无标注(真实数据)"
        print(f"\n--- 簇 {c['topic_id']} | {c['size']} 条 | {pur_s} ---")
        print(f"关键词: {' '.join(c['top_words'][:8])}")
        for s in c["samples"][:3]:
            print(f"  · {s[:50]}")
    print(f"\n--- 噪声 {res['n_noise']} 条（应多为物流/短评）---")
    for s in res["noise_texts"][:5]:
        print(f"  · {s[:40]}")
