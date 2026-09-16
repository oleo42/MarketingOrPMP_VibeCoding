'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';
type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

interface RunStatus {
  status: string;
  total: number;
  done: number;
}
export default function Home() {
  const router = useRouter();
  const [jdText, setJdText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const pollRef = useRef<IntervalHandle | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (runId: number) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/runs/${runId}`);
          if (!res.ok) return;
          const data = (await res.json()) as { run: RunStatus };
          setProgress({ done: data.run.done, total: data.run.total });
          if (data.run.status === 'done') {
            stopPolling();
            setPhase('done');
            router.push(`/runs/${runId}`);
          }
        } catch {
          // transient network error — keep polling
        }
      }, 2000);
    },
    [router, stopPolling]
  );

  async function handleSubmit() {
    setError(null);
    if (!jdText.trim()) {
      setError('请填写 JD（职位描述）');
      return;
    }
    if (files.length === 0) {
      setError('请至少选择一份 PDF 简历');
      return;
    }
    setPhase('uploading');
    try {
      const form = new FormData();
      form.append('jd_text', jdText);
      for (const f of files) form.append('files', f);

      const createRes = await fetch('/api/runs', { method: 'POST', body: form });
      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `创建 run 失败 (${createRes.status})`);
      }
      const { run_id: runId } = (await createRes.json()) as { run_id: number };

      const procRes = await fetch(`/api/runs/${runId}/process`, { method: 'POST' });
      if (!procRes.ok) throw new Error(`触发处理失败 (${procRes.status})`);

      setPhase('processing');
      setProgress({ done: 0, total: files.length });
      startPolling(runId);
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = phase === 'uploading' || phase === 'processing';
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">简历初筛</h1>
      <p className="mt-1 text-sm text-gray-500">
        上传 JD + 一批 PDF 简历，AI 自动抽取、打分、分档，然后进入人工审核队列。
      </p>

      <section className="mt-6">
        <label className="block text-sm font-medium text-gray-700" htmlFor="jd">
          职位描述（JD）
        </label>
        <textarea
          id="jd"
          className="mt-1 h-48 w-full rounded border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="粘贴职位描述，例如：招聘 3 年以上经验的前端工程师，熟悉 React / TypeScript …"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          disabled={busy}
        />
      </section>

      <section className="mt-4">
        <label className="block text-sm font-medium text-gray-700" htmlFor="files">
          简历 PDF（可多选）
        </label>
        <input
          id="files"
          type="file"
          multiple
          accept=".pdf"
          className="mt-1 block w-full text-sm text-gray-600 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          disabled={busy}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
            {files.map((f) => (
              <li key={f.name}>
                {f.name}（{(f.size / 1024).toFixed(1)} KB）
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {phase === 'uploading' ? '上传中…' : phase === 'processing' ? '处理中…' : '开始筛选'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {(phase === 'processing' || phase === 'done') && progress && (
        <div className="mt-6">
          <div className="flex justify-between text-xs text-gray-600">
            <span>
              已处理 {progress.done} / {progress.total}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">处理完成后将自动跳转到审核队列…</p>
        </div>
      )}
    </main>
  );
}
