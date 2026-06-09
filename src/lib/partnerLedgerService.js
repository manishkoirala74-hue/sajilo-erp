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

/**
 * Derives the next sequential account code under a given parent group.
 * Strategy: filters all sub-ledgers whose code starts with the parent's code prefix,
 * finds the max numeric value, and returns max + 1.
 *
 * @param {string} parentCode  e.g. "1020"
 * @param {Array}  allAccounts full COA list (pass to avoid extra fetches)
 * @returns {string} next code e.g. "10200026"
 */
function deriveNextCode(parentCode, allAccounts) {
  const prefix = parentCode.replace(/\D/g, ''); // strip non-digits just in case
  const children = allAccounts.filter(a => {
    const code = (a.account_code || '').replace(/\D/g, '');
    return code.startsWith(prefix) && code.length > prefix.length;
  });

  if (children.length === 0) {
    // First child: pad parent code + "0001"
    return `${prefix}0001`;
  }

  const maxNumeric = Math.max(
    ...children.map(a => parseInt((a.account_code || '').replace(/\D/g, ''), 10) || 0)
  );
  return String(maxNumeric + 1);
}

/**
 * Creates a sub-ledger account under the specified parent group for a partner.
 *
 * @param {object} params
 * @param {string} params.partnerName        Business name → account_name
 * @param {string} params.parentGroupId      ChartOfAccount id of the group
 * @param {string} params.accountType        'Asset' | 'Liability'
 * @param {string} params.normalBalance      'Debit' | 'Credit'
 * @param {string} params.accountSubtype     e.g. 'Current Asset'
 * @returns {Promise<{id: string, account_code: string, account_name: string}>}
 */
export async function createPartnerLedger({ partnerName, parentGroupId, accountType, normalBalance, accountSubtype }) {
  // Fetch parent group to get its account_code prefix
  const parentList = await sajilo.entities.ChartOfAccount.filter({ id: parentGroupId, is_active: true });
  if (!parentList.length) throw new Error(`Parent group ${parentGroupId} not found`);
  const parent = parentList[0];

  // Fetch all accounts to find next sequential code
  const allAccounts = await sajilo.entities.ChartOfAccount.list('account_code', 2000);

  const nextCode = deriveNextCode(parent.account_code, allAccounts);

  const newAccount = await sajilo.entities.ChartOfAccount.create({
    account_code:       nextCode,
    account_name:       partnerName,
    account_type:       accountType,
    account_subtype:    accountSubtype || '',
    ledger_type:        'Sub Ledger',
    parent_account_id:  parentGroupId,
    parent_account_name: parent.account_name,
    normal_balance:     normalBalance,
    is_active:          true,
    is_system_account:  false,
    current_balance:    0,
    description:        `Auto-generated ledger for ${partnerName}`,
  });

  return newAccount;
}

/**
 * Main entry point: called on partner save.
 * Handles single ledger (customer or vendor) and twin-ledger (dual-role partner).
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
  const customerGroupId = settings.gl_customer_ledger_group_id;
  const supplierGroupId = settings.gl_supplier_ledger_group_id;
  const dualGroupId     = settings.gl_dual_ledger_group_id;

  // Skip if already has a ledger assigned (editing existing partner)
  const alreadyHasAR = !!partnerForm.receivable_account_id;
  const alreadyHasAP = !!partnerForm.payable_account_id;

  // ── Customer → AR ledger ──────────────────────────────────────────────────
  if (isCustomer && !alreadyHasAR && customerGroupId) {
    const groupId = (isCustomer && isVendor && dualGroupId) ? dualGroupId : customerGroupId;
    const ledger = await createPartnerLedger({
      partnerName:    partnerForm.name,
      parentGroupId:  groupId,
      accountType:    'Asset',
      normalBalance:  'Debit',
      accountSubtype: 'Current Asset',
    });
    updates.receivable_account_id   = ledger.id;
    updates.receivable_account_name = ledger.account_name;
    updates.receivable_account_code = ledger.account_code;
  }

  // ── Vendor → AP ledger ───────────────────────────────────────────────────
  if (isVendor && !alreadyHasAP && supplierGroupId) {
    const groupId = (isCustomer && isVendor && dualGroupId) ? dualGroupId : supplierGroupId;
    const ledger = await createPartnerLedger({
      partnerName:    partnerForm.name,
      parentGroupId:  groupId,
      accountType:    'Liability',
      normalBalance:  'Credit',
      accountSubtype: 'Current Liability',
    });
    updates.payable_account_id   = ledger.id;
    updates.payable_account_name = ledger.account_name;
    updates.payable_account_code = ledger.account_code;
  }

  return updates;
}