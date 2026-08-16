import { z } from "zod";

export const createSessionInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  title: z.string().trim().min(2).max(80),
  sourceText: z.string().trim().min(100).max(60_000),
});

export const submitAttemptInputSchema = z.object({
  clientRequestId: z.string().uuid(),
  userAnswer: z.string().trim().min(2).max(8_000),
  retryAttemptId: z.string().uuid().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptInputSchema>;
