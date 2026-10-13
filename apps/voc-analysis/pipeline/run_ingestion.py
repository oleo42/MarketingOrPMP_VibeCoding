"""数据接入编排——上传 CSV → 统一格式 → 跑完整管道 → 刷新榜单。

数据接入层落地（spec §5-Q1 DataSource 抽象 + 市场及格线#1 可重复数据接入）。
流程：
  uploads/<job>.csv → 转 jsonl(统一 Review 结构) → 情感分类 → 卖点匹配 → 榜单导出
状态机：写 uploads/<job>.status.json，前端轮询。阶段：received→cleaning→sentiment→matching→exporting→done/error。
增量：与既有 ce_reviews.jsonl 合并(去重)，榜单反映全量。
"""
import json
import os
import sys
import csv
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # apps/voc-analysis
DATA = os.path.join(ROOT, "pipeline", "data")
UPLOADS = os.path.join(DATA, "uploads")
PY = os.path.join(ROOT, ".venv", "Scripts", "python.exe")


def status_path(job):
    return os.path.join(UPLOADS, f"{job}.status.json")


def set_status(job, stage, **kw):
    os.makedirs(UPLOADS, exist_ok=True)
    with open(status_path(job), "w", encoding="utf-8") as f:
        json.dump({"job": job, "stage": stage, "ts": time.time(), **kw}, f, ensure_ascii=False)


def run_step(job, stage, argv):
    set_status(job, stage)
    r = subprocess.run([PY] + argv, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        set_status(job, "error", stage=stage, error=(r.stderr or r.stdout)[-800:])
        sys.exit(1)
    return r.stdout


def csv_to_jsonl(job):
    """uploads/<job>.csv → uploads/<job>.jsonl (统一 {text,cat?,rating?,date?})"""
    set_status(job, "cleaning")
    src = os.path.join(UPLOADS, f"{job}.csv")
    dst = os.path.join(UPLOADS, f"{job}.jsonl")
    n = 0
    with open(src, encoding="utf-8-sig", newline="") as f, open(dst, "w", encoding="utf-8") as out:
        reader = csv.DictReader(f)
        if "text" not in (reader.fieldnames or []):
            set_status(job, "error", stage="cleaning", error=f"CSV 缺少必需列 'text'，实际列: {reader.fieldnames}")
            sys.exit(1)
        for row in reader:
            t = (row.get("text") or "").strip()
            if len(t) < 5:
                continue
            rec = {"text": t}
            for k in ("cat", "rating", "date"):
                if row.get(k):
                    rec[k] = row[k].strip()
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1
    if n == 0:
        set_status(job, "error", stage="cleaning", error="CSV 无有效评价(需 text 列且≥5字)")
        sys.exit(1)
    return dst, n


def main():
    job = sys.argv[1]
    set_status(job, "received")
    new_jsonl, n_new = csv_to_jsonl(job)

    # 合并到全量(去重)
    full = os.path.join(DATA, "ce_reviews.jsonl")
    seen = set()
    if os.path.exists(full):
        for l in open(full, encoding="utf-8"):
            seen.add(json.loads(l)["text"])
    add = 0
    with open(full, "a", encoding="utf-8") as out:
        for l in open(new_jsonl, encoding="utf-8"):
            j = json.loads(l)
            if j["text"] not in seen:
                out.write(json.dumps(j, ensure_ascii=False) + "\n")
                seen.add(j["text"])
                add += 1
    set_status(job, "cleaning", total_rows=len(seen), new_rows=n_new, added=add)

    # 情感分类(断点续跑,只跑新增)
    run_step(job, "sentiment", ["pipeline/sentiment_classify.py",
                                "--data", "pipeline/data/ce_reviews.jsonl",
                                "--out", "pipeline/data/ce_sentiment.jsonl"])
    # 卖点匹配
    run_step(job, "matching", ["pipeline/match_selling_points_kw.py",
                               "--data", "pipeline/data/ce_sentiment.jsonl",
                               "--out", "pipeline/data/selling_points.json"])
    # 榜单导出
    run_step(job, "exporting", ["pipeline/export_sp_board.py",
                                "--sp", "pipeline/data/selling_points.json",
                                "--data", "pipeline/data/ce_sentiment.jsonl",
                                "--out", "pipeline/data/sp_board_ui.json"])
    # 趋势导出(真实 date 用真实月份,无 date 合成占位)
    run_step(job, "exporting", ["pipeline/export_trend.py",
                                "--data", "pipeline/data/ce_sentiment.jsonl",
                                "--out", "pipeline/data/trend_ui.json"])
    set_status(job, "done", added=add)
    print(f"[done] job={job} added={add}")


if __name__ == "__main__":
    main()
