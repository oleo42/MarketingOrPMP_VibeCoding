'use client';

// ============================================================
// 通用审核队列表格（四段式 · 第 3 段的主界面）
// 从 resume-screening 的 runs/[id]/page.tsx 表格部分泛化。
// 保留：档位过滤按钮组（带计数）/ 搜索框 / 徽章 / 分数右对齐 /
//       已评分按分数降序 + needs_manual/failed 沉底 / 空态文案。
// 泛化点：列配置 ColumnDef[] 由使用方传入——这是"第 4 步：配置队列列"。
// ============================================================

import { useMemo, useState } from 'react';

/** 一条审核记录的最小契约（列表页所需字段） */
export interface ReviewRow {
  id: number;
  source_name: string;
  status: string;
  ai_verdict: string | null;
  ai_score: number | null;
  human_verdict: string | null;
  /** 允许挂任意业务字段，供自定义列 render 读取 */
  [key: string]: unknown;
}

/** 列定义：key 对应 row 字段；render 可完全自定义单元格 */
export interface ColumnDef<T extends ReviewRow = ReviewRow> {
  key: string;
  title: string;
  align?: 'left' | 'right';
  render?: (row: T) => React.ReactNode;
}

interface Props<T extends ReviewRow = ReviewRow> {
  rows: T[];
  columns: ColumnDef<T>[];
  /** 档位徽章配置：value → 文案 + 样式。三档结构见 README 第 6 节。 */
  verdictLabels: Record<string, { label: string; className: string }>;
  /** 搜索框按哪个字段过滤（通常是 display_name 或 source_name） */
  searchField?: string;
  /** 点"详情"回调：打开 ReviewDrawer */
  onSelect: (id: number) => void;
}

type FilterKey = 'all' | string;

/** 已评分按分数降序；needs_manual/failed 沉底。 */
function compareRows(a: ReviewRow, b: ReviewRow): number {
  const aBad = a.status === 'needs_manual' || a.status === 'failed';
  const bBad = b.status === 'needs_manual' || b.status === 'failed';
  if (aBad !== bBad) return aBad ? 1 : -1;
  return (b.ai_score ?? -1) - (a.ai_score ?? -1);
}

export default function ReviewTable<T extends ReviewRow = ReviewRow>({
  rows,
  columns,
  verdictLabels,
  searchField = 'source_name',
  onSelect,
}: Props<T>) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const verdictKeys = Object.keys(verdictLabels);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === 'needs_review') {
          return r.status === 'needs_manual' || r.status === 'failed';
        }
        if (filter !== 'all' && r.ai_verdict !== filter) return false;
        if (q) {
          const hay = String(r[searchField] ?? r.source_name).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(compareRows);
  }, [rows, filter, search, searchField]);

  const filterButtons: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `全部 (${rows.length})` },
    ...verdictKeys.map((k) => ({
      key: k,
      label: `${verdictLabels[k].label} (${rows.filter((r) => r.ai_verdict === k).length})`,
    })),
    {
      key: 'needs_review',
      label: `需人工/失败 (${rows.filter((r) => r.status === 'needs_manual' || r.status === 'failed').length})`,
    },
  ];

  const badgeOf = (r: ReviewRow): { label: string; className: string } => {
    if (r.status === 'needs_manual') return { label: '需人工', className: 'bg-orange-100 text-orange-800' };
    if (r.status === 'failed') return { label: '失败', className: 'bg-gray-200 text-gray-600' };
    if (r.ai_verdict && verdictLabels[r.ai_verdict]) return verdictLabels[r.ai_verdict];
    return { label: r.status, className: 'bg-gray-100 text-gray-600' };
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {filterButtons.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setFilter(b.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === b.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {b.label}
          </button>
        ))}
        <input
          type="search"
          placeholder="搜索…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2 font-medium text-gray-600 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.title}
                </th>
              ))}
              <th className="px-4 py-2 text-left font-medium text-gray-600">AI 档位</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">人工档位</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {visible.map((r) => {
              const badge = badgeOf(r);
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2 text-gray-600 ${col.align === 'right' ? 'text-right font-mono' : ''}`}
                    >
                      {col.render ? col.render(r) : String(r[col.key] ?? '—')}
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {r.human_verdict ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          verdictLabels[r.human_verdict]?.className ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {verdictLabels[r.human_verdict]?.label ?? r.human_verdict}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">未审核</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button type="button" onClick={() => onSelect(r.id)} className="text-sm text-blue-600 hover:underline">
                      详情
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="px-4 py-8 text-center text-gray-400">
                  没有匹配的记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
