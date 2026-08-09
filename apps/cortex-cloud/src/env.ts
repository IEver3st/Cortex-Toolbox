export interface Env {
  DB: D1Database;
  WORKOS_CLIENT_ID: string;
  WORKOS_ISSUER?: string;
  OPENROUTER_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_MONTHLY_PRICE_ID: string;
  STRIPE_PRO_ANNUAL_PRICE_ID: string;
  BILLING_RETURN_URL: string;
}

export interface AuthIdentity {
  userId: string;
  sessionId: string;
}
