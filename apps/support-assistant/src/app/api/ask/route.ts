// 检索接口：query → top-k 本地案例，秒级返回（不等 LLM）。
// AI 生成走 /api/answer（带 queryId 复用这里的检索结果）。
import { NextResponse } from 'next/server';
import { retrieve } from '@/rag/retrieve';
import type { RetrievedContext } from '@/rag/generate';
import { loadChunks, retrievalCache, cacheKey } from '@/lib/ask-shared';
import { logger, errInfo } from '@/lib/logger';

export const runtime = 'nodejs';

interface AskBody {
  query?: string;
  topK?: number;
}

export async function POST(req: Request) {
  let query = '';
  try {
    const body = (await req.json()) as AskBody;
    query = (body.query ?? '').trim();
    if (!query) {
      return NextResponse.json({ ok: false, error: 'query 不能为空' }, { status: 400 });
    }
    const topK = Math.min(Math.max(body.topK ?? 5, 1), 10);

    // 只做检索：query → top-k 相关 case（词法检索，秒级，不等 LLM）
    const chunks = loadChunks();
    const scored = retrieve(query, chunks, { topK });
    const contexts: RetrievedContext[] = scored.map((s) => ({
      chunk: s.chunk,
      score: s.score,
    }));

    const queryId = cacheKey(query, topK);
    // LRU 简化：超 100 条删最早
    if (retrievalCache.size >= 100) {
      const first = retrievalCache.keys().next().value;
      if (first) retrievalCache.delete(first);
    }
    retrievalCache.set(queryId, contexts);

    logger.info({ query: query.slice(0, 80), hits: contexts.length, queryId }, 'ask retrieved');

    return NextResponse.json({
      ok: true,
      queryId,
      sources: contexts.map((c) => ({
        docId: c.chunk.docId,
        score: Number(c.score.toFixed(2)),
        snippet:
          c.chunk.text
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'))
            .slice(0, 2)
            .join(' / ')
            .slice(0, 160) || '(empty)',
      })),
    });
  } catch (e) {
    logger.error({ query: query.slice(0, 80), err: errInfo(e) }, 'ask retrieve failed');
    return NextResponse.json(
      { ok: false, error: errInfo(e).message },
      { status: 500 }
    );
  }
}
