import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import type { z } from 'zod';
import type { AiProvider } from '../ai/ai-provider';
export const parse = <S extends z.ZodTypeAny>(s: S, b: unknown): z.output<S> => { const r = s.safeParse(b); if (!r.success) throw new BadRequestException(r.error.flatten()); return r.data; };
/** Calls the model, validates against the schema, retries once; never returns unvalidated output. */
export async function completeValidated<S extends z.ZodTypeAny>(ai: AiProvider, schema: S, system: string, user: string): Promise<z.output<S>> {
  for (let i = 0; i < 2; i++) { const r = schema.safeParse(await ai.jsonCompletion(system, user)); if (r.success) return r.data; }
  throw new UnprocessableEntityException('AI returned an invalid response');
}
