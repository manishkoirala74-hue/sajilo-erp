/**
 * ONE-TIME MIGRATION: Backfill receivable_account_id / payable_account_id
 * on all existing BusinessPartner records.
 *
 * Logic:
 *   - Finds the AR control account (name contains "receivable" or "trade debtor")
 *   - Finds the AP control account (name contains "payable" or "trade creditor")
 *   - For every customer missing receivable_account_id → sets it to AR account
 *   - For every vendor missing payable_account_id     → sets it to AP account
 *
 * Admin-only. Safe to run multiple times (idempotent — only patches NULL fields).
 */
import { createClientFromRequest } from 'npm:@sajilo/sdk@0.8.25';

Deno.serve(async (req) => {
  const sajilo = createClientFromRequest(req);

  // ── Auth guard (admin only) ─────────────────────────────────────────────────
  const user = await sajilo.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  // ── 1. Fetch all Chart of Accounts ─────────────────────────────────────────
  const allAccounts = await sajilo.asServiceRole.entities.ChartOfAccount.list('account_code', 1000);

  const AR_KEYWORDS = ['receivable', 'trade debtor', 'debtor'];
  const AP_KEYWORDS = ['payable', 'trade creditor', 'creditor'];

  const findControlAccount = (keywords) =>
    allAccounts.find(a =>
      keywords.some(kw => a.account_name?.toLowerCase().includes(kw))
    );

  const arAccount = findControlAccount(AR_KEYWORDS);
  const apAccount = findControlAccount(AP_KEYWORDS);

  const results = {
    ar_account_found:  arAccount ? `${arAccount.account_code} — ${arAccount.account_name}` : null,
    ap_account_found:  apAccount ? `${apAccount.account_code} — ${apAccount.account_name}` : null,
    customers_patched: 0,
    vendors_patched:   0,
    skipped:           0,
    errors:            [],
  };

  if (!arAccount && !apAccount) {
    return Response.json({
      ...results,
      warning: 'No AR or AP control accounts found in Chart of Accounts. Nothing was updated.',
    });
  }

  // ── 2. Fetch all partners ───────────────────────────────────────────────────
  const partners = await sajilo.asServiceRole.entities.BusinessPartner.list('name', 2000);

  // ── 3. Patch each partner that is missing the control account link ──────────
  for (const partner of partners) {
    try {
      const patch = {};

      if (partner.is_customer && arAccount && !partner.receivable_account_id) {
        patch.receivable_account_id   = arAccount.id;
        patch.receivable_account_name = arAccount.account_name;
      }

      if (partner.is_vendor && apAccount && !partner.payable_account_id) {
        patch.payable_account_id   = apAccount.id;
        patch.payable_account_name = apAccount.account_name;
      }

      if (Object.keys(patch).length === 0) {
        results.skipped++;
        continue;
      }

      await sajilo.asServiceRole.entities.BusinessPartner.update(partner.id, patch);

      if (patch.receivable_account_id) results.customers_patched++;
      if (patch.payable_account_id)    results.vendors_patched++;

    } catch (err) {
      results.errors.push(`Partner ${partner.name} (${partner.id}): ${err.message}`);
    }
  }

  return Response.json({
    status: 'done',
    ...results,
    total_partners: partners.length,
  });
});