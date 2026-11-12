// POST /v1/assistant/chat (#8 Planning Assistant). It answers what the host asks: typical prices
// (#2), vendor suggestions (#3), a check on a quote (#5), advice, or a budget split (#1) only when
// asked for one. The LLM extracts parameters and writes advice without figures; every number in
// `reply` comes from a tool result. When extraction fails the app falls back to the planner form.

import { z } from 'zod';
import { CATEGORIES } from '../enums';
import { modelVersionSchema } from './common';
import { estimateRequestSchema, estimateResponseSchema } from './estimate';
import { matchSchema } from './recommend';

export const CHAT_LANGUAGES = ['en', 'ur', 'roman_ur', 'mixed'] as const;
export type ChatLanguage = (typeof CHAT_LANGUAGES)[number];

/** What the host asked for, read from their words; only `budget_split` runs the budget allocator. */
export const ASSISTANT_INTENTS = ['budget_split', 'quote_check', 'vendors', 'prices', 'advice', 'greeting'] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

/** #3's best matches for one service, as the assistant suggests them (never sponsored listings). */
export const assistantRecommendationsSchema = z.object({
  category: z.enum(CATEGORIES),
  matches: z.array(matchSchema),
});
export type AssistantRecommendations = z.infer<typeof assistantRecommendationsSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const assistantChatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(40),
});
export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;

export const assistantChatResponseSchema = z.object({
  reply: z.string(),
  language: z.enum(CHAT_LANGUAGES),
  intent: z.enum(ASSISTANT_INTENTS),
  /** Plan parameters understood so far; the planner form opens pre-filled with these. */
  extracted: estimateRequestSchema.partial(),
  /** Details still needed to answer this question (plan fields, or `category` / `quote`). */
  missing: z.array(z.string()),
  /** Only when the host asked for a budget split. */
  estimate: estimateResponseSchema.nullish(),
  /** Only when the host asked for vendors. */
  recommendations: assistantRecommendationsSchema.nullish(),
  fallback_to_form: z.boolean(),
  model_version: modelVersionSchema,
});
export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>;
