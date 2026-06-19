import { assertOrgCanOperate } from './billing.mjs';

/** Strip client-writable settings; billing is server-controlled only. */
export function preserveServerBilling(current = {}, incoming = {}) {
  const merged = { ...current, ...incoming };
  merged.billing = current.billing && typeof current.billing === 'object'
    ? current.billing
    : undefined;
  if (!merged.billing) delete merged.billing;
  return merged;
}

export function assertProvisionedOrgCanOperate(orgRow) {
  const settings = typeof orgRow?.settings === 'object' && orgRow.settings ? orgRow.settings : {};
  return assertOrgCanOperate({
    settings,
    created_at: orgRow.created_at || orgRow.createdAt,
  });
}
