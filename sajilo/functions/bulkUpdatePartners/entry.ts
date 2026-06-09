import { createClientFromRequest } from 'npm:@sajilo/sdk@0.8.25';

// ─── Nepali Date Helper (simple AD→BS offset) ────────────────────────────────
function adToBs(adDate) {
  // Approximate BS year offset: BS = AD + 56.7 (use 57 for years >= April)
  const d = new Date(adDate);
  const month = d.getMonth() + 1; // 1-indexed
  const bsYear = d.getFullYear() + (month >= 4 ? 57 : 56);
  const months = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];
  const bsMonth = ((month + 8) % 12); // approx shift
  return `${d.getDate()} ${months[bsMonth]} ${bsYear} B.S.`;
}

Deno.serve(async (req) => {
  const sajilo = createClientFromRequest(req);
  const user = await sajilo.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, ids, updates, partnerType } = body;
  // action: 'update' | 'delete'
  // ids: string[]
  // updates: object (for action=update)
  // partnerType: 'Customer' | 'Supplier'

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: 'No partner IDs provided' }, { status: 400 });
  }

  // ── BULK UPDATE ──────────────────────────────────────────────────────────────
  if (action === 'update') {
    if (!updates || Object.keys(updates).length === 0) {
      return Response.json({ error: 'No update fields provided' }, { status: 400 });
    }
    const results = { updated: 0, failed: 0, errors: [] };
    for (const id of ids) {
      try {
        await sajilo.asServiceRole.entities.BusinessPartner.update(id, updates);
        results.updated++;
      } catch (e) {
        results.failed++;
        results.errors.push(`ID ${id}: ${e.message}`);
      }
    }
    return Response.json({ success: true, ...results });
  }

  // ── BULK DELETE with integrity check ─────────────────────────────────────────
  if (action === 'delete') {
    // Fetch all partners in one list call (avoids per-ID filter calls)
    const allPartners = await sajilo.asServiceRole.entities.BusinessPartner.list('-created_date', 1000);
    const partners = allPartners.filter(p => ids.includes(p.id));

    if (partners.length === 0) {
      return Response.json({ error: 'No matching partners found' }, { status: 404 });
    }

    // Fetch all relevant linked records in bulk (4 calls total, not per-partner)
    const [allSales, allPurchases, allPOS, allJournalLines] = await Promise.all([
      sajilo.asServiceRole.entities.SalesInvoice.list('-created_date', 2000),
      sajilo.asServiceRole.entities.PurchaseInvoice.list('-created_date', 2000),
      sajilo.asServiceRole.entities.POSSale.list('-created_date', 2000),
      sajilo.asServiceRole.entities.GeneralLedgerLine.list('-created_date', 5000),
    ]);

    // Build sets for fast lookup
    const salesCustomerIds = new Set(allSales.map(s => s.customer_id).filter(Boolean));
    const purchaseVendorIds = new Set(allPurchases.map(p => p.vendor_id).filter(Boolean));
    const posCustomerIds = new Set(allPOS.map(p => p.customer_id).filter(Boolean));
    const journalAccountIds = new Set(allJournalLines.map(j => j.account_id).filter(Boolean));

    // Referential integrity checks
    const blocked = [];
    const safeToDelete = [];
    for (const partner of partners) {
      const pid = partner.id;
      const name = partner.name;

      if (salesCustomerIds.has(pid)) {
        blocked.push({ id: pid, name, reason: 'sales invoices' });
      } else if (purchaseVendorIds.has(pid)) {
        blocked.push({ id: pid, name, reason: 'purchase invoices' });
      } else if (posCustomerIds.has(pid)) {
        blocked.push({ id: pid, name, reason: 'POS sales' });
      } else if (
        (partner.receivable_account_id && journalAccountIds.has(partner.receivable_account_id)) ||
        (partner.payable_account_id && journalAccountIds.has(partner.payable_account_id))
      ) {
        blocked.push({ id: pid, name, reason: 'journal entries' });
      } else {
        safeToDelete.push(partner);
      }
    }

    if (blocked.length > 0) {
      return Response.json({
        success: false,
        blocked: true,
        blockedPartners: blocked,
        message: blocked.map(b =>
          `Cannot delete "${b.name}" — they have active ${b.reason} in the system. Consider marking them Inactive instead.`
        ).join('\n'),
      }, { status: 409 });
    }

    // Fetch all CoA sub-ledgers once (to avoid per-ledger filter calls)
    const allCoA = await sajilo.asServiceRole.entities.ChartOfAccount.list('-created_date', 2000);
    const coaById = new Map(allCoA.map(a => [a.id, a]));

    // All clear — execute deletions and write audit logs
    const results = { deleted: 0, failed: 0, errors: [] };
    const bsDate = adToBs(new Date());
    const isMultiple = ids.length > 1;
    const actionType = isMultiple ? 'Bulk Delete' : 'Single Delete';

    for (const partner of safeToDelete) {
      try {
        await sajilo.asServiceRole.entities.BusinessPartner.delete(partner.id);
        results.deleted++;

        // Delete associated sub-ledger accounts (only Sub Ledger type)
        const ledgerIds = [partner.receivable_account_id, partner.payable_account_id].filter(Boolean);
        for (const ledgerId of ledgerIds) {
          const ledger = coaById.get(ledgerId);
          if (ledger && ledger.ledger_type === 'Sub Ledger') {
            try {
              await sajilo.asServiceRole.entities.ChartOfAccount.delete(ledgerId);
            } catch { /* non-fatal */ }
          }
        }

        // Write deletion log
        await sajilo.asServiceRole.entities.PartnerDeleteLog.create({
          partner_id: partner.id,
          partner_name: partner.name,
          partner_type: partnerType || (partner.is_customer ? 'Customer' : 'Supplier'),
          partner_code: partner.partner_code || '',
          tax_id_number: partner.tax_id_number || '',
          email: partner.email || '',
          phone: partner.phone || '',
          deleted_by: user.email,
          action_type: actionType,
          log_payload: `User ${user.email} executed a deletion action. Mapped Entity: ${partner.name}, Action Type: ${actionType}, Status: Successfully Purged, Date (B.S.): ${bsDate}.`,
          partner_snapshot: partner,
        });
      } catch (e) {
        results.failed++;
        results.errors.push(`"${partner.name}": ${e.message}`);
      }
    }

    return Response.json({ success: true, ...results });
  }

  return Response.json({ error: 'Invalid action. Use "update" or "delete".' }, { status: 400 });
});