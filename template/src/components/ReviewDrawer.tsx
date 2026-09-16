'use client';

// ============================================================
// 通用详情 drawer + 人工审核表单（四段式 · 第 3 段的裁决界面）
// 从 resume-screening 的 CandidateDrawer.tsx 泛化。
// 保留全部交互契约：右侧滑出 / AI 与人工档位并排 / extract 与 score
// 全量 JSON 展示（可解释性）/ 改判下拉 + 备注 textarea / PATCH 保存。
// 泛化点：API 路径前缀、档位选项、标题文案由 props 传入。
// ============================================================

import { useEffect, useState } from 'react';

export interface ReviewDetail {
  id: number;
  source_name: string;
  status: string;
  extract_json: string | null;
  score_json: string | null;
  ai_verdict: string | null;
  ai_score: number | null;
  human_verdict: string | null;
  human_note: string | null;
}

export interface VerdictOption {
  value: string;
  label: string;
}

interface Props {
  itemId: number | null;
  /** 详情/保存的 API 前缀，如 '/api/items'（GET/PATCH `${apiBase}/${id}`） */
  apiBase: string;
  /** 档位选项（第一个通常是"（未改判）"空值） */
  verdictOptions: VerdictOption[];
  title?: string;
  onClose: () => void;
  onSaved: () => void;
}

function JsonBlock({ label, json }: { label: string; json: string | null }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-gray-700">{label}</h3>
      <pre className="max-h-56 overflow-auto rounded bg-gray-50 p-3 text-xs leading-relaxed">
        {json ? JSON.stringify(JSON.parse(json), null, 2) : '（无数据）'}
      </pre>
    </section>
  );
}

export default function ReviewDrawer({
  itemId,
  apiBase,
  verdictOptions,
  title = '详情',
  onClose,
  onSaved,
}: Props) {
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (itemId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/${itemId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`加载失败 (${res.status})`);
        return (await res.json()) as ReviewDetail;
      })
      .then((row) => {
        if (cancelled) return;
        setDetail(row);
        setVerdict(row.human_verdict ?? '');
        setNote(row.human_note ?? '');
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, apiBase]);

  async function handleSave() {
    if (itemId == null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          human_verdict: verdict === '' ? null : verdict,
          human_note: note,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `保存失败 (${res.status})`);
      }
      const updated = (await res.json()) as ReviewDetail;
      setDetail(updated);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (itemId == null) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-gray-500">{detail?.source_name ?? `#${itemId}`}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
            aria-label="关闭"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-gray-500">加载中…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {detail && (
            <>
              <section>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500">AI 档位：</span>
                  <span className="font-medium">{detail.ai_verdict ?? '—'}</span>
                  <span className="text-gray-500">分数：</span>
                  <span className="font-medium">{detail.ai_score ?? '—'}</span>
                  <span className="text-gray-500">状态：</span>
                  <span className="font-medium">{detail.status}</span>
                </div>
              </section>

              <JsonBlock label="抽取结果（extract）" json={detail.extract_json} />
              <JsonBlock label="评分结果（score）" json={detail.score_json} />

              <section className="rounded border border-gray-200 p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">人工审核</h3>
                <label className="block text-xs text-gray-500" htmlFor="verdict">
                  改判档位
                </label>
                <select
                  id="verdict"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={verdict}
                  onChange={(e) => setVerdict(e.target.value)}
                >
                  {verdictOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <label className="mt-3 block text-xs text-gray-500" htmlFor="note">
                  备注
                </label>
                <textarea
                  id="note"
                  className="mt-1 h-24 w-full rounded border border-gray-300 p-2 text-sm"
                  placeholder="改判原因、补充信息…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
