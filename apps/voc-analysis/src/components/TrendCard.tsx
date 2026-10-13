'use client';

import { useState } from 'react';
import type { TrendData } from '@/app/page';

const CAT_COLOR: Record<string, string> = {
  平板: '#3b82f6',   // blue-500
  手机: '#10b981',   // emerald-500
  计算机: '#8b5cf6', // violet-500
};

// 单条折线（SVG polyline）
function Line({ pts, months, color, max, min }: {
  pts: (number | null)[]; months: string[]; color: string; max: number; min: number;
}) {
  const W = 560, H = 160, PAD = 8;
  const span = Math.max(max - min, 0.01);
  const xs = months.map((_, i) => PAD + (i / Math.max(months.length - 1, 1)) * (W - PAD * 2));
  const ys = pts.map((v) => v === null ? null : H - PAD - ((v - min) / span) * (H - PAD * 2));
  const d: string[] = [];
  let started = false;
  ys.forEach((y, i) => {
    if (y === null) { started = false; return; }
    d.push(`${started ? 'L' : 'M'}${xs[i].toFixed(1)},${y.toFixed(1)}`);
    started = true;
  });
  return (
    <g>
      <path d={d.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {ys.map((y, i) => y === null ? null : (
        <circle key={i} cx={xs[i]} cy={y} r="3" fill={color}>
          <title>{`${months[i]} 净共鸣 ${(pts[i]! * 100).toFixed(0)}%`}</title>
        </circle>
      ))}
    </g>
  );
}

export default function TrendCard({ data }: { data: TrendData }) {
  const [metric, setMetric] = useState<'net' | 'volume'>('net');
  const { months, series } = data;

  // 值域
  const allVals = series.flatMap((s) => s.points.map((p) => metric === 'net' ? p.net : p.volume))
    .filter((v): v is number => v !== null);
  const max = metric === 'net' ? Math.max(...allVals, 1) : Math.max(...allVals, 1);
  const min = metric === 'net' ? Math.min(...allVals, 0) : 0;

  const W = 560, H = 160, PAD = 8;
  const xs = months.map((_, i) => PAD + (i / Math.max(months.length - 1, 1)) * (W - PAD * 2));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">趋势（品类 × 月份）</h2>
        {data.simulated && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700"
            title="开源数据无 date 字段，月份为确定性合成均匀分布；真实上传数据带 date 列即自动用真实月份">
            演示数据（无时间戳）
          </span>
        )}
        <div className="ml-auto flex gap-1 rounded-md border border-gray-200 p-0.5 text-xs">
          {(['net', 'volume'] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)}
              className={`rounded px-2 py-1 ${metric === m ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {m === 'net' ? '净共鸣' : '声量'}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full">
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = H - PAD - f * (H - PAD * 2);
          return <line key={f} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#f0f0f0" strokeWidth="1" />;
        })}
        {/* 净共鸣 0.5 参考线（雷区分界） */}
        {metric === 'net' && min <= 0.5 && max >= 0.5 && (() => {
          const y = H - PAD - ((0.5 - min) / Math.max(max - min, 0.01)) * (H - PAD * 2);
          return <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#fca5a5" strokeWidth="1" strokeDasharray="4 3" />;
        })()}
        {series.map((s) => (
          <Line key={s.cat}
            pts={s.points.map((p) => metric === 'net' ? p.net : p.volume)}
            months={months} color={CAT_COLOR[s.cat] ?? '#9ca3af'} max={max} min={min} />
        ))}
        {/* X 轴月份标签 */}
        {months.map((m, i) => (
          <text key={m} x={xs[i]} y={H + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">{m.slice(2)}</text>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
        {series.map((s) => (
          <span key={s.cat} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: CAT_COLOR[s.cat] ?? '#9ca3af' }} />
            {s.cat}
          </span>
        ))}
        <span className="ml-auto text-gray-400">
          {metric === 'net' ? '好评占比，越高越好；<0.5 为雷区' : '该品类当月评价总数'}
        </span>
      </div>
    </div>
  );
}
