'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import CandidateDrawer from '@/components/CandidateDrawer';

interface Candidate {
  id: number;
  filename: string;
  parse_status: string;
  name: string | null;
  years_experience: number | null;
  ai_verdict: string | null;
  ai_score: number | null;
  human_verdict: string | null;
  human_note: string | null;
  reason: string | null;
}

interface RunInfo {
  id: number;
  jd_text: string;
  total: number;
  done: number;
  status: string;
  input_tokens: number;
  output_tokens: number;
}

type VerdictFilter = 'all' | 'recommend' | 'hold' | 'reject' | 'needs_review';

const VERDICT_BADGE: Record<string, { label: string; className: string }> = {
  recommend: { label: '推荐', className: 'bg-green-100 text-green-800' },
  hold: { label: '待定', className: 'bg-yellow-100 text-yellow-800' },
  reject: { label: '拒绝', className: 'bg-red-100 text-red-800' },
};

const HUMAN_BADGE: Record<string, string> = {
  recommend: 'bg-green-100 text-green-800',
  hold: 'bg-yellow-100 text-yellow-800',
  reject: 'bg-red-100 text-red-800',
};

function statusBadge(c: Candidate): { label: string; className: string } {
  if (c.parse_status === 'needs_manual') {
    return { label: '需人工', className: 'bg-gray-200 text-gray-700' };
  }
  if (c.parse_status === 'failed') {
    return { label: '失败', className: 'bg-gray-300 text-gray-700' };
  }
  if (c.parse_status === 'pending' || c.parse_status === 'extracted') {
    return { label: '处理中', className: 'bg-blue-100 text-blue-800' };
  }
  if (c.ai_verdict && VERDICT_BADGE[c.ai_verdict]) return VERDICT_BADGE[c.ai_verdict];
  return { label: c.parse_status, className: 'bg-gray-100 text-gray-600' };
}

/** Scored candidates first by score desc; needs_manual/failed sink to bottom. */
function compareCandidates(a: Candidate, b: Candidate): number {
  const aBottom = a.parse_status === 'needs_manual' || a.parse_status === 'failed';
  const bBottom = b.parse_status === 'needs_manual' || b.parse_status === 'failed';
  if (aBottom !== bBottom) return aBottom ? 1 : -1;
  return (b.ai_score ?? -1) - (a.ai_score ?? -1);
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;
  const [run, setRun] = useState<RunInfo | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filter, setFilter] = useState<VerdictFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverMsg, setRecoverMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`加载失败 (${res.status})`);
      const data = (await res.json()) as { run: RunInfo; candidates: Candidate[] };
      setRun(data.run);
      setCandidates(data.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  // D4：恢复处理——stuck processing（dev 热重载/崩溃中断后台任务）或有 failed 候选人时，
  // 允许重新触发 process。后端已有并发守卫（409），重复点击安全。
  async function handleRecover() {
    setRecovering(true);
    setRecoverMsg(null);
    try {
      // 先把 stuck 的 processing 复位为 pending，否则后端 409 拒绝。
      if (run?.status === 'processing') {
        await fetch(`/api/runs/${runId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reset_processing: true }),
        });
      }
      const res = await fetch(`/api/runs/${runId}/process`, { method: 'POST' });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; pending?: number }
        | null;
      if (!res.ok) throw new Error(body?.error ?? `恢复失败 (${res.status})`);
      setRecoverMsg(`已恢复处理（${body?.pending ?? 0} 个待处理）`);
      await load();
    } catch (e) {
      setRecoverMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setRecovering(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates
      .filter((c) => {
        if (filter === 'needs_review') {
          return c.parse_status === 'needs_manual' || c.parse_status === 'failed';
        }
        if (filter !== 'all' && c.ai_verdict !== filter) return false;
        if (q && !(c.name ?? c.filename).toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(compareCandidates);
  }, [candidates, filter, search]);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-red-600">{error}</p>
        <Link href="/" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
          ← 返回首页
        </Link>
      </main>
    );
  }

  const counts = {
    recommend: candidates.filter((c) => c.ai_verdict === 'recommend').length,
    hold: candidates.filter((c) => c.ai_verdict === 'hold').length,
    reject: candidates.filter((c) => c.ai_verdict === 'reject').length,
    needs_review: candidates.filter(
      (c) => c.parse_status === 'needs_manual' || c.parse_status === 'failed'
    ).length,
  };

  const filterButtons: { key: VerdictFilter; label: string }[] = [
    { key: 'all', label: `全部 (${candidates.length})` },
    { key: 'recommend', label: `推荐 (${counts.recommend})` },
    { key: 'hold', label: `待定 (${counts.hold})` },
    { key: 'reject', label: `拒绝 (${counts.reject})` },
    { key: 'needs_review', label: `需人工/失败 (${counts.needs_review})` },
  ];

  return (
    <main className="mx-auto max-w-6xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← 新建筛选
          </Link>
          <h1 className="mt-1 text-2xl font-bold">审核队列 · Run #{runId}</h1>
          {run && (
            <p className="mt-1 text-xs text-gray-500">
              状态 {run.status} · {run.done}/{run.total} 已处理 · tokens {run.input_tokens}/
              {run.output_tokens}
            </p>
          )}
          {recoverMsg && <p className="mt-1 text-xs text-amber-700">{recoverMsg}</p>}
        </div>
        <div className="flex items-center gap-2">
          {run && (run.status === 'processing' || counts.needs_review > 0) && (
            <button
              type="button"
              onClick={handleRecover}
              disabled={recovering}
              className="rounded border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {recovering ? '恢复中…' : run.status === 'processing' ? '恢复处理' : '重试失败项'}
            </button>
          )}
          <a
            href={`/api/runs/${runId}/export`}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            导出 CSV
          </a>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {filterButtons.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setFilter(b.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === b.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {b.label}
          </button>
        ))}
        <input
          type="search"
          placeholder="按姓名/文件名搜索…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">姓名</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">年限</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">AI 档位</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">人工档位</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">分数</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">理由</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {visible.map((c) => {
              const badge = statusBadge(c);
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{c.name ?? '—'}</div>
                    <div className="text-xs text-gray-400">{c.filename}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {c.years_experience != null ? `${c.years_experience} 年` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {c.human_verdict ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${HUMAN_BADGE[c.human_verdict] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {VERDICT_BADGE[c.human_verdict]?.label ?? c.human_verdict}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">未审核</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">
                    {c.ai_score ?? '—'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-gray-600" title={c.reason ?? ''}>
                    {c.reason ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  没有匹配的候选人
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CandidateDrawer
        candidateId={selected}
        onClose={() => setSelected(null)}
        onSaved={() => void load()}
      />
    </main>
  );
}
