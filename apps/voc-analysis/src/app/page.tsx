import { readFileSync } from 'fs';
import path from 'path';
import Board from '@/components/Board';

export type CategoryStat = { volume: number; rate: number };
export type Cluster = {
  id: string;
  name: string;
  confidence: number;
  reviewCount: number;
  hitRate: number;
  exemplars: string[];
  byCategory: Record<string, CategoryStat>;
  needsReview: boolean;
};
export type BoardData = {
  generated: string;
  method: string;
  source: string;
  sentiment: string;
  n_positive: number;
  categories: string[];
  hits_per_doc_dist: Record<string, number>;
  clusters: Cluster[];
};

function loadBoard(): BoardData {
  const p = path.join(process.cwd(), 'pipeline', 'data', 'sp_board_ui.json');
  return JSON.parse(readFileSync(p, 'utf-8')) as BoardData;
}

export default function Page() {
  const data = loadBoard();
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">用户之声 · 卖点共鸣榜</h1>
        <p className="mt-1 text-sm text-gray-600">
          数据源：{data.source} · 方法：{data.method} · 正向评价{' '}
          <span className="font-semibold text-gray-900">{data.n_positive}</span> 条 · 生成于 {data.generated}
        </p>
      </header>
      <Board data={data} />
    </main>
  );
}
