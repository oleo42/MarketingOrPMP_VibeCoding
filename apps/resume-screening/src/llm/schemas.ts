import { z } from 'zod';

export const ExtractSchema = z.object({
  name: z.string(),
  years_experience: z.number(),
  skills: z.array(z.string()),
  highlights: z.array(z.string()),
  raw_summary: z.string().max(500),
});
export type ExtractResult = z.infer<typeof ExtractSchema>;

export const ScoreSchema = z.object({
  verdict: z.enum(['recommend', 'hold', 'reject']),
  score: z.number().min(0).max(100),
  reason: z.string().max(300),
  risks: z.array(z.string()),
});
export type ScoreResult = z.infer<typeof ScoreSchema>;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}
