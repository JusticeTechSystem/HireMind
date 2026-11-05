import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import type { z } from 'zod';
import type { AiProvider } from '../ai/ai-provider';
export const parse = <T>(s: z.ZodType<T>, b: unknown): T => { const r = s.safeParse(b); if (!r.success) throw new BadRequestException(r.error.flatten()); return r.data; };
/** Calls the model, validates against the schema, retries once; never returns unvalidated output. */
export async function completeValidated<T>(ai: AiProvider, schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  for (let i = 0; i < 2; i++) { const r = schema.safeParse(await ai.jsonCompletion(system, user)); if (r.success) return r.data; }
  throw new UnprocessableEntityException('AI returned an invalid response');
}
