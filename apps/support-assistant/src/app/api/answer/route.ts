// AI 生成接口：queryId → 取 /api/ask 已检索的 contexts → LLM 生成答案。
// 支持多轮对话：sessionId 关联对话历史；追问时把历史拼进 query（generate 是语料无关 core，不改它）。
// reasoning 模型生成 ~30-60s，前端异步等待（聊天面板显示"分析中"），不阻塞左侧检索结果。
import { NextResponse } from 'next/server';
import { generate } from '@/rag/generate';
import type { RetrievedContext } from '@/rag/generate';
import { emailSecurityConfig } from '@/llm/domain';
import { retrievalCache, llmFn } from '@/lib/ask-shared';
import { logger, errInfo } from '@/lib/logger';

export const runtime = 'nodejs';

interface AnswerBody {
  queryId?: string;
  query?: string;
  sessionId?: string;
}

// ---------- 对话会话暂存（sessionId → 历史 + contexts） ----------
// 挂 globalThis：dev 模式跨 route 模块实例共享。会话级，重启失效。
interface SessionTurn {
  role: 'user' | 'assistant';
  text: string;
}
interface Session {
  contexts: RetrievedContext[];
  history: SessionTurn[];
}
const g = globalThis as unknown as { __chatSessions?: Map<string, Session> };
if (!g.__chatSessions) g.__chatSessions = new Map();
const sessions = g.__chatSessions;

export async function POST(req: Request) {
  let queryId = '';
  let query = '';
  let sessionId = '';
  try {
    const body = (await req.json()) as AnswerBody;
    queryId = (body.queryId ?? '').trim();
    query = (body.query ?? '').trim();
    sessionId = (body.sessionId ?? '').trim();
    if (!query) {
      return NextResponse.json({ ok: false, error: 'query 不能为空' }, { status: 400 });
    }

    let contexts: RetrievedContext[];
    let history: SessionTurn[] = [];

    if (sessionId && sessions.has(sessionId)) {
      // 追问：复用会话的 contexts + 历史，不重新检索
      const s = sessions.get(sessionId)!;
      contexts = s.contexts;
      history = s.history;
    } else {
      // 首次提问：从 queryId 取检索结果，开新会话
      if (!queryId) {
        return NextResponse.json({ ok: false, error: 'queryId 不能为空' }, { status: 400 });
      }
      const c = retrievalCache.get(queryId);
      if (!c) {
        return NextResponse.json(
          { ok: false, error: '检索结果不存在或已过期，请重新提交问题' },
          { status: 404 }
        );
      }
      contexts = c;
      sessionId = queryId; // 用 queryId 当 sessionId
      sessions.set(sessionId, { contexts, history: [] });
      // 会话容量有界
      if (sessions.size > 100) {
        const first = sessions.keys().next().value;
        if (first) sessions.delete(first);
      }
    }

    // 多轮对话：把历史拼进 query，generate() 照常工作（core 不动）
    const queryWithHistory =
      history.length > 0
        ? `Previous conversation:\n` +
          history.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`).join('\n') +
          `\n\nFollow-up question: ${query}`
        : query;

    const { data, usage, raw } = await generate(queryWithHistory, contexts, emailSecurityConfig, llmFn);

    // 追加到会话历史
    const s = sessions.get(sessionId)!;
    s.history.push({ role: 'user', text: query });
    s.history.push({ role: 'assistant', text: data.answer });

    logger.info(
      { sessionId, query: query.slice(0, 80), turns: s.history.length, tokens: usage },
      'answer generated'
    );

    return NextResponse.json({
      ok: true,
      sessionId,
      answer: data,
      usage,
      raw,
    });
  } catch (e) {
    logger.error({ sessionId, query: query.slice(0, 80), err: errInfo(e) }, 'answer failed');
    return NextResponse.json(
      { ok: false, error: errInfo(e).message },
      { status: 500 }
    );
  }
}
