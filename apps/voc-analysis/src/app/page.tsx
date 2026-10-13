import { readFileSync } from 'fs';
import path from 'path';
import Board from '@/components/Board';
import IngestCard from '@/components/IngestCard';

export type CategoryStat = { pos: number; neg: number; rate: number; net: number };
export type Cluster = {
  id: string;
  name: string;
  posVolume: number;
  negVolume: number;
  posRate: number;
  negRate: number;
  netResonance: number;
  posExemplars: string[];
  negExemplars: string[];
  reviewCount: number; // = posVolume (兼容)
  hitRate: number;
  exemplars: string[]; // = posExemplars (兼容)
  confidence: number;
  byCategory: Record<string, CategoryStat>;
  needsReview: boolean;
};
export type BoardData = {
  generated: string;
  method: string;
  source: string;
  sentiment: string;
  n_positive: number;
  n_negative: number;
  categories: string[];
  pos_hits_per_doc_dist: Record<string, number>;
  neg_hits_per_doc_dist: Record<string, number>;
  clusters: Cluster[];
};

function loadBoard(): BoardData {
  const p = path.join(process.cwd(), 'pipeline', 'data', 'sp_board_ui.json');
  return JSON.parse(readFileSync(p, 'utf-8')) as BoardData;
}

// 上传新数据会改写 sp_board_ui.json，必须每次请求重读——禁用静态预渲染
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  const data = loadBoard();
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">用户之声 · 卖点共鸣 / 吐槽双面榜</h1>
        <p className="mt-1 text-sm text-gray-600">
          数据源：{data.source} · 方法：方面级关键词匹配（声量×情感交叉）· 好评{' '}
          <span className="font-semibold text-emerald-600">{data.n_positive}</span> 条 / 差评{' '}
          <span className="font-semibold text-red-500">{data.n_negative}</span> 条 · 生成于 {data.generated}
        </p>
      </header>
      <div className="mb-5">
        <IngestCard />
      </div>
      <Board data={data} />
    </main>
  );
}
