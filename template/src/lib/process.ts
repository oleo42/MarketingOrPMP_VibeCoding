// ============================================================
// 通用批处理 pipeline（四段式 · 第 2 段的骨架，核心复用件）
// 从 resume-screening 的 process.ts 泛化。保留全部已验证机制：
//   - 依赖注入 LLM（setLlm）→ smoke 测试 mock 掉，不调真实 API
//   - needs_manual 通道：解析不出来不中断批次，流转人工
//   - 单条两次重试后落 failed，绝不 throw 拖垮整批
//   - 每条结束必累加 batch 的 done/token（进度轮询与成本统计的数据源）
// 泛化点：领域逻辑收敛到 DomainHooks 接口，新系统只实现这 4 个函数。
// ============================================================
import { getDb } from '../db';
import type { Usage } from '../llm/schemas';
import { parsePdf } from './pdf';

/** 新系统需要实现的领域钩子（参考 llm/domain.example.ts 的写法） */
export interface DomainHooks<ExtractT = unknown, ScoreT = unknown> {
  /** 从原始文本抽取结构化数据（第 1 次 LLM 调用，弱模型） */
  extract(text: string): Promise<{ data: ExtractT; usage: Usage }>;
  /** 结合批次上下文给出裁决（第 2 次 LLM 调用，强模型） */
  score(context: string, extract: ExtractT): Promise<{ data: ScoreT; usage: Usage }>;
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

async function runPipeline<ExtractT, ScoreT>(
  item: ItemRow,
  contextText: string,
  hooks: DomainHooks<ExtractT, ScoreT>
): Promise<{ inputTokens: number; outputTokens: number }> {
  const db = getDb();
  const { text, needsManual } = await parsePdf(item.source_path);

  if (needsManual) {
    // 解析失败不是错误，是一条独立通道：人补录后再走人工审核。
    db.prepare(`UPDATE items SET status = 'needs_manual' WHERE id = ?`).run(item.id);
    return { inputTokens: 0, outputTokens: 0 };
  }

  const { data: extract, usage: extractUsage } = await hooks.extract(text);
  db.prepare(`UPDATE items SET extract_json = ?, status = 'extracted' WHERE id = ?`).run(
    JSON.stringify(extract),
    item.id
  );

  const { data: score, usage: scoreUsage } = await hooks.score(contextText, extract);
  const summary = hooks.summarize(score);
  db.prepare(
    `UPDATE items SET score_json = ?, ai_verdict = ?, ai_score = ?, status = 'scored' WHERE id = ?`
  ).run(JSON.stringify(score), summary.verdict, summary.score, item.id);

  return {
    inputTokens: extractUsage.input_tokens + scoreUsage.input_tokens,
    outputTokens: extractUsage.output_tokens + scoreUsage.output_tokens,
  };
}

/**
 * 处理一条记录：读库 → 解析 → 抽取 → 评分 → 写回。
 * 失败策略：整条 pipeline 重试一次，仍败则 status='failed'。
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
  } catch {
    try {
      const usage = await runPipeline(item, batch.context_text, hooks);
      inputTokens = usage.inputTokens;
      outputTokens = usage.outputTokens;
    } catch {
      db.prepare(`UPDATE items SET status = 'failed' WHERE id = ?`).run(itemId);
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
