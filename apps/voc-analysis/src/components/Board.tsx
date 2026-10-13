'use client';

import { useState } from 'react';
import type { BoardData, Cluster } from '@/app/page';

const CAT_COLOR: Record<string, string> = {
  平板: 'bg-blue-500',
  手机: 'bg-emerald-500',
  计算机: 'bg-violet-500',
};

function CategoryBar({ cluster, categories }: { cluster: Cluster; categories: string[] }) {
  const total = categories.reduce((s, c) => s + (cluster.byCategory[c]?.volume ?? 0), 0);
  if (total === 0) return <div className="h-2 w-full rounded bg-gray-100" />;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded bg-gray-100" title="品类声量占比">
      {categories.map((c) => {
        const v = cluster.byCategory[c]?.volume ?? 0;
        const pct = (v / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={c}
            className={`${CAT_COLOR[c] ?? 'bg-gray-400'}`}
            style={{ width: `${pct}%` }}
            title={`${c} ${v} 条`}
          />
        );
      })}
    </div>
  );
}

function VolumeBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-4 w-full overflow-hidden rounded bg-gray-100">
      <div className="h-full rounded bg-amber-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Row({ cluster, categories, maxVol, rank }: {
  cluster: Cluster; categories: string[]; maxVol: number; rank: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="w-6 shrink-0 text-center text-sm font-bold text-gray-400">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{cluster.name}</span>
            {cluster.needsReview && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">待复核</span>
            )}
            <span className="text-xs text-gray-500">命中率 {cluster.hitRate}%</span>
          </div>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3">
            <VolumeBar value={cluster.reviewCount} max={maxVol} />
            <span className="text-sm font-semibold text-gray-700">{cluster.reviewCount}</span>
          </div>
          <div className="mt-1.5">
            <CategoryBar cluster={cluster} categories={categories} />
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-3 text-xs text-gray-500">
            {categories.map((c) => {
              const s = cluster.byCategory[c];
              return s ? (
                <span key={c}>
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full ${CAT_COLOR[c] ?? 'bg-gray-400'}`} />
                  {c} {s.volume} 条 ({s.rate}%)
                </span>
              ) : null;
            })}
            <span className="ml-auto">置信度 {cluster.confidence}</span>
          </div>
          <p className="mb-1.5 text-xs font-medium text-gray-500">代表性引文</p>
          <ul className="space-y-1.5">
            {cluster.exemplars.map((e, i) => (
              <li key={i} className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function Board({ data }: { data: BoardData }) {
  const maxVol = Math.max(...data.clusters.map((c) => c.reviewCount), 1);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="font-medium text-gray-700">品类图例：</span>
        {data.categories.map((c) => (
          <span key={c} className="flex items-center gap-1.5 text-gray-600">
            <span className={`inline-block h-3 w-3 rounded-sm ${CAT_COLOR[c] ?? 'bg-gray-400'}`} />
            {c}
          </span>
        ))}
        <span className="ml-auto text-gray-500">共 {data.clusters.length} 个卖点维度</span>
      </div>
      <ul className="space-y-2">
        {data.clusters.map((c, i) => (
          <Row key={c.id} cluster={c} categories={data.categories} maxVol={maxVol} rank={i + 1} />
        ))}
      </ul>
    </div>
  );
}
