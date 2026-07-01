import Stripe from 'stripe';
import { getPool } from './db.mjs';
import { httpError } from './org-service.mjs';
import { activateOrgBilling, billingEnv } from './billing.mjs';
import { activatePersonalPlus, findPersonalAccountBySubscription, syncPersonalContactSlotsFromStripe } from './personal-service.mjs';

function getStripe(env) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  return new Stripe(key);
}

async function orgExists(orgId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, admin_email FROM organizations WHERE id = $1`,
    [orgId],
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

async function findOrgIdBySubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const pool = getPool();
  const result = await pool.query(
    `SELECT id FROM organizations
     WHERE settings->'billing'->>'stripeSubscriptionId' = $1
     LIMIT 1`,
    [String(subscriptionId)],
  );
  return result.rows[0]?.id || null;
}

function mapSubscriptionStatus(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due';
  return 'none';
}

async function resolveOrgForCheckout(session) {
  const orgId = String(session.metadata?.org_id || session.client_reference_id || '').trim();
  if (!orgId) return null;

  const org = await orgExists(orgId);
  if (!org) {
    console.warn('[stripe/webhook] checkout org not found:', orgId);
    return null;
  }

  const checkoutEmail = String(
    session.customer_details?.email || session.customer_email || '',
  ).trim().toLowerCase();
  const adminEmail = String(org.admin_email || '').trim().toLowerCase();
  if (checkoutEmail && adminEmail && checkoutEmail !== adminEmail) {
    console.warn('[stripe/webhook] checkout email mismatch for org', orgId);
    return null;
  }

  return orgId;
}

async function resolvePersonalForCheckout(session) {
  const accountId = String(session.metadata?.personal_account_id || '').trim();
  if (!accountId) return null;
  const pool = getPool();
  const result = await pool.query(`SELECT id FROM personal_accounts WHERE id = $1`, [accountId]);
  return result.rowCount > 0 ? accountId : null;
}

async function handleCheckoutCompleted(session) {
  const personalId = await resolvePersonalForCheckout(session);
  if (personalId) {
    await activatePersonalPlus(personalId, {
      status: 'active',
      stripeCustomerId: session.customer ? String(session.customer) : '',
      stripeSubscriptionId: session.subscription ? String(session.subscription) : '',
    });
    if (session.subscription) {
      try {
        const stripe = getStripe(billingEnv());
        const sub = await stripe?.subscriptions?.retrieve(String(session.subscription));
        if (sub) await syncPersonalContactSlotsFromStripe(personalId, sub);
      } catch {
        // Non-fatal — webhook will sync on subscription.updated.
      }
    }
    return;
  }

  const orgId = await resolveOrgForCheckout(session);
  if (!orgId) return;

  await activateOrgBilling(orgId, {
    status: 'active',
    stripeCustomerId: session.customer ? String(session.customer) : '',
    stripeSubscriptionId: session.subscription ? String(session.subscription) : '',
  });
}

async function handleSubscription(subscription) {
  let personalId = String(subscription.metadata?.personal_account_id || '').trim();
  if (!personalId) {
    personalId = await findPersonalAccountBySubscription(subscription.id);
  }
  if (personalId) {
    await activatePersonalPlus(personalId, {
      status: mapSubscriptionStatus(subscription.status),
      stripeCustomerId: subscription.customer ? String(subscription.customer) : '',
      stripeSubscriptionId: String(subscription.id),
    });
    await syncPersonalContactSlotsFromStripe(personalId, subscription);
    return;
  }

  let orgId = String(subscription.metadata?.org_id || '').trim();
  if (!orgId) {
    orgId = await findOrgIdBySubscription(subscription.id);
  }
  if (!orgId) {
    console.warn('[stripe/webhook] subscription org not found:', subscription.id);
    return;
  }

  await activateOrgBilling(orgId, {
    status: mapSubscriptionStatus(subscription.status),
    stripeCustomerId: subscription.customer ? String(subscription.customer) : '',
    stripeSubscriptionId: String(subscription.id),
  });
}

async function handleInvoicePaid(invoice) {
  const subscriptionId = invoice.subscription ? String(invoice.subscription) : '';
  if (!subscriptionId) return;
  const personalId = await findPersonalAccountBySubscription(subscriptionId);
  if (personalId) {
    await activatePersonalPlus(personalId, {
      status: 'active',
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: invoice.customer ? String(invoice.customer) : '',
    });
    return;
  }
  const orgId = await findOrgIdBySubscription(subscriptionId);
  if (!orgId) return;
  await activateOrgBilling(orgId, {
    status: 'active',
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: invoice.customer ? String(invoice.customer) : '',
  });
}

async function handleInvoiceFailed(invoice) {
  const subscriptionId = invoice.subscription ? String(invoice.subscription) : '';
  if (!subscriptionId) return;
  const personalId = await findPersonalAccountBySubscription(subscriptionId);
  if (personalId) {
    await activatePersonalPlus(personalId, {
      status: 'past_due',
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: invoice.customer ? String(invoice.customer) : '',
    });
    return;
  }
  const orgId = await findOrgIdBySubscription(subscriptionId);
  if (!orgId) return;
  await activateOrgBilling(orgId, {
    status: 'past_due',
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: invoice.customer ? String(invoice.customer) : '',
  });
}

export async function handleStripeWebhook(rawBody, signature, env) {
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    throw httpError(500, 'STRIPE_WEBHOOK_SECRET is not configured.');
  }

  const stripe = getStripe(env);
  if (!stripe) {
    throw httpError(500, 'STRIPE_SECRET_KEY is not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw httpError(400, `Webhook signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscription(event.data.object);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handleInvoiceFailed(event.data.object);
      break;
    default:
      console.log('[stripe/webhook] unhandled:', event.type);
  }

  console.log('[stripe/webhook]', event.type, event.id);
  return { received: true, type: event.type };
}
