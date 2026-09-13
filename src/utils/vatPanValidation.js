import { sajilo } from '@/api/sajiloClient';

/**
 * Normalizes a VAT/PAN string by stripping all non-digit characters.
 * @param {string|number} taxIdNumber 
 * @returns {string} Clean numeric string or empty string
 */
export function normalizeVatPan(taxIdNumber) {
  if (taxIdNumber === null || taxIdNumber === undefined) return '';
  const str = String(taxIdNumber).trim();
  return str.replace(/[^0-9]/g, '');
}

/**
 * Validates a VAT/PAN number according to Nepal 9-digit numeric standard.
 * @param {string|number} taxIdNumber 
 * @param {Object} options
 * @param {boolean} [options.required=false]
 * @returns {{ isValid: boolean, raw: string, normalized: string | null, error: string | null }}
 */
export function validateVatPan(taxIdNumber, { required = false } = {}) {
  const raw = taxIdNumber === null || taxIdNumber === undefined ? '' : String(taxIdNumber).trim();

  if (!raw) {
    if (required) {
      return {
        isValid: false,
        raw,
        normalized: null,
        error: 'VAT/PAN number is required for this supplier.',
      };
    }
    return {
      isValid: true,
      raw,
      normalized: null,
      error: null,
    };
  }

  // Strip allowed formatting characters (hyphens and spaces)
  const sanitizedInput = raw.replace(/[\s-]/g, '');

  // Reject if any non-numeric characters (letters, symbols) exist
  if (!/^\d+$/.test(sanitizedInput)) {
    return {
      isValid: false,
      raw,
      normalized: null,
      error: `Invalid VAT/PAN number "${raw}". Nepalese VAT/PAN must consist of numeric digits only.`,
    };
  }

  if (sanitizedInput.length !== 9) {
    return {
      isValid: false,
      raw,
      normalized: null,
      error: `Invalid VAT/PAN number "${raw}". Nepalese VAT/PAN must be exactly 9 numeric digits.`,
    };
  }

  return {
    isValid: true,
    raw,
    normalized: sanitizedInput,
    error: null,
  };
}

/**
 * Checks if a normalized VAT/PAN number is already assigned to another partner in the same company.
 * @param {string} taxIdNumber 
 * @param {string} companyId 
 * @param {string} [excludePartnerId=null] 
 * @returns {Promise<{ isDuplicate: boolean, existingPartner: Object | null, error: string | null }>}
 */
export async function checkDuplicateVatPan(taxIdNumber, companyId, excludePartnerId = null) {
  const val = validateVatPan(taxIdNumber);
  if (!val.isValid) {
    return { isDuplicate: false, existingPartner: null, error: val.error };
  }
  if (!val.normalized) {
    return { isDuplicate: false, existingPartner: null, error: null };
  }

  try {
    const { data, error } = await sajilo.auth.supabase
      .from('BusinessPartner')
      .select('id, name, tax_id_number, is_vendor, is_customer')
      .eq('company_id', companyId)
      .eq('tax_id_number', val.normalized);

    if (error) {
      console.error('Error checking duplicate VAT/PAN:', error);
      return { isDuplicate: false, existingPartner: null, error: null };
    }

    const matching = (data || []).filter(p => p.id !== excludePartnerId);

    if (matching.length > 0) {
      const partner = matching[0];
      const roleText = partner.is_vendor && partner.is_customer 
        ? 'Supplier & Customer' 
        : partner.is_vendor 
          ? 'Supplier' 
          : 'Customer';

      return {
        isDuplicate: true,
        existingPartner: partner,
        error: `VAT/PAN ${val.normalized} is already assigned to ${roleText} "${partner.name}".`,
      };
    }

    return { isDuplicate: false, existingPartner: null, error: null };
  } catch (err) {
    console.error('Failed duplicate check:', err);
    return { isDuplicate: false, existingPartner: null, error: null };
  }
}
