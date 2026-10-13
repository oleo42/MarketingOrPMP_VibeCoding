'use client';

import { useRef, useState } from 'react';

const STAGES: Record<string, string> = {
  starting: '启动中',
  received: '已接收',
  cleaning: '清洗转格式',
  sentiment: 'LLM 情感分类',
  matching: '卖点匹配',
  exporting: '导出榜单',
  done: '完成',
  error: '出错',
};
const ORDER = ['received', 'cleaning', 'sentiment', 'matching', 'exporting', 'done'];

export default function IngestCard() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function poll(job: string) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const r = await fetch(`/api/ingest/status?job=${job}`);
        const j = await r.json();
        setStage(j.stage ?? 'starting');
        if (j.stage === 'done') {
          setMsg(`已并入 ${j.added ?? '?'} 条新评价，榜单已刷新`);
          setBusy(false);
          setTimeout(() => window.location.reload(), 1200);
          return;
        }
        if (j.stage === 'error') {
          setErr(j.error ?? '管道失败');
          setBusy(false);
          return;
        }
      } catch {
        // 继续轮询
      }
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setMsg('');
    const file = inputRef.current?.files?.[0];
    if (!file) { setErr('请选择 CSV 文件'); return; }
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true); setStage('received');
    try {
      const r = await fetch('/api/ingest', { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.ok) { setErr(j.error ?? '上传失败'); setBusy(false); return; }
      poll(j.job);
    } catch (ex) {
      setErr(String(ex).slice(0, 200)); setBusy(false);
    }
  }

  const idx = ORDER.indexOf(stage);
  return (
    <form onSubmit={onUpload} className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-700">导入评价数据</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          disabled={busy}
          className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-amber-50 file:px-3 file:py-1.5 file:text-sm file:text-amber-700 hover:file:bg-amber-100"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? '处理中…' : '上传并重跑榜单'}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        CSV 需含 <code className="rounded bg-gray-100 px-1">text</code> 列（评价正文），可选 <code className="rounded bg-gray-100 px-1">cat</code>/<code className="rounded bg-gray-100 px-1">rating</code>/<code className="rounded bg-gray-100 px-1">date</code> 列。上传后自动跑：清洗 → 情感分类 → 卖点匹配 → 刷新榜单。
      </p>
      {busy && (
        <div className="mt-2 flex items-center gap-2">
          {ORDER.map((s, i) => (
            <span
              key={s}
              className={`rounded px-2 py-0.5 text-xs ${
                i < idx ? 'bg-emerald-100 text-emerald-700'
                : i === idx ? 'bg-amber-100 text-amber-700 animate-pulse'
                : 'bg-gray-100 text-gray-400'
              }`}
            >
              {STAGES[s]}
            </span>
          ))}
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </form>
  );
}
