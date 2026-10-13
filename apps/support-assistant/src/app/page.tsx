'use client';

import { useState, useRef, useEffect } from 'react';
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator,
} from '@chatscope/chat-ui-kit-react';

interface Source {
  docId: string;
  score: number;
  snippet: string;
}
interface Answer {
  answer: string;
  cited_case_ids: string[];
  confidence: number;
}
interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'status';
  text: string;
  answer?: Answer;
}

const EXAMPLES = [
  '合法邮件被隔离，DKIM 校验 body hash did not verify',
  '邮件被 451 4.7.500 server busy 节流',
  'autoforward 的邮件收到 550 5.7.509 DMARC 失败的 NDR',
  '600 多封邮件因为一个 html 附件被隔离',
];

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export default function Home() {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || sourcesLoading || aiLoading) return;
    setQuery('');
    setMessages((m) => [...m, { id: nextId(), role: 'user', text: trimmed }]);
    setAiLoading(true);

    try {
      let currentSessionId = sessionId;

      if (!currentSessionId) {
        // 首次提问：先检索，秒级返回本地结果
        setSourcesLoading(true);
        setSources([]);
        const r1 = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, topK: 5 }),
        });
        const j1 = await r1.json();
        setSourcesLoading(false);
        if (!j1.ok) {
          setMessages((m) => [...m, { id: nextId(), role: 'status', text: `检索失败：${j1.error || r1.status}` }]);
          setAiLoading(false);
          return;
        }
        setSources(j1.sources || []);
        currentSessionId = j1.queryId;
        setSessionId(currentSessionId);
        setMessages((m) => [
          ...m,
          { id: nextId(), role: 'status', text: `已检索到 ${j1.sources?.length ?? 0} 份相关案例，AI 分析中…` },
        ]);

        // 首次 AI 生成
        const r2 = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queryId: j1.queryId, query: trimmed }),
        });
        const j2 = await r2.json();
        if (j2.ok) {
          setMessages((m) => [...m, { id: nextId(), role: 'assistant', text: j2.answer.answer, answer: j2.answer }]);
        } else {
          setMessages((m) => [...m, { id: nextId(), role: 'status', text: `AI 分析失败：${j2.error || r2.status}` }]);
        }
      } else {
        // 追问：带 sessionId，不重新检索
        const r = await fetch('/api/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: currentSessionId, query: trimmed }),
        });
        const j = await r.json();
        if (j.ok) {
          setMessages((m) => [...m, { id: nextId(), role: 'assistant', text: j.answer.answer, answer: j.answer }]);
        } else {
          setMessages((m) => [...m, { id: nextId(), role: 'status', text: `AI 分析失败：${j.error || r.status}` }]);
        }
      }
    } catch (e) {
      setMessages((m) => [...m, { id: nextId(), role: 'status', text: `网络错误：${(e as Error).message}` }]);
    } finally {
      setAiLoading(false);
      setSourcesLoading(false);
    }
  }

  function resetConversation() {
    setSessionId(null);
    setMessages([]);
    setSources([]);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">邮件安全售后助理</h1>
          <p className="mt-1 text-sm text-gray-500">
            输入排障问题 → 左侧即时检索历史案例，右侧 AI 分析（可追问）
          </p>
        </div>
        {sessionId && (
          <button
            onClick={resetConversation}
            className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600"
          >
            新对话
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左列：输入 + 即时本地检索结果 */}
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(query);
                }
              }}
              placeholder={sessionId ? '继续追问…' : '描述遇到的邮件安全问题…'}
              rows={3}
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">Enter 提交，Shift+Enter 换行</span>
              <button
                onClick={() => ask(query)}
                disabled={sourcesLoading || aiLoading || !query.trim()}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sessionId ? '追问' : '获取建议'}
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-700">试试这些：</h2>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask(ex)}
                  className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:border-blue-400 hover:text-blue-600"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* 即时本地检索结果 */}
          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-700">
              本地检索结果 {sourcesLoading && <span className="text-gray-400">检索中…</span>}
              {!sourcesLoading && sources.length > 0 && <span className="text-gray-400">（{sources.length} 份）</span>}
            </h2>
            {sources.length === 0 && !sourcesLoading && (
              <p className="text-xs text-gray-400">提交问题后，相关历史案例会立即显示在这里。</p>
            )}
            <ul className="space-y-2">
              {sources.map((s) => (
                <li key={s.docId} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">{s.docId}</span>
                    <span className="text-xs text-gray-400">匹配分 {s.score}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">{s.snippet}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 右列：chatscope 聊天面板（现成组件，支持多轮对话） */}
        <section style={{ height: '560px' }}>
          <MainContainer>
            <ChatContainer>
              <MessageList
                typingIndicator={
                  aiLoading ? <TypingIndicator content="AI 分析中（reasoning 模型约 30-60 秒）" /> : undefined
                }
              >
                {messages.length === 0 && (
                  <div className="py-8 text-center text-xs text-gray-400">
                    提交问题后，AI 分析建议会出现在这里。可继续追问。
                  </div>
                )}
                {messages.map((m) => {
                  if (m.role === 'status') {
                    return (
                      <div key={m.id} className="py-1 text-center text-xs italic text-gray-400">
                        {m.text}
                      </div>
                    );
                  }
                  const text =
                    m.role === 'assistant' && m.answer
                      ? `【置信度 ${Math.round(m.answer.confidence * 100)}% · 引用 ${m.answer.cited_case_ids.map((id) => `[${id}]`).join('')}】\n\n${m.text}`
                      : m.text;
                  return (
                    <Message
                      key={m.id}
                      model={{
                        message: text,
                        sentTime: '',
                        sender: m.role === 'user' ? '你' : 'AI',
                        direction: m.role === 'user' ? 'outgoing' : 'incoming',
                        position: 'single',
                      }}
                    />
                  );
                })}
              </MessageList>
              <MessageInput
                placeholder={sessionId ? '追问 AI…' : '先在左侧提交问题，或直接输入'}
                onSend={(text) => ask(text)}
                disabled={sourcesLoading || aiLoading}
                attachButton={false}
              />
            </ChatContainer>
          </MainContainer>
        </section>
      </div>
    </main>
  );
}
