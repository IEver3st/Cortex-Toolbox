import { z } from 'zod';

export const errorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.string().optional(),
    path: z.string().optional(),
    recovery: z.string().optional(),
  })
  .strict();

export type CortexError = z.infer<typeof errorSchema>;
export type Result<T> = { ok: true; data: T } | { ok: false; error: CortexError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = (error: CortexError): Result<never> => ({ ok: false, error });

export function fromUnknown(error: unknown, fallback: string): CortexError {
  if (error instanceof Error) {
    return { code: fallback, message: error.message, details: error.stack };
  }
  return { code: fallback, message: 'An unknown error occurred.' };
}
