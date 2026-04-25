import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

let syncInstance: StripeSync | null = null;

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set. Add it in Secrets.');
  }
  return key;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  return new Stripe(getStripeSecretKey());
}

export async function getStripeSync(): Promise<StripeSync> {
  if (syncInstance) return syncInstance;
  syncInstance = new StripeSync({
    stripeSecretKey: getStripeSecretKey(),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    databaseUrl: process.env.DATABASE_URL!,
  });
  return syncInstance;
}

export async function isStripeConnected(): Promise<boolean> {
  try {
    getStripeSecretKey();
    return true;
  } catch {
    return false;
  }
}
