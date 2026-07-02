#!/usr/bin/env node
/**
 * Create Veil Team product, prices, and Stripe Payment Link (idempotent).
 * Reads STRIPE_SECRET_KEY from .env and writes IDs back to .env.
 */
import Stripe from 'stripe';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(repoRoot, '.env');

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function upsertEnv(lines, updates) {
  const keys = new Set(Object.keys(updates));
  const out = [];
  const seen = new Set();

  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && keys.has(m[1])) {
      out.push(`${m[1]}=${updates[m[1]]}`);
      seen.add(m[1]);
    } else {
      out.push(line);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }

  return out.join('\n').replace(/\n?$/, '\n');
}

async function findProduct(stripe, metadataValue) {
  const list = await stripe.products.list({ active: true, limit: 100 });
  return list.data.find((p) => p.metadata?.veil_product === metadataValue) || null;
}

async function findPrice(stripe, productId, lookupKey) {
  const list = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return list.data.find((p) => p.lookup_key === lookupKey) || null;
}

async function main() {
  if (!existsSync(envPath)) {
    console.error('Missing .env — copy .env.example first.');
    process.exit(1);
  }

  const env = parseEnv(readFileSync(envPath, 'utf8'));
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('STRIPE_SECRET_KEY is not set in .env');
    process.exit(1);
  }

  const stripe = new Stripe(key);

  let product = await findProduct(stripe, 'team');
  if (!product) {
    product = await stripe.products.create({
      name: 'Veil Team',
      description: 'Veil by Goldspire — team cloud: org admin, policy packs, tokens, security events. Per seat, billed annually.',
      metadata: { veil_product: 'team' },
    });
    console.log('Created product:', product.id);
  } else {
    console.log('Found product:', product.id);
  }

  let priceAnnual = await findPrice(stripe, product.id, 'veil_team_annual_usd');
  if (!priceAnnual) {
    priceAnnual = await stripe.prices.create({
      product: product.id,
      unit_amount: 8400,
      currency: 'usd',
      recurring: { interval: 'year' },
      lookup_key: 'veil_team_annual_usd',
      metadata: { veil_product: 'team', billing: 'annual', per_seat: 'true' },
    });
    console.log('Created annual price ($84/seat/yr):', priceAnnual.id);
  } else {
    console.log('Found annual price:', priceAnnual.id);
  }

  let priceMonthly = await findPrice(stripe, product.id, 'veil_team_monthly_usd');
  if (!priceMonthly) {
    priceMonthly = await stripe.prices.create({
      product: product.id,
      unit_amount: 700,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: 'veil_team_monthly_usd',
      metadata: { veil_product: 'team', billing: 'monthly', per_seat: 'true' },
    });
    console.log('Created monthly price ($7/seat/mo):', priceMonthly.id);
  } else {
    console.log('Found monthly price:', priceMonthly.id);
  }

  const existingLinks = await stripe.paymentLinks.list({ active: true, limit: 100 });
  let paymentLink = existingLinks.data.find((l) => l.metadata?.veil_product === 'team');

  if (!paymentLink) {
    paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price: priceAnnual.id,
        quantity: 5,
        adjustable_quantity: { enabled: true, minimum: 7, maximum: 999 },
      }],
      metadata: { veil_product: 'team' },
      after_completion: {
        type: 'redirect',
        redirect: { url: `${env.ORG_PORTAL_URL?.replace(/\/join\.html.*$/, '') || 'https://veil.goldspireventures.com'}/admin.html` },
      },
      allow_promotion_codes: true,
    });
    console.log('Created payment link:', paymentLink.url);
  } else {
    console.log('Found payment link:', paymentLink.url);
  }

  const updates = {
    STRIPE_PRICE_ID_TEAM_ANNUAL: priceAnnual.id,
    STRIPE_PRICE_ID_TEAM_MONTHLY: priceMonthly.id,
    STRIPE_PAYMENT_LINK_TEAM: paymentLink.url,
    VEIL_EARLY_ACCESS: env.VEIL_EARLY_ACCESS || 'true',
  };

  const nextEnv = upsertEnv(readFileSync(envPath, 'utf8').split('\n'), updates);
  writeFileSync(envPath, nextEnv);

  console.log('\nUpdated .env with Stripe IDs.');
  console.log('Next: npm run env:apply');
  console.log('Set STRIPE_WEBHOOK_SECRET on Railway after adding webhook:');
  console.log('  https://veil-api.goldspireventures.com/v1/webhooks/stripe');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
