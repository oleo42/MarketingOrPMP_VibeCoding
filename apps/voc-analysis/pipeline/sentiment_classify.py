"""LLM 情感分类批处理（批量 + 并发）——卖点聚类的前置过滤。

架构澄清（2026-10-13 真实数据实证）：卖点共鸣榜只应跑"正向评价子集"——
真实评价正负向混杂，不做情感过滤直接聚类，"电池死机/差评"问题簇会污染卖点榜。

性能（实测 2026-10-13）：ark-code-latest 单条分类 ~4.2s，16241 条逐条 ≈19h 不可行。
优化：一次 prompt 批量 10 条（返回 JSON 数组）+ 8 线程并发 → 1624 批次 ≈ 25-45min。
输出 jsonl：原字段 + {"sentiment": "pos|neg|neu", "sentiment_conf": 0-1}
容错：批次失败的条标 "unknown" 继续；断点续跑（按 text 跳过已分类）。
"""
import json
import os
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor
from openai import OpenAI

# 模型选型（2026-10-13 实测）：ark-code-latest 是 reasoning 模型，默认 10 条批量 128.7s 太慢；
# doubao-lite 走 /api/v3 报 404 无访问权限（coding plan key 未开通非 coding 模型）。
# 解法：留 ark-code-latest（已开通），加 reasoning_effort='low'——reasoning_tokens 412→52，5 条 9.3s→2.4s，
# 16241 条 / 5 / 8并发 ≈ 16min 可行。注意 low reasoning 下模型更"懒"，prompt 须给明确输出模板。
LLM_MODEL = "ark-code-latest"
LLM_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v1"
BATCH = 10
WORKERS = 8
SYSTEM = '''你是电商评价情感分类器。对每条评价判断对产品本身的情感倾向。

分类标准：
- pos：明确称赞产品（质量好/好用/喜欢/满意/某卖点好）
- neg：明确抱怨产品（差评/垃圾/坏/故障/不满意/某缺陷）
- neu：中性、说不清、只谈物流/发票/价格等非产品体验，或纯疑问
注意：物流快/客服好但产品没提 → neu；夸产品但顺便骂物流 → pos（看产品本身）。

严格按此 JSON 数组格式输出，不要任何其他文字、不要 markdown 代码块：
[{"i":0,"sentiment":"pos","conf":0.9},{"i":1,"sentiment":"neg","conf":0.8}]
conf 取 0.5-1.0。输出数组长度必须等于输入条数，i 与输入编号一一对应。'''

_local = threading.local()


def client():
    if not hasattr(_local, "c"):
        _local.c = OpenAI(
            base_url=LLM_BASE_URL,
            api_key=os.environ["VOLCENGINE_API_KEYwinomp"],
        )
    return _local.c

def classify_batch(items, retries=3):
    """items: [(idx, text), ...] → {idx: (sentiment, conf)}。失败重试，截断则加大 max_tokens。"""
    user = "\n".join(f"[{i}] {t[:300]}" for i, t in items)
    max_tokens = 1500
    for attempt in range(retries):
        try:
            r = client().chat.completions.create(
                model=LLM_MODEL, max_tokens=max_tokens, reasoning_effort="low",
                messages=[{"role": "system", "content": SYSTEM},
                          {"role": "user", "content": user}],
            )
            out = (r.choices[0].message.content or "").strip()
            finish = r.choices[0].finish_reason
            s = out.find("["); e = out.rfind("]")
            if s < 0 or e < 0:
                raise ValueError(f"no json array (finish={finish}): {out[:120]}")
            arr = json.loads(out[s:e + 1])
            res = {}
            for o in arr:
                sent = o.get("sentiment", "unknown")
                if sent not in ("pos", "neg", "neu"):
                    sent = "unknown"
                res[int(o["i"])] = (sent, round(float(o.get("conf", 0.5)), 2))
            return res
        except Exception as ex:
            if "length" in str(ex).lower() or (isinstance(ex, ValueError) and "no json" in str(ex)):
                max_tokens = min(max_tokens * 2, 6000)  # 截断 → 加倍
            if attempt == retries - 1:
                print(f"  [warn] 批次失败({len(items)}条) 重试{retries}次仍败: {str(ex)[:100]}")
                return {i: ("unknown", 0.0) for i, _ in items}
    return {i: ("unknown", 0.0) for i, _ in items}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="pipeline/data/ce_reviews.jsonl")
    ap.add_argument("--out", default="pipeline/data/ce_sentiment.jsonl")
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--retry-unknown", action="store_true", help="重跑输出里 sentiment=unknown 的条(剔除旧 unknown 记录后重分类)")
    args = ap.parse_args()

    rows = [json.loads(l) for l in open(args.data, encoding="utf-8")]
    if args.sample and 0 < args.sample < len(rows):
        import random
        random.seed(42)
        rows = random.sample(rows, args.sample)

    done = {}
    if os.path.exists(args.out):
        for l in open(args.out, encoding="utf-8"):
            j = json.loads(l)
            done[j["text"]] = j

    if args.retry_unknown:
        # 剔除 unknown 记录，重写输出文件，再重分类
        keep = [j for j in done.values() if j.get("sentiment") != "unknown"]
        with open(args.out, "w", encoding="utf-8") as f:
            for j in keep:
                f.write(json.dumps(j, ensure_ascii=False) + "\n")
        n_unk = len(done) - len(keep)
        done = {j["text"]: j for j in keep}
        print(f"[retry-unknown] 剔除 {n_unk} 条 unknown，保留 {len(keep)} 条")

    todo = [r for r in rows if r["text"] not in done]
    if args.limit:
        todo = todo[:args.limit]
    print(f"[load] 总 {len(rows)} | 已分类 {len(done)} | 待分类 {len(todo)}")

    # 分批
    batches = []
    for b in range(0, len(todo), BATCH):
        chunk = todo[b:b + BATCH]
        batches.append([(j, c["text"]) for j, c in enumerate(chunk, start=b)])

    lock = threading.Lock()
    n_done = [0]
    with open(args.out, "a", encoding="utf-8") as f, ThreadPoolExecutor(max_workers=WORKERS) as ex:
        def work(items):
            res = classify_batch(items)
            lines = []
            for j, text in items:
                sent, conf = res.get(j, ("unknown", 0.0))
                rec = dict(todo[j])
                rec["sentiment"] = sent
                rec["sentiment_conf"] = conf
                lines.append(json.dumps(rec, ensure_ascii=False))
            with lock:
                for ln in lines:
                    f.write(ln + "\n")
                f.flush()
                n_done[0] += len(items)
                if n_done[0] % 100 < BATCH:
                    print(f"  [progress] {n_done[0]}/{len(todo)}")

        list(ex.map(work, batches))
    print(f"[save] → {args.out}")

    all_recs = [json.loads(l) for l in open(args.out, encoding="utf-8")]
    from collections import Counter
    dist = Counter(r["sentiment"] for r in all_recs)
    print(f"[stat] 情感分布: {dict(dist)}")


if __name__ == "__main__":
    main()
