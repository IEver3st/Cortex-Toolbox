import { cortexReasoningModeSchema } from '@cortex/ai/contracts';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { assertAiProviderConfigured, createProviderRequest } from './ai-policy';
import { authenticateRequest, HttpError } from './auth';
import {
  applyStripeEvent,
  createCheckout,
  createPortal,
  reconcileStripeAccountIfStale,
  verifyStripeSignature,
  type StripeEvent,
} from './billing';
import {
  authorizeRunCall,
  completeRun,
  getAccountRow,
  getAccountSummary,
  getCommercialMetrics,
  markRunAppliedChange,
  parseProviderUsage,
  recordProviderUsage,
} from './db';
import type { AuthIdentity, Env } from './env';

interface Variables {
  identity: AuthIdentity;
}

interface AppBindings {
  Bindings: Env;
  Variables: Variables;
}
const app = new Hono<AppBindings>();
const MAX_REQUEST_BYTES = 2_000_000;
const MAX_TOOL_STEPS = 12;

const toolCallSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal('function'),
  function: z.object({ name: z.string().min(1).max(100), arguments: z.string().max(160_000) }),
});
const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.enum(['system', 'user']), content: z.string().max(1_600_000) }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().max(1_600_000),
    tool_calls: z.array(toolCallSchema).max(20).optional(),
  }),
  z.object({
    role: z.literal('tool'),
    content: z.string().max(1_600_000),
    tool_call_id: z.string().max(200),
    name: z.string().max(100),
  }),
]);
export const chatSchema = z
  .object({
    runId: z.uuid(),
    step: z.number().int().min(0).max(MAX_TOOL_STEPS),
    final: z.boolean(),
    stream: z.boolean(),
    reasoningMode: cortexReasoningModeSchema,
    messages: z.array(messageSchema).min(1).max(80),
    tools: z.array(z.unknown()).max(20).optional(),
  })
  .strict();
export const checkoutSchema = z
  .object({ plan: z.enum(['creator', 'pro']), interval: z.enum(['month', 'year']) })
  .strict();
const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400);
  if (error instanceof z.ZodError) return c.json({ error: 'The request was not valid.' }, 400);
  console.error('Cortex Cloud request failed', error instanceof Error ? error.message : 'unknown');
  return c.json({ error: 'Cortex Cloud could not complete the request.' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

app.use('/v1/*', async (c, next) => {
  if (c.req.path === '/v1/stripe/webhook' || c.req.path === '/v1/webhooks/stripe') return next();
  c.set('identity', await authenticateRequest(c.req.raw, c.env));
  return next();
});

app.get('/v1/me', async (c) => {
  const userId = c.get('identity').userId;
  const account = await getAccountRow(c.env, userId);
  try {
    await reconcileStripeAccountIfStale(c.env, account);
  } catch {
    console.error('Cortex Cloud Stripe reconciliation deferred.');
  }
  const summary = await getAccountSummary(c.env, userId);
  return c.json({ plan: summary.plan, billing: summary.billing, ai: summary.ai });
});

app.get('/v1/ai/usage', async (c) => {
  const account = await getAccountSummary(c.env, c.get('identity').userId);
  return c.json(account.ai.usage);
});

app.get('/v1/admin/ai-metrics', async (c) => {
  const allowed = new Set(
    (c.env.CORTEX_ADMIN_WORKOS_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowed.has(c.get('identity').userId))
    throw new HttpError(403, 'Administrative access required.');
  const days = Math.max(1, Math.min(90, Number(c.req.query('days')) || 30));
  return c.json(await getCommercialMetrics(c.env, new Date(Date.now() - days * 86_400_000)));
});

app.post('/v1/ai/chat', async (c) => {
  const contentLength = Number(c.req.header('content-length') ?? 0);
  if (contentLength > MAX_REQUEST_BYTES)
    throw new HttpError(413, 'Cortex AI context is too large.');
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    throw new HttpError(413, 'Cortex AI context is too large.');
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'The Cortex AI request was not valid JSON.');
  }
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(400, 'The Cortex AI request did not match the hosted contract.');
  const input = parsed.data;
  if (input.final !== input.stream) {
    throw new HttpError(400, 'Final Cortex responses must use streaming.');
  }
  try {
    assertAiProviderConfigured(c.env.OPENROUTER_API_KEY);
  } catch {
    throw new HttpError(503, 'Cortex Cloud is not configured correctly.');
  }
  const identity = c.get('identity');
  const workingContextTokens = estimateWorkingContextTokens(input.messages);
  const authorization = await authorizeRunCall(c.env, identity.userId, {
    runId: input.runId,
    reasoningMode: input.reasoningMode,
    final: input.final,
    workingContextTokens,
    toolSignature: await latestToolSignature(input.messages),
  });
  let upstream: Response;
  try {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/IEver3st/Cortex-Toolbox',
        'X-Title': 'Cortex Toolbox',
      },
      body: JSON.stringify(
        createProviderRequest({
          reasoningMode: input.reasoningMode,
          stream: input.stream,
          maxTokens: authorization.maxTokens,
          messages: input.messages,
          ...(input.tools ? { tools: input.tools } : {}),
        }),
      ),
    });
  } catch {
    await completeRun(c.env, identity.userId, input.runId, false, 'provider_unavailable');
    throw new HttpError(503, 'Cortex AI is temporarily unavailable.');
  }
  if (!upstream.ok) {
    const text = await upstream.text();
    const usage = parseJsonUsage(text);
    if (usage) await recordProviderUsage(c.env, identity.userId, input.runId, usage);
    await completeRun(c.env, identity.userId, input.runId, false, `provider_${upstream.status}`);
    throw providerFailure(upstream.status);
  }
  if (!input.stream) {
    const text = await upstream.text();
    const usage = parseJsonUsage(text);
    const toolTurns = providerToolCallCount(text);
    if (authorization.toolTurnsUsed + toolTurns > authorization.policy.toolTurns) {
      if (usage) await recordProviderUsage(c.env, identity.userId, input.runId, usage);
      await completeRun(c.env, identity.userId, input.runId, false, 'tool_turn_limit');
      throw new HttpError(429, 'Cortex AI reached the workspace tool-turn limit for this run.');
    }
    if (usage) await recordProviderUsage(c.env, identity.userId, input.runId, usage, toolTurns);
    return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const upstreamBody = upstream.body;
  if (!upstreamBody) {
    await completeRun(c.env, identity.userId, input.runId, false, 'missing_provider_stream');
    throw new HttpError(502, 'The model provider did not return a stream.');
  }
  const [clientStream, usageStream] = upstreamBody.tee();
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const text = await new Response(usageStream).text();
        const usage = parseStreamUsage(text);
        if (usage) await recordProviderUsage(c.env, identity.userId, input.runId, usage);
        await completeRun(c.env, identity.userId, input.runId, true);
      } catch {
        await completeRun(c.env, identity.userId, input.runId, false, 'stream_interrupted');
      }
    })(),
  );
  return new Response(clientStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
});

app.post('/v1/ai/runs/:runId/applied', async (c) => {
  const runId = z.uuid().parse(c.req.param('runId'));
  await markRunAppliedChange(c.env, c.get('identity').userId, runId);
  return c.json({ recorded: true });
});

app.post('/v1/billing/checkout', async (c) => {
  const input = checkoutSchema.parse(await c.req.json());
  return c.json({ url: await createCheckout(c.env, c.get('identity').userId, input) });
});

app.post('/v1/billing/portal', async (c) => {
  const account = await getAccountSummary(c.env, c.get('identity').userId);
  return c.json({ url: await createPortal(c.env, account.stripeCustomerId) });
});

const stripeWebhook = async (c: Context<AppBindings>) => {
  const body = await c.req.text();
  await verifyStripeSignature(
    body,
    c.req.header('stripe-signature') ?? null,
    c.env.STRIPE_WEBHOOK_SECRET,
  );
  let eventBody: unknown;
  try {
    eventBody = JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Invalid Stripe event.');
  }
  const event = stripeEventSchema.safeParse(eventBody);
  if (!event.success) throw new HttpError(400, 'Invalid Stripe event.');
  await applyStripeEvent(c.env, event.data satisfies StripeEvent);
  return c.json({ received: true });
};

app.post('/v1/stripe/webhook', stripeWebhook);
// Temporary compatibility route for existing Stripe CLI/dev configurations.
app.post('/v1/webhooks/stripe', stripeWebhook);

export default app;

export function providerFailure(status: number): HttpError {
  if (status === 401 || status === 403) {
    return new HttpError(503, 'Cortex Cloud is not configured correctly.');
  }
  return new HttpError(503, 'Cortex AI is temporarily unavailable.');
}

function estimateWorkingContextTokens(messages: z.infer<typeof messageSchema>[]): number {
  let characters = 0;
  for (const message of messages) {
    characters += message.content.length;
    if (message.role === 'assistant') {
      for (const toolCall of message.tool_calls ?? []) {
        characters += toolCall.function.name.length + toolCall.function.arguments.length;
      }
    }
  }
  return Math.ceil(characters / 4);
}

async function latestToolSignature(
  messages: z.infer<typeof messageSchema>[],
): Promise<string | null> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant' || !message.tool_calls?.length) continue;
    const stable = message.tool_calls
      .map((call) => `${call.function.name}:${call.function.arguments}`)
      .sort()
      .join('|');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return null;
}

function parseJsonUsage(text: string) {
  try {
    return parseProviderUsage(JSON.parse(text));
  } catch {
    return null;
  }
}

function providerToolCallCount(text: string): number {
  try {
    const payload = JSON.parse(text) as { choices?: { message?: { tool_calls?: unknown[] } }[] };
    return payload.choices?.[0]?.message?.tool_calls?.length ?? 0;
  } catch {
    return 0;
  }
}

function parseStreamUsage(text: string) {
  let latest = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    const usage = parseJsonUsage(data);
    if (usage) latest = usage;
  }
  return latest;
}
