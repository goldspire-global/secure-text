import Stripe from 'stripe';
import { httpError } from './org-service.mjs';
import { billingEnv } from './billing.mjs';
import {
  authenticatePersonalRequest,
  PLUS_INCLUDED_CONTACTS,
  syncPersonalContactSlotsFromStripe,
} from './personal-service.mjs';
import { assertEmailVerified } from './personal-verification-service.mjs';

function getStripe(env = billingEnv()) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  return new Stripe(key);
}

function plusPortalUrl(env = billingEnv()) {
  const portal = String(env.ORG_PORTAL_URL || env.PORTAL_ORIGIN || '').trim();
  if (!portal) return 'https://veil.goldspireventures.com/plus.html';
  const root = portal.replace(/\/join\.html.*$/i, '/').replace(/\/$/, '');
  return `${root}/plus.html`;
}

function plusBasePriceId(env = billingEnv()) {
  return String(env.STRIPE_PRICE_ID_PLUS_MONTHLY || env.STRIPE_PRICE_ID_PLUS || '').trim();
}

function plusContactAddonPriceId(env = billingEnv()) {
  return String(env.STRIPE_PRICE_ID_PLUS_CONTACT_MONTHLY || '').trim();
}

export async function createPersonalCheckoutSession(token, deviceId) {
  const env = billingEnv();
  const stripe = getStripe(env);
  const priceId = plusBasePriceId(env);
  if (!stripe) throw httpError(503, 'Billing is not configured.');
  if (!priceId) throw httpError(503, 'Veil Plus price is not configured.');

  const account = await authenticatePersonalRequest(token, deviceId);
  assertEmailVerified(account);
  const plusUrl = plusPortalUrl(env);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { personal_account_id: account.id },
    client_reference_id: account.id,
    subscription_data: {
      metadata: { personal_account_id: account.id },
    },
    customer_email: account.owner_email || undefined,
    success_url: `${plusUrl}?plus=success`,
    cancel_url: `${plusUrl}?plus=cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) throw httpError(500, 'Could not create checkout session.');
  return { url: session.url, sessionId: session.id };
}

export async function purchasePersonalContactSlot(token, deviceId) {
  const env = billingEnv();
  const stripe = getStripe(env);
  const addonPriceId = plusContactAddonPriceId(env);
  if (!stripe) throw httpError(503, 'Billing is not configured.');
  if (!addonPriceId) throw httpError(503, 'Plus contact add-on price is not configured.');

  const account = await authenticatePersonalRequest(token, deviceId);
  assertEmailVerified(account);
  if (account.plus_status !== 'active') {
    throw httpError(402, 'Veil Plus is required before adding contact slots.');
  }
  if (!account.stripe_subscription_id) {
    throw httpError(400, 'No active subscription found. Complete Plus checkout first.');
  }

  const subscription = await stripe.subscriptions.retrieve(account.stripe_subscription_id);
  const addonItem = subscription.items?.data?.find((item) => item.price?.id === addonPriceId);

  if (addonItem) {
    await stripe.subscriptionItems.update(addonItem.id, {
      quantity: (addonItem.quantity || 0) + 1,
    });
  } else {
    await stripe.subscriptionItems.create({
      subscription: account.stripe_subscription_id,
      price: addonPriceId,
      quantity: 1,
    });
  }

  const refreshed = await stripe.subscriptions.retrieve(account.stripe_subscription_id);
  const slots = await syncPersonalContactSlotsFromStripe(account.id, refreshed);
  return {
    ok: true,
    extraContactSlots: slots.extraContactSlots,
    contactLimit: slots.contactLimit,
    includedContacts: PLUS_INCLUDED_CONTACTS(),
  };
}
