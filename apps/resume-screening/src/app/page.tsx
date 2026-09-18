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
  const [dragging, setDragging] = useState(false);
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

  function chooseFiles(list: FileList | File[]) {
    const selected = Array.from(list);
    const invalid = selected.find((f) => !f.name.toLowerCase().endsWith('.pdf'));
    if (invalid) { setError(`“${invalid.name}” 不是 PDF 文件`); return; }
    if (selected.length > 50) { setError('最多一次上传 50 份简历'); return; }
    setError(null); setFiles(selected);
  }

  const busy = phase === 'uploading' || phase === 'processing';
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div><p className="text-sm font-semibold text-blue-600">招聘工作台 · MVP</p><h1 className="mt-2 text-3xl font-bold tracking-tight">让第一轮简历筛选更快、更有依据</h1><p className="mt-2 max-w-2xl text-sm text-gray-500">粘贴职位描述，上传 PDF 简历。系统会提取关键信息并给出可解释的建议，最终决定仍由你确认。</p></div>
        <span className="hidden rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm sm:inline">本地运行 · 数据不出本机</span>
      </div>
      <div className="grid gap-5 md:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">

      <section className="mt-6">
        <label className="block text-sm font-medium text-gray-700" htmlFor="jd">
          职位描述（JD）
        </label>
        <textarea
          id="jd"
          className="mt-2 h-52 w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          placeholder="粘贴职位描述，例如：招聘 3 年以上经验的前端工程师，熟悉 React / TypeScript …"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          disabled={busy}
        />
      </section>

      <section className="mt-5">
        <label className="block text-sm font-medium text-gray-700" htmlFor="files">
          简历 PDF（可多选）
        </label>
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFiles(e.dataTransfer.files); }} className={`mt-2 rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
        <input
          id="files"
          type="file"
          multiple
          accept=".pdf"
          className="mt-1 block w-full text-sm text-gray-600 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
          disabled={busy}
          onChange={(e) => chooseFiles(e.target.files ?? [])}
        />
        <p className="mt-2 text-xs text-gray-400">也可以把 PDF 拖到这里 · 单份不超过 10 MB · 最多 50 份</p></div>
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
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {phase === 'uploading' ? '上传中…' : phase === 'processing' ? '处理中…' : '开始筛选'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      </section>
      <aside className="rounded-2xl border border-gray-200 bg-slate-900 p-6 text-white shadow-sm"><p className="text-sm font-semibold text-blue-300">你会得到什么</p><ul className="mt-5 space-y-5 text-sm text-slate-300"><li><strong className="block text-white">结构化候选人信息</strong><span>姓名、年限、技能和亮点集中呈现。</span></li><li><strong className="block text-white">可解释的筛选建议</strong><span>每个分数都有理由和风险点，方便复核。</span></li><li><strong className="block text-white">人工最终确认</strong><span>你可以改判、写备注，再导出 CSV。</span></li></ul></aside></div>

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
