// ============================================================
// 通用批处理 pipeline（四段式 · 第 2 段的骨架，核心复用件）
// 从 resume-screening 的 process.ts 泛化。保留全部已验证机制：
//   - 依赖注入 LLM（setLlm）→ smoke 测试 mock 掉，不调真实 API
//   - needs_manual 通道：解析不出来不中断批次，流转人工
//   - 单条两次重试后落 failed，绝不 throw 拖垮整批
//   - 每条结束必累加 batch 的 done/token（进度轮询与成本统计的数据源）
//   - 闸口1：catch 不再静默——失败时记 item_events + 进程日志（logger），含错误与堆栈
//   - 闸口3：LLM raw 原始响应随每步落 item_events.detail.llm_raw，可溯源
//   - 闸口4：状态迁移每步留痕 item_events，failed/needs_manual 自然显形
// 泛化点：领域逻辑收敛到 DomainHooks 接口，新系统只实现这 3 个函数。
// ============================================================
import { getDb } from '../db';
import type { Usage } from '../llm/schemas';
import { parsePdf } from './pdf';
import { logger, errInfo } from './logger';

/** 新系统需要实现的领域钩子（参考 llm/domain.example.ts 的写法） */
export interface DomainHooks<ExtractT = unknown, ScoreT = unknown> {
  /** 从原始文本抽取结构化数据（第 1 次 LLM 调用，弱模型）。raw 是闸口3 的原始响应 */
  extract(text: string): Promise<{ data: ExtractT; usage: Usage; raw: string }>;
  /** 结合批次上下文给出裁决（第 2 次 LLM 调用，强模型）。raw 同上 */
  score(context: string, extract: ExtractT): Promise<{ data: ScoreT; usage: Usage; raw: string }>;
  /** 从 score 结果取列表页冗余字段（写回 items.ai_verdict / ai_score） */
  summarize(score: ScoreT): { verdict: string; score: number };
}

interface ItemRow {
  id: number;
  batch_id: number;
  source_name: string;
  source_path: string;
  status: string;
}

interface BatchRow {
  id: number;
  context_text: string;
}

/**
 * 闸口4：记录一次状态迁移/处理事件到 item_events 表。
 * 每步处理都留痕，异常状态（failed/needs_manual）由此自然显形，详情页直接可读。
 * detail 里放 llm_raw（闸口3 的落点）、tokens、duration_ms、error 等排障上下文。
 */
function recordEvent(
  itemId: number,
  batchId: number,
  event: string,
  opts: { fromStatus?: string; toStatus?: string; detail?: Record<string, unknown> } = {}
): void {
  getDb()
    .prepare(
      `INSERT INTO item_events(item_id, batch_id, event, from_status, to_status, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      itemId,
      batchId,
      event,
      opts.fromStatus ?? null,
      opts.toStatus ?? null,
      opts.detail ? JSON.stringify(opts.detail) : null
    );
}

async function runPipeline<ExtractT, ScoreT>(
  item: ItemRow,
  contextText: string,
  hooks: DomainHooks<ExtractT, ScoreT>
): Promise<{ inputTokens: number; outputTokens: number }> {
  const db = getDb();
  const iid = item.id;
  const bid = item.batch_id;

  recordEvent(iid, bid, 'parse_start');
  const { text, needsManual } = await parsePdf(item.source_path);
  recordEvent(iid, bid, 'parse_done', { detail: { text_len: text.length } });

  if (needsManual) {
    // 解析失败不是错误，是一条独立通道：人补录后再走人工审核。
    db.prepare(`UPDATE items SET status = 'needs_manual' WHERE id = ?`).run(iid);
    recordEvent(iid, bid, 'needs_manual', {
      fromStatus: item.status,
      toStatus: 'needs_manual',
      detail: { text_len: text.length },
    });
    logger.info({ item_id: iid, batch_id: bid, text_len: text.length }, 'item needs_manual (unparseable source)');
    return { inputTokens: 0, outputTokens: 0 };
  }

  recordEvent(iid, bid, 'extract_start');
  const extractStart = Date.now();
  const { data: extract, usage: extractUsage, raw: extractRaw } = await hooks.extract(text);
  // 闸口3 落点：LLM 原始响应随事件留档，zod 失败/截断时可回溯模型到底说了什么
  recordEvent(iid, bid, 'extract_done', {
    detail: { model: 'extract', duration_ms: Date.now() - extractStart, tokens: extractUsage, llm_raw: extractRaw },
  });
  db.prepare(`UPDATE items SET extract_json = ?, status = 'extracted' WHERE id = ?`).run(
    JSON.stringify(extract),
    iid
  );

  recordEvent(iid, bid, 'score_start');
  const scoreStart = Date.now();
  const { data: score, usage: scoreUsage, raw: scoreRaw } = await hooks.score(contextText, extract);
  recordEvent(iid, bid, 'score_done', {
    detail: { model: 'score', duration_ms: Date.now() - scoreStart, tokens: scoreUsage, llm_raw: scoreRaw },
  });
  const summary = hooks.summarize(score);
  db.prepare(
    `UPDATE items SET score_json = ?, ai_verdict = ?, ai_score = ?, status = 'scored' WHERE id = ?`
  ).run(JSON.stringify(score), summary.verdict, summary.score, iid);

  return {
    inputTokens: extractUsage.input_tokens + scoreUsage.input_tokens,
    outputTokens: extractUsage.output_tokens + scoreUsage.output_tokens,
  };
}

/**
 * 处理一条记录：读库 → 解析 → 抽取 → 评分 → 写回。
 * 失败策略：整条 pipeline 重试一次，仍败则 status='failed'。
 * 闸口1：第二次失败的 catch 是收口——记 item_events + 进程日志，绝不静默。
 * 永不抛异常；总是推进 batch.done 并累加 token 用量。
 */
export async function processItem<ExtractT, ScoreT>(
  itemId: number,
  hooks: DomainHooks<ExtractT, ScoreT>
): Promise<void> {
  const db = getDb();
  const item = db.prepare(`SELECT * FROM items WHERE id = ?`).get(itemId) as ItemRow | undefined;
  if (!item) {
    throw new Error(`Item ${itemId} not found`);
  }
  const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(item.batch_id) as
    | BatchRow
    | undefined;
  if (!batch) {
    throw new Error(`Batch ${item.batch_id} not found for item ${itemId}`);
  }

  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const usage = await runPipeline(item, batch.context_text, hooks);
    inputTokens = usage.inputTokens;
    outputTokens = usage.outputTokens;
  } catch (firstErr) {
    // 第一次失败：记录并重试一次
    logger.warn(
      { item_id: itemId, batch_id: item.batch_id, err: errInfo(firstErr), attempt: 1 },
      'pipeline failed, retrying once'
    );
    try {
      const usage = await runPipeline(item, batch.context_text, hooks);
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
    } catch (secondErr) {
      // 第二次失败：闸口1 收口，绝不静默——记 DB 事件 + 进程日志
      const info = errInfo(secondErr);
      db.prepare(`UPDATE items SET status = 'failed' WHERE id = ?`).run(itemId);
      recordEvent(itemId, item.batch_id, 'failed', {
        fromStatus: item.status,
        toStatus: 'failed',
        detail: { error: info.message, stack: info.stack, retried: true },
      });
      logger.error(
        { item_id: itemId, batch_id: item.batch_id, err: info, retried: true },
        'pipeline failed after retry, marked failed'
      );
    }
  }

  db.prepare(
    `UPDATE batches SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, done = done + 1 WHERE id = ?`
  ).run(inputTokens, outputTokens, item.batch_id);
}

// 批触发入口的模式（放在 API route 里）：
//   const limit = pLimit(5);  // 并发 5：LLM 限流与速度的平衡点
//   void Promise.all(pending.map((it) => limit(() => processItem(it.id, hooks))))
//     .then(() => db.prepare(`UPDATE batches SET status='done', finished_at=datetime('now') WHERE id=?`).run(batchId));
//   return NextResponse.json({ started: true });  // 立即返回，前端 2s 轮询进度
