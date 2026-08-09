export interface Env {
  DB: D1Database;
  WORKOS_CLIENT_ID: string;
  WORKOS_ISSUER?: string;
  OPENROUTER_API_KEY: string;
  CORTEX_AI_ENABLED?: string;
  AI_PROVIDER_ENABLED?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_CREATOR_MONTHLY_PRICE_ID: string;
  STRIPE_CREATOR_ANNUAL_PRICE_ID: string;
  STRIPE_PRO_MONTHLY_PRICE_ID: string;
  STRIPE_PRO_ANNUAL_PRICE_ID: string;
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
  BILLING_RETURN_URL: string;
  STRIPE_RECONCILE_AFTER_SECONDS?: string;
  CORTEX_ADMIN_WORKOS_USER_IDS?: string;
}

export interface AuthIdentity {
  userId: string;
  sessionId: string;
}
