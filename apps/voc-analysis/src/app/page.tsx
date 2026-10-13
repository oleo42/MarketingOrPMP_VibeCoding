import { readFileSync } from 'fs';
import path from 'path';
import Board from '@/components/Board';
import IngestCard from '@/components/IngestCard';
import TrendCard from '@/components/TrendCard';

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

export type TrendPoint = { month: string; pos: number; neg: number; volume: number; net: number | null };
export type TrendSeries = { cat: string; points: TrendPoint[] };
export type TrendData = {
  generated: string;
  simulated: boolean;
  note: string;
  months: string[];
  categories: string[];
  series: TrendSeries[];
};

function loadBoard(): BoardData {
  const p = path.join(process.cwd(), 'pipeline', 'data', 'sp_board_ui.json');
  return JSON.parse(readFileSync(p, 'utf-8')) as BoardData;
}

function loadTrend(): TrendData | null {
  const p = path.join(process.cwd(), 'pipeline', 'data', 'trend_ui.json');
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as TrendData;
  } catch {
    return null; // trend_ui.json 未生成前容错（老环境）
  }
}

// 上传新数据会改写 sp_board_ui.json / trend_ui.json，必须每次请求重读——禁用静态预渲染
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  const data = loadBoard();
  const trend = loadTrend();
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">用户之声 · 卖点共鸣 / 吐槽双面榜</h1>
          <p className="mt-1 text-sm text-gray-600">
            数据源：{data.source} · 方法：方面级关键词匹配（声量×情感交叉）· 好评{' '}
            <span className="font-semibold text-emerald-600">{data.n_positive}</span> 条 / 差评{' '}
            <span className="font-semibold text-red-500">{data.n_negative}</span> 条 · 生成于 {data.generated}
          </p>
        </div>
        <a href="/api/report"
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          title="下载 Markdown 报告（核心结论+双面榜+品类矩阵+趋势+方法），GTM 标准交付物">
          ⬇ 导出报告
        </a>
      </header>
      <div className="mb-5">
        <IngestCard />
      </div>
      {trend && (
        <div className="mb-5">
          <TrendCard data={trend} />
        </div>
      )}
      <Board data={data} />
    </main>
  );
}
