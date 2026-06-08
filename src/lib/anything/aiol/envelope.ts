import { z } from 'zod';

export const AIOLKindSchema = z.enum([
  'plan','spawn','task','evidence','repair','vault','collapse','log'
]);

export const AIOLMessageSchema = z.object({
  v:          z.literal(1),
  build_id:   z.string().uuid(),
  agent_id:   z.string().uuid().optional(),
  parent_id:  z.string().uuid().nullable().optional(),
  job_id:     z.string().uuid().optional(),
  from:       z.string(),
  to:         z.string(),
  kind:       AIOLKindSchema,
  body:       z.record(z.string(), z.unknown()),
  ts:         z.string().datetime(),
  sig:        z.string().optional(),
});

export type AIOLMessage = z.infer<typeof AIOLMessageSchema>;

export function makeAIOLId(code: string): string {
  return `${code}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
}

export function serializeAIOL(msg: Omit<AIOLMessage,'ts'>): string {
  return JSON.stringify({ ...msg, ts: new Date().toISOString() });
}

export function parseAIOL(raw: string): AIOLMessage {
  return AIOLMessageSchema.parse(JSON.parse(raw));
}
