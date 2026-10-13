"""导出 online_shopping_10_cats 消费电子子集 → jsonl，供 VoC 管道用。

数据源：HuggingFace ttxy/online_shopping_10_cats（62773 条真实电商评价）
子集：平板 / 手机 / 计算机（消费电子，与手游外设同属消费电子，卖点语言相通）
清洗：去 BOM、去空白、过短(<5字)剔除、全文本去重(刷好评重复)、极长截断(500字)
输出：pipeline/data/ce_reviews.jsonl，每行 {"text": ..., "cat": ..., "_source_label": ...}
  - cat 保留原品类（平板/手机/计算机），供结果按品类分层看
  - _source_label 是原数据集的类别编码（非情感标签），仅留档不用于管道
"""
import pandas as pd
import json
import re

SRC = "pipeline/data/osc_train.parquet"
OUT = "pipeline/data/ce_reviews.jsonl"
CE_CATS = ["平板", "手机", "计算机"]
MIN_LEN = 5
MAX_LEN = 500


def clean(text: str) -> str:
    t = text.replace("﻿", "").replace("　", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def main():
    df = pd.read_parquet(SRC)
    ce = df[df["cat"].isin(CE_CATS)].copy()
    print(f"[load] 消费电子子集 {len(ce)} 条")

    ce["text"] = ce["review"].astype(str).map(clean)
    before = len(ce)
    ce = ce[ce["text"].str.len() >= MIN_LEN]
    print(f"[clean] 剔除过短(<{MIN_LEN}字) {before - len(ce)} 条 → {len(ce)}")

    before = len(ce)
    ce = ce.drop_duplicates(subset=["text"])
    print(f"[clean] 全文本去重 {before - len(ce)} 条 → {len(ce)}")

    over = (ce["text"].str.len() > MAX_LEN).sum()
    ce["text"] = ce["text"].str.slice(0, MAX_LEN)
    print(f"[clean] 极长截断(>{MAX_LEN}字) {over} 条")

    # 情感字段说明：原 label 是类别编码（平板=2/手机=3/计算机=9），非情感，留档即可
    cat_counts = ce["cat"].value_counts().to_dict()
    print(f"[stat] 品类分布: {cat_counts}")

    with open(OUT, "w", encoding="utf-8") as f:
        for _, r in ce.iterrows():
            f.write(json.dumps({
                "text": r["text"],
                "cat": r["cat"],
                "_source_label": str(r["label"]),
            }, ensure_ascii=False) + "\n")
    print(f"[save] → {OUT}  ({len(ce)} 条)")

    # 长度分布（供嵌入 token 估算）
    lens = ce["text"].str.len()
    print(f"[stat] 文本长度 中位 {int(lens.median())} / 均值 {int(lens.mean())} / p95 {int(lens.quantile(0.95))} / max {lens.max()}")


if __name__ == "__main__":
    main()
