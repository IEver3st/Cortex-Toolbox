import { Hono } from 'hono';
import { z } from 'zod';
import { authenticateRequest, HttpError } from './auth';
import {
  applyStripeEvent,
  createCheckout,
  createPortal,
  verifyStripeSignature,
  type StripeEvent,
} from './billing';
import { acquireRun, getAccountSummary, recordRunRequest, releaseRun, reserveRunUsage } from './db';
import type { AuthIdentity, Env } from './env';
import { curatedModels, isCuratedModel } from './models';

interface Variables {
  identity: AuthIdentity;
}
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const MAX_REQUEST_BYTES = 220_000;
const MAX_TOOL_STEPS = 10;

const toolCallSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal('function'),
  function: z.object({ name: z.string().min(1).max(100), arguments: z.string().max(100_000) }),
});
const messageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.enum(['system', 'user']), content: z.string().max(160_000) }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().max(160_000),
    tool_calls: z.array(toolCallSchema).max(20).optional(),
  }),
  z.object({
    role: z.literal('tool'),
    content: z.string().max(160_000),
    tool_call_id: z.string().max(200),
    name: z.string().max(100),
  }),
]);
const chatSchema = z.object({
  runId: z.uuid(),
  step: z.number().int().min(0).max(MAX_TOOL_STEPS),
  final: z.boolean(),
  stream: z.boolean(),
  model: z.string().min(1).max(200),
  messages: z.array(messageSchema).min(1).max(80),
  tools: z.array(z.unknown()).max(20).optional(),
});
const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400);
  console.error('Cortex Cloud request failed', error instanceof Error ? error.message : 'unknown');
  return c.json({ error: 'Cortex Cloud could not complete the request.' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

app.use('/v1/*', async (c, next) => {
  if (c.req.path === '/v1/webhooks/stripe') return next();
  c.set('identity', await authenticateRequest(c.req.raw, c.env));
  return next();
});

app.get('/v1/me', async (c) => {
  const account = await getAccountSummary(c.env, c.get('identity').userId);
  return c.json({ plan: account.plan, usage: account.usage, billing: account.billing });
});

app.get('/v1/ai/usage', async (c) => {
  const account = await getAccountSummary(c.env, c.get('identity').userId);
  return c.json(account.usage);
});

app.get('/v1/ai/models', async (c) => c.json(await curatedModels()));

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
  if (!isCuratedModel(input.model))
    throw new HttpError(400, 'This model is not in the Cortex allowlist.');
  if (input.final !== input.stream) {
    throw new HttpError(400, 'Final Cortex responses must use streaming.');
  }
  const identity = c.get('identity');
  await acquireRun(c.env, identity.userId, input.runId);
  try {
    await reserveRunUsage(c.env, identity.userId, input.runId);
    await recordRunRequest(c.env, identity.userId, input.runId);
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/IEver3st/Cortex-Toolbox',
        'X-Title': 'Cortex Toolbox',
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        ...(input.tools ? { tools: input.tools, tool_choice: 'auto' } : {}),
        max_tokens: input.final ? 4_096 : 2_000,
        temperature: input.final ? 0.25 : 0.2,
        stream: input.stream,
        provider: { data_collection: 'deny' },
      }),
    });
    if (!upstream.ok) {
      await releaseRun(c.env, identity.userId, input.runId);
      throw new HttpError(502, `The selected model provider returned ${upstream.status}.`);
    }
    if (!input.stream)
      return new Response(upstream.body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const upstreamBody = upstream.body;
    if (!upstreamBody) {
      await releaseRun(c.env, identity.userId, input.runId);
      throw new HttpError(502, 'The model provider did not return a stream.');
    }
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    c.executionCtx.waitUntil(
      (async () => {
        try {
          await upstreamBody.pipeTo(writable);
        } finally {
          await releaseRun(c.env, identity.userId, input.runId);
        }
      })(),
    );
    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (input.final) await releaseRun(c.env, identity.userId, input.runId);
    throw error;
  }
});

app.post('/v1/billing/checkout', async (c) => {
  const input = z.object({ cadence: z.enum(['monthly', 'annual']) }).parse(await c.req.json());
  const identity = c.get('identity');
  const account = await getAccountSummary(c.env, identity.userId);
  return c.json({
    url: await createCheckout(c.env, identity.userId, input.cadence, account.stripeCustomerId),
  });
});

app.post('/v1/billing/portal', async (c) => {
  const identity = c.get('identity');
  const account = await getAccountSummary(c.env, identity.userId);
  return c.json({ url: await createPortal(c.env, account.stripeCustomerId) });
});

app.post('/v1/webhooks/stripe', async (c) => {
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
});

export default app;
