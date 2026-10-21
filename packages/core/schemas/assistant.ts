// POST /v1/assistant/chat (#8 Planning Assistant). The LLM only extracts parameters and talks;
// every number in `reply` comes from a tool result such as `estimate`. When extraction fails the
// app falls back to the planner form.

import { z } from 'zod';
import { modelVersionSchema } from './common';
import { estimateRequestSchema, estimateResponseSchema } from './estimate';

export const CHAT_LANGUAGES = ['en', 'ur', 'roman_ur', 'mixed'] as const;
export type ChatLanguage = (typeof CHAT_LANGUAGES)[number];

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
  /** Plan parameters understood so far; the planner form opens pre-filled with these. */
  extracted: estimateRequestSchema.partial(),
  /** Parameters still needed before the assistant can estimate. */
  missing: z.array(z.string()),
  estimate: estimateResponseSchema.nullish(),
  fallback_to_form: z.boolean(),
  model_version: modelVersionSchema,
});
export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>;
