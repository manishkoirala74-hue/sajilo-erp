import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';
import { loadActiveTaxTypes } from '@/lib/taxService';

const MASTER_DATA_STALE_TIME = 30 * 60 * 1000; // 30 minutes in RAM
const MASTER_DATA_GC_TIME = 60 * 60 * 1000;    // 1 hour garbage collection

/**
 * Enterprise Master Data Hook
 *
 * Provides instant 0ms cached lookups for static master data tables:
 * - Item Categories
 * - Units of Measure
 * - Chart of Accounts (active sub-ledgers & accounts)
 * - Discount Schemes
 * - Tax Types
 * - Godowns
 *
 * Mutation-Aware Cache Busting:
 * Each sub-entity uses an entity-driven TanStack Query key compliant with
 * DEVELOPMENT_CHECKLIST.md §2. When an accountant mutates an entity via sajiloClient
 * (e.g. sajilo.entities.ItemCategory.create), the built-in predicate invalidator
 * automatically busts the matching entity key in real-time without refetching unrelated tables.
 */
export function useMasterData(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  const queryClient = useQueryClient();

  // 1. Categories
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['Company', activeCompany, 'ItemCategory', 'categories'],
    queryFn: async () => {
      const data = await sajilo.entities.ItemCategory.list('category_name');
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });

  // 2. Units of Measure
  const { data: uoms = [], isLoading: loadingUoms } = useQuery({
    queryKey: ['Company', activeCompany, 'UnitOfMeasure', 'uoms'],
    queryFn: async () => {
      const data = await sajilo.entities.UnitOfMeasure.filter({ is_active: true }, 'uom_code', 200);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });

  // 3. Chart of Accounts
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['Company', activeCompany, 'ChartOfAccount', 'accounts'],
    queryFn: async () => {
      const data = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 1000);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });

  // 4. Discount Schemes
  const { data: discountSchemes = [], isLoading: loadingDiscounts } = useQuery({
    queryKey: ['Company', activeCompany, 'DiscountScheme', 'discountSchemes'],
    queryFn: async () => {
      const data = await sajilo.entities.DiscountScheme.filter({ is_active: true }, 'scheme_name', 200);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });

  // 5. Active Tax Types
  const { data: taxTypes = [], isLoading: loadingTaxes } = useQuery({
    queryKey: ['Company', activeCompany, 'TaxType', 'taxTypes'],
    queryFn: async () => {
      const data = await loadActiveTaxTypes();
      return (data || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    enabled: !!activeCompany,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });

  // 6. Godowns
  const { data: godowns = [], isLoading: loadingGodowns } = useQuery({
    queryKey: ['Company', activeCompany, 'Godown', 'godowns'],
    queryFn: async () => {
      const data = await sajilo.entities.Godown.filter({ status: 'Active' }, 'name');
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: MASTER_DATA_STALE_TIME,
    gcTime: MASTER_DATA_GC_TIME,
  });

  const isLoading = loadingCategories || loadingUoms || loadingAccounts || loadingDiscounts || loadingTaxes || loadingGodowns;

  const refetchAll = () => {
    queryClient.invalidateQueries({
      predicate: (q) =>
        q.queryKey[0] === 'Company' &&
        q.queryKey[1] === activeCompany &&
        ['ItemCategory', 'UnitOfMeasure', 'ChartOfAccount', 'DiscountScheme', 'TaxType', 'Godown'].includes(q.queryKey[2])
    });
  };

  return {
    categories,
    uoms,
    accounts,
    discountSchemes,
    taxTypes,
    godowns,
    isLoading,
    refetchAll
  };
}
