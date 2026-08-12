/** Secret bindings are created with `wrangler secret put`, so Wrangler cannot
 * infer them from the public config used to generate CloudflareBindings. */
interface WorkerSecretBindings {
  OPENROUTER_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export type Env = CloudflareBindings & WorkerSecretBindings;

export interface AuthIdentity {
  userId: string;
  sessionId: string;
}
