import Stripe from 'stripe';
import { httpError } from './org-service.mjs';
import { billingEnv } from './billing.mjs';

function getStripe(env = billingEnv()) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  return new Stripe(key);
}

function portalAdminUrl(env = billingEnv()) {
  const portal = String(env.ORG_PORTAL_URL || '').trim();
  if (!portal) return 'https://veil.goldspireventures.com/admin.html';
  const root = portal.replace(/\/join\.html.*$/i, '/');
  return root.endsWith('/') ? `${root}admin.html` : `${root}/admin.html`;
}

export async function createTeamCheckoutSession(admin) {
  const env = billingEnv();
  const stripe = getStripe(env);
  const priceId = String(env.STRIPE_PRICE_ID_TEAM_ANNUAL || '').trim();
  if (!stripe) throw httpError(503, 'Billing is not configured.');
  if (!priceId) throw httpError(503, 'Team price is not configured.');

  const adminUrl = portalAdminUrl(env);
  const minSeats = Math.max(7, Number(env.VEIL_TEAM_MIN_SEATS) || 7);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: minSeats }],
    metadata: { org_id: admin.org.id },
    client_reference_id: admin.org.id,
    subscription_data: {
      metadata: { org_id: admin.org.id },
    },
    customer_email: admin.org.admin_email || undefined,
    success_url: `${adminUrl}?billing=success`,
    cancel_url: `${adminUrl}?billing=cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) throw httpError(500, 'Could not create checkout session.');
  return { url: session.url, sessionId: session.id };
}
