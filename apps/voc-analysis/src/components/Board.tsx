'use client';

import { useState } from 'react';
import type { BoardData, Cluster } from '@/app/page';

const CAT_COLOR: Record<string, string> = {
  平板: 'bg-blue-500',
  手机: 'bg-emerald-500',
  计算机: 'bg-violet-500',
};

// 净共鸣度 → 颜色（0.7+ 强共鸣绿 / 0.5-0.7 中性琥珀 / <0.5 雷区红）
function netColor(net: number) {
  if (net >= 0.7) return { text: 'text-emerald-700', bg: 'bg-emerald-100', bar: 'bg-emerald-500' };
  if (net >= 0.5) return { text: 'text-amber-700', bg: 'bg-amber-100', bar: 'bg-amber-500' };
  return { text: 'text-red-700', bg: 'bg-red-100', bar: 'bg-red-500' };
}

// 双侧声量条：好评(绿) + 差评(红)，同一基线按比例分段
function DualBar({ pos, neg, maxTotal }: { pos: number; neg: number; maxTotal: number }) {
  const total = pos + neg || 1;
  const w = Math.min((total / maxTotal) * 100, 100);
  return (
    <div className="flex h-4 w-full overflow-hidden rounded bg-gray-100" title={`好评 ${pos} / 差评 ${neg}`}>
      <div className="flex" style={{ width: `${w}%` }}>
        <div className="bg-emerald-500" style={{ width: `${(pos / total) * 100}%` }} title={`好评 ${pos}`} />
        <div className="bg-red-400" style={{ width: `${(neg / total) * 100}%` }} title={`差评 ${neg}`} />
      </div>
    </div>
  );
}

function Row({ cluster, categories, maxTotal, rank }: {
  cluster: Cluster; categories: string[]; maxTotal: number; rank: number;
}) {
  const [open, setOpen] = useState(false);
  const nc = netColor(cluster.netResonance);
  return (
    <li className="rounded-lg border border-gray-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50">
        <span className="w-6 shrink-0 text-center text-sm font-bold text-gray-400">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{cluster.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${nc.bg} ${nc.text}`}>
              净共鸣 {Math.round(cluster.netResonance * 100)}%
            </span>
            {cluster.needsReview && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">待复核</span>}
          </div>
          <div className="mt-1.5 grid grid-cols-[1fr_auto] items-center gap-3">
            <DualBar pos={cluster.posVolume} neg={cluster.negVolume} maxTotal={maxTotal} />
            <span className="text-sm text-gray-600">
              <span className="font-semibold text-emerald-600">{cluster.posVolume}</span>
              <span className="text-gray-400"> / </span>
              <span className="font-semibold text-red-500">{cluster.negVolume}</span>
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          {/* 品类 × 净共鸣 */}
          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            {categories.map((c) => {
              const s = cluster.byCategory[c];
              if (!s) return null;
              const cnc = netColor(s.net);
              return (
                <span key={c} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${CAT_COLOR[c] ?? 'bg-gray-400'}`} />
                  {c}
                  <span className={`rounded px-1 ${cnc.bg} ${cnc.text}`}>{Math.round(s.net * 100)}%</span>
                  <span className="text-gray-400">({s.pos}好/{s.neg}差)</span>
                </span>
              );
            })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-emerald-600">好评引文（共鸣点）</p>
              <ul className="space-y-1.5">
                {cluster.posExemplars.map((e, i) => (
                  <li key={i} className="rounded bg-emerald-50 px-3 py-2 text-sm text-gray-700">{e}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-red-500">差评引文（吐槽点）</p>
              <ul className="space-y-1.5">
                {cluster.negExemplars.length ? cluster.negExemplars.map((e, i) => (
                  <li key={i} className="rounded bg-red-50 px-3 py-2 text-sm text-gray-700">{e}</li>
                )) : <li className="text-sm text-gray-400">该卖点几乎无差评</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// ===== 产品线对比视图：卖点 × 品类 净共鸣矩阵 =====
function CompareMatrix({ data }: { data: BoardData }) {
  const cats = data.categories;
  // 按整体净共鸣排序（强卖点在上）
  const clusters = [...data.clusters].sort((a, b) => b.netResonance - a.netResonance);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-4 py-2.5 font-medium text-gray-500">卖点</th>
            {cats.map((c) => (
              <th key={c} className="px-4 py-2.5 font-medium text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${CAT_COLOR[c] ?? 'bg-gray-400'}`} />
                  {c}
                </span>
              </th>
            ))}
            <th className="px-4 py-2.5 font-medium text-gray-500">整体净共鸣</th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((cl) => {
            const onc = netColor(cl.netResonance);
            return (
              <tr key={cl.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-800">{cl.name}</td>
                {cats.map((c) => {
                  const s = cl.byCategory[c];
                  if (!s || (s.pos + s.neg) === 0) {
                    return <td key={c} className="px-4 py-2.5 text-gray-300">—</td>;
                  }
                  const cnc = netColor(s.net);
                  return (
                    <td key={c} className="px-4 py-2.5">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cnc.bg} ${cnc.text}`}
                        title={`${c} · 好评 ${s.pos} / 差评 ${s.neg}`}>
                        {Math.round(s.net * 100)}%
                      </span>
                      <span className="ml-1.5 text-xs text-gray-400">{s.pos}好/{s.neg}差</span>
                    </td>
                  );
                })}
                <td className="px-4 py-2.5">
                  <span className={`font-semibold ${onc.text}`}>{Math.round(cl.netResonance * 100)}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
        读法：横向看"同一卖点在不同产品线的共鸣差异"（GTM 差异化内容），纵向看"某产品线的卖点 vs 雷区"。
        <span className="text-emerald-600"> 绿≥70% 卖点</span> ·
        <span className="text-amber-600"> 琥珀 50-70% 中性</span> ·
        <span className="text-red-600"> 红&lt;50% 雷区</span>
      </div>
    </div>
  );
}

export default function Board({ data }: { data: BoardData }) {
  const [view, setView] = useState<'board' | 'compare'>('board');
  const maxTotal = Math.max(...data.clusters.map((c) => c.posVolume + c.negVolume), 1);
  return (
    <div>
      {/* 视图切换 */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 text-sm w-fit">
        <button onClick={() => setView('board')}
          className={`rounded-md px-3 py-1.5 font-medium ${view === 'board' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          共鸣榜
        </button>
        <button onClick={() => setView('compare')}
          className={`rounded-md px-3 py-1.5 font-medium ${view === 'compare' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          产品线对比
        </button>
      </div>

      {view === 'compare' ? (
        <CompareMatrix data={data} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> 好评（共鸣）
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="inline-block h-3 w-3 rounded-sm bg-red-400" /> 差评（吐槽）
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">品类净共鸣：</span>
            {data.categories.map((c) => (
              <span key={c} className="flex items-center gap-1 text-gray-600">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${CAT_COLOR[c] ?? 'bg-gray-400'}`} />{c}
              </span>
            ))}
            <span className="ml-auto text-gray-500">{data.clusters.length} 个卖点维度</span>
          </div>
          <ul className="space-y-2">
            {data.clusters.map((c, i) => (
              <Row key={c.id} cluster={c} categories={data.categories} maxTotal={maxTotal} rank={i + 1} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
