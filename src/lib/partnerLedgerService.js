/**
 * partnerLedgerService
 * Automated sequential sub-ledger generation engine for Business Partners.
 *
 * Step A: Read the configured parent group from CompanySettings.
 * Step B: Find the highest child account_code under that parent.
 * Step C: Increment the numeric suffix by +1.
 * Step D: Create the new ChartOfAccount leaf node and return its id.
 */
import { sajilo } from '@/api/sajiloClient';
import { createSubLedger } from './accountFactory';

export async function createPartnerLedger({ partnerName, parentGroupId, accountType, normalBalance, accountSubtype }) {
  // Fetch parent group to get its account_name
  const parentList = await sajilo.entities.ChartOfAccount.filter({ id: parentGroupId, is_active: true });
  if (!parentList.length) throw new Error(`Parent group ${parentGroupId} not found`);
  const parent = parentList[0];

  const newAccount = await createSubLedger({
    name: partnerName,
    parentGroupId: parentGroupId,
    parentGroupName: parent.account_name,
    accountType: accountType,
    accountSubtype: accountSubtype || '',
    openingBalance: 0,
    description: `Auto-generated ledger for ${partnerName}`
  });

  return newAccount;
}

/**
 * Main entry point: called on partner save.
 * Handles single-role (customer or vendor) and dual-role (both) partners.
 *
 * Unified Ledger Update:
 * Dual-role partners no longer receive separate AR and AP ledgers. Instead, 
 * a single ledger is created under the group of their Primary Role (e.g. 
 * Customer -> Trade Receivables) and reused for the secondary role.
 *
 * @param {object} partnerForm   The partner form data being saved
 * @param {object} settings      CompanySettings record
 * @returns {Promise<{receivable_account_id?, receivable_account_name?, payable_account_id?, payable_account_name?}>}
 *          Partial update object to merge back into the partner record
 */
export async function provisionPartnerLedgers(partnerForm, settings) {
  const updates = {};

  const isCustomer      = partnerForm.is_customer;
  const isVendor        = partnerForm.is_vendor;
  
  // Infer primary role based on UI toggles, fallback to isCustomer if both
  const primaryRole = partnerForm.treated_as_vendor ? 'Customer' : 
                      partnerForm.treat_as_customer ? 'Vendor' :
                      isCustomer ? 'Customer' : 'Vendor';

  const customerGroupId = settings.gl_customer_ledger_group_id;
  const supplierGroupId = settings.gl_supplier_ledger_group_id;

  // Skip if already has a ledger assigned (editing existing partner)
  const alreadyHasAR = !!partnerForm.receivable_account_id;
  const alreadyHasAP = !!partnerForm.payable_account_id;

  let sharedLedgerId = null;
  let sharedLedgerName = null;
  let sharedLedgerCode = null;

  // ── Primary Role: Customer ─────────────
  if (primaryRole === 'Customer' && isCustomer && !alreadyHasAR && customerGroupId) {
    const ledger = await createPartnerLedger({
      partnerName:    partnerForm.name,
      parentGroupId:  customerGroupId,
      accountType:    'Asset',
      normalBalance:  'Debit',
      accountSubtype: 'Current Asset',
    });
    updates.receivable_account_id   = ledger.id;
    updates.receivable_account_name = ledger.account_name;
    updates.receivable_account_code = ledger.account_code;

    sharedLedgerId = ledger.id;
    sharedLedgerName = ledger.account_name;
    sharedLedgerCode = ledger.account_code;
  } else if (primaryRole === 'Customer' && alreadyHasAR) {
    sharedLedgerId = partnerForm.receivable_account_id;
    sharedLedgerName = partnerForm.receivable_account_name;
    sharedLedgerCode = partnerForm.receivable_account_code;
  }

  // ── Primary Role: Vendor ───────────────
  if (primaryRole === 'Vendor' && isVendor && !alreadyHasAP && supplierGroupId) {
    const ledger = await createPartnerLedger({
      partnerName:    partnerForm.name,
      parentGroupId:  supplierGroupId,
      accountType:    'Liability',
      normalBalance:  'Credit',
      accountSubtype: 'Current Liability',
    });
    updates.payable_account_id   = ledger.id;
    updates.payable_account_name = ledger.account_name;
    updates.payable_account_code = ledger.account_code;

    sharedLedgerId = ledger.id;
    sharedLedgerName = ledger.account_name;
    sharedLedgerCode = ledger.account_code;
  } else if (primaryRole === 'Vendor' && alreadyHasAP) {
    sharedLedgerId = partnerForm.payable_account_id;
    sharedLedgerName = partnerForm.payable_account_name;
    sharedLedgerCode = partnerForm.payable_account_code;
  }

  // ── Unified Ledger Re-use ──────────────
  if (isVendor && primaryRole === 'Customer' && !alreadyHasAP && sharedLedgerId) {
    updates.payable_account_id   = sharedLedgerId;
    updates.payable_account_name = sharedLedgerName;
    updates.payable_account_code = sharedLedgerCode;
  }

  if (isCustomer && primaryRole === 'Vendor' && !alreadyHasAR && sharedLedgerId) {
    updates.receivable_account_id   = sharedLedgerId;
    updates.receivable_account_name = sharedLedgerName;
    updates.receivable_account_code = sharedLedgerCode;
  }

  return updates;
}