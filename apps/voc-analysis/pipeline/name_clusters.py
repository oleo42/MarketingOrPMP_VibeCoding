"""簇命名三阶段——spike 验证 Q5 决策（全自动命名 + 多轮复查）。
读 BERTopic 聚类结果，对每个簇：
  阶段1+3合并：一次 LLM 调用生成 3 个独立候选名（省 2 次调用），嵌入余弦相似度算收敛度
  阶段2：LLM 交叉验证（语义相关标准，非字面匹配）→ 通过率
置信度 = 0.6 × 阶段2通过率 + 0.4 × 阶段3收敛度。<0.5 → needsReview。
LLM 复用 Ark（OpenAI 兼容端点）；嵌入相似度复用 BGE-M3。
"""
import json
import os
import argparse
import numpy as np
from openai import OpenAI
from sentence_transformers import SentenceTransformer

LLM_MODEL = "ark-code-latest"


def make_client():
    return OpenAI(
        base_url="https://ark.cn-beijing.volces.com/api/coding/v1",
        api_key=os.environ["VOLCENGINE_API_KEYwinomp"],
    )


def llm(client, system, user, max_tokens=2000):
    r = client.chat.completions.create(
        model=LLM_MODEL, max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    return r.choices[0].message.content or ""


def stage1_generate_3(client, samples, keywords):
    """阶段1+3合并：一次调用生成 3 个独立候选名（供收敛度比较），省 2 次 LLM 调用。"""
    system = "你是消费电子手游外设（手柄）产品的用户洞察分析师。"
    user = (
        f"以下是手游外设手柄的一批用户评价，以及它们的主题关键词：\n\n"
        f"主题关键词：{'、'.join(keywords[:8])}\n\n"
        f"代表性评价：\n" + "\n".join(f"- {s}" for s in samples) +
        "\n\n这些评价共同称赞的产品卖点是什么？请独立给出 3 个候选卖点短语，每个 ≤12 字的人话概括。"
        "要求具体（说'摇杆精准不漂移'，不说'手感好'；说'续航20小时'，不说'续航好'）。"
        "3 个候选各占一行，只输出短语本身，不要编号、不要解释、不要引号。"
    )
    out = llm(client, system, user).strip()
    names = [l.strip().strip('"').strip('0123.、- ') for l in out.splitlines() if l.strip()]
    names = [n for n in names if n][:3]
    while len(names) < 3:
        names.append(names[0] if names else "卖点")
    return names[0], names[1], names[2]


def stage2_verify(client, name, samples):
    """验证标准是"语义相关/支持"而非"字面都在说"——卖点名是概括，评价未必字面重复它。"""
    system = (
        "你是严谨的用户评价分析审核员。判断标准：评价内容是否与候选卖点概括语义相关、"
        "能支持它。概括是对卖点的提炼，评价不需要字面重复概括用词。"
    )
    user = (
        f"候选卖点概括：「{name}」\n\n"
        f"请判断以下每条用户评价是否与这个卖点语义相关（即在谈论同一产品方面，且情感一致）：\n" +
        "\n".join(f"{i+1}. {s}" for i, s in enumerate(samples)) +
        "\n\n先逐条答「相关/不相关+一句理由」，最后一行单独输出：相关数/总数（如 4/5）。"
    )
    out = llm(client, system, user)
    for line in reversed(out.splitlines()):
        line = line.strip()
        if "/" in line:
            parts = [p for p in line.replace("相关数", "").replace("通过数", "").replace("：", "").split("/") if p.strip().isdigit()]
            if len(parts) == 2 and int(parts[1]) > 0:
                return int(parts[0]) / int(parts[1]), out
    return 0.5, out


def cosine(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def name_cluster(client, embed_model, cluster):
    samples_all = cluster["samples"]
    keywords = cluster["top_words"]
    # 阶段1 用前 4 条，阶段2 用 5-9 条（不重叠，且样本量足够）
    s1 = samples_all[:4]
    s2 = samples_all[4:9] if len(samples_all) > 8 else samples_all[:4]

    v1, v2, v3 = stage1_generate_3(client, s1, keywords)
    pass_rate, _ = stage2_verify(client, v1, s2)
    retries = 0
    while pass_rate < 0.8 and retries < 1:
        v1b, _, _ = stage1_generate_3(client, s1, keywords)
        pr2, _ = stage2_verify(client, v1b, s2)
        if pr2 > pass_rate:
            v1, pass_rate = v1b, pr2
        retries += 1
    embs = embed_model.encode([v1, v2, v3])
    sims = [cosine(embs[0], embs[1]), cosine(embs[0], embs[2]), cosine(embs[1], embs[2])]
    convergence = sum(sims) / len(sims)

    confidence = 0.6 * pass_rate + 0.4 * convergence
    return {
        "topic_id": cluster["topic_id"],
        "size": cluster["size"],
        "dominant_expected": cluster["dominant_expected"],
        "name": v1,
        "alt_names": [v2, v3],
        "pass_rate": round(pass_rate, 2),
        "convergence": round(convergence, 2),
        "confidence": round(confidence, 2),
        "needsReview": confidence < 0.5,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--clusters", default="pipeline/data/clusters_bge-m3_mcs5.json")
    ap.add_argument("--out", default="pipeline/data/named_clusters.json")
    ap.add_argument("--topics", default="", help="只命名指定簇 id，逗号分隔（spike 省时）；空=全部")
    args = ap.parse_args()

    with open(args.clusters, encoding="utf-8") as f:
        data = json.load(f)
    clusters = data["clusters"]
    if args.topics:
        keep = {int(x) for x in args.topics.split(",")}
        clusters = [c for c in clusters if c["topic_id"] in keep]

    client = make_client()
    print("[embed] 加载 BGE-M3 做相似度计算 …")
    embed_model = SentenceTransformer("BAAI/bge-m3")

    results = []
    for c in clusters:
        print(f"[name] 簇 {c['topic_id']} ({c['size']} 条, 主真实卖点: {c['dominant_expected']}) …", flush=True)
        r = name_cluster(client, embed_model, c)
        results.append(r)
        print(f"  → 名「{r['name']}」 | 通过率 {r['pass_rate']} | 收敛 {r['convergence']} | 置信 {r['confidence']} {'[需复核]' if r['needsReview'] else ''}", flush=True)
        print(f"     备选: {r['alt_names']}", flush=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

    n_review = sum(1 for r in results if r["needsReview"])
    print(f"\n===== 命名结果 =====")
    print(f"总簇 {len(results)} | 需人工复核 {n_review} ({round(n_review/len(results)*100)}%)")
    for r in results:
        match = "✓" if (r["dominant_expected"] and r["dominant_expected"] in r["name"]) or (r["dominant_expected"] is None) else "?"
        print(f"  {match} 簇{r['topic_id']:>2} 「{r['name']}」 (真实:{r['dominant_expected'] or '噪声'}) 置信{r['confidence']}")
    print(f"[save] → {args.out}")
