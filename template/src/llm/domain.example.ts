// ============================================================
// 领域层示例（仅供参考，复制时改名为 domain.ts 并整体重写）
// 新系统第 3 步"写领域 prompt"就是写这个文件：
// 两个 system prompt + 两个 zod schema，其余全部复用骨架。
// 下面以"会议→行动项抽取"为例演示写法（非简历业务）。
// ============================================================
import { z } from 'zod';
import { runLlmTask } from './client';
import type { Usage } from './schemas';

// ---------- 第 1 次调用：抽取（弱模型） ----------
const MeetingExtractSchema = z.object({
  display_name: z.string(), // 会议标题
  fields: z.object({
    action_items: z.array(
      z.object({
        owner: z.string(),
        task: z.string(),
        deadline: z.string().nullable(),
      })
    ),
    decisions: z.array(z.string()),
  }),
  raw_summary: z.string().max(500),
});
type MeetingExtract = z.infer<typeof MeetingExtractSchema>;

// 领域 prompt 三要素：角色、输出契约（含形状与禁令）、字段语义。
// "output ONLY a JSON object" 这句必须保留，是 parseJson 能工作的前提。
const EXTRACT_SYSTEM = `You are a meeting-minutes parser. Extract structured action items and decisions from the transcript and output ONLY a JSON object (no markdown, no commentary) matching this shape:
{"display_name": string, "fields": {"action_items": [{"owner": string, "task": string, "deadline": string|null}], "decisions": string[]}, "raw_summary": string (<=200 chars)}`;

export function extractMeeting(transcript: string): Promise<{ data: MeetingExtract; usage: Usage }> {
  return runLlmTask({
    tier: 'extract',
    system: EXTRACT_SYSTEM,
    user: transcript,
    schema: MeetingExtractSchema,
  });
}

// ---------- 第 2 次调用：评分/裁决（强模型） ----------
const TriageScoreSchema = z.object({
  verdict: z.enum(['recommend', 'hold', 'reject']),
  score: z.number().min(0).max(100),
  reason: z.string().max(300),
  risks: z.array(z.string()),
});
type TriageScore = z.infer<typeof TriageScoreSchema>;

const SCORE_SYSTEM = `You are a program manager. Given the project context and a structured meeting extract, judge whether each action item is ready to enter the task board, and output ONLY a JSON object (no markdown, no commentary) matching this shape:
{"verdict": "recommend"|"hold"|"reject", "score": number 0-100, "reason": string (<=300 chars), "risks": string[]}`;

export function triageMeeting(
  context: string,
  extract: MeetingExtract
): Promise<{ data: TriageScore; usage: Usage }> {
  return runLlmTask({
    tier: 'score',
    system: SCORE_SYSTEM,
    user: `Context:\n${context}\n\nExtract:\n${JSON.stringify(extract, null, 2)}`,
    schema: TriageScoreSchema,
  });
}
