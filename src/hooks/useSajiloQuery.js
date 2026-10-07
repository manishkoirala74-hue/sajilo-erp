import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';

// --- QUERIES ---

export function useItemsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'Item', 'items'],
    queryFn: async () => {
      const data = await sajilo.entities.Item.filter({ is_active: true }, '-created_at', 1000);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCustomersQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'BusinessPartner', 'customers'],
    queryFn: async () => {
      const data = await sajilo.entities.BusinessPartner.filter({ is_customer: true }, '-created_at', 1000);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVendorsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'BusinessPartner', 'vendors'],
    queryFn: async () => {
      const data = await sajilo.entities.BusinessPartner.filter({ is_vendor: true }, '-created_at', 1000);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSettingsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'CompanySettings', 'settings'],
    queryFn: async () => {
      const data = await sajilo.entities.CompanySettings.list();
      return data.length > 0 ? data[0] : {};
    },
    enabled: !!activeCompany,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useGodownsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'Godown', 'godowns'],
    queryFn: async () => {
      const data = await sajilo.entities.Godown.filter({ is_active: true }, 'name');
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: 60 * 60 * 1000,
  });
}

export function useDailyMetricsQuery(companyId, startDate, endDate) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'DailyMetricsRollup', 'dailyMetrics', startDate, endDate],
    queryFn: async () => {
      // Use Supabase query builder directly to filter by date at the DB level
      const { data, error } = await sajilo.auth.supabase
        .from('DailyMetricsRollup')
        .select('*')
        .eq('company_id', activeCompany)
        .gte('metric_date', startDate)
        .lte('metric_date', endDate)
        .order('metric_date', { ascending: false });
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeCompany && !!startDate && !!endDate,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRecentDocumentsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'SalesInvoice', 'PurchaseInvoice', 'recentDocuments'],
    queryFn: async () => {
      const [sales, purchases] = await Promise.all([
        sajilo.entities.SalesInvoice.filter({}, '-updated_at', 5).catch(() => []),
        sajilo.entities.PurchaseInvoice.filter({}, '-updated_at', 5).catch(() => [])
      ]);
      const combined = [...(sales || []), ...(purchases || [])];
      combined.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      return combined.slice(0, 5).map(doc => ({
        id: doc.id,
        type: doc.customer_id ? 'Sales Invoice' : 'Purchase Bill',
        title: doc.voucher_no || 'Draft',
        amount: doc.net_total || doc.grand_total,
        status: doc.status,
        date: doc.created_date,
        path: doc.customer_id ? `/sales/invoices` : `/purchase/invoices`
      }));
    },
    enabled: !!activeCompany,
    staleTime: 60 * 1000,
  });
}

export function useDashboardSummaryQuery(companyId, startDate, endDate) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'SalesInvoice', 'PurchaseOrder', 'BusinessPartner', 'Item', 'DailyMetricsRollup', 'dashboardSummary', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await sajilo.auth.supabase.rpc('get_dashboard_summary', {
        p_company_id: activeCompany,
        p_start_date: startDate,
        p_end_date: endDate
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany && !!startDate && !!endDate,
    staleTime: 60 * 1000,
  });
}

export function useRecentSalesQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'SalesInvoice', 'recentSales'],
    queryFn: async () => {
      const data = await sajilo.entities.SalesInvoice.filter({ status: 'Posted' }, '-created_date', 5).catch(() => []);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: 60 * 1000,
  });
}

export function usePendingApprovalsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'PurchaseOrder', 'pendingApprovals'],
    queryFn: async () => {
      const data = await sajilo.entities.PurchaseOrder.filter({ status: 'Pending Approval' }).catch(() => []);
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetches live Cash and Bank balances from the dedicated lightweight RPC
 * get_cash_bank_balance(), which is fiscal-year-bounded and uses strict
 * is_cash_account / is_bank_account flags — not ILIKE heuristics.
 *
 * Decoupled from useDashboardSummaryQuery intentionally:
 *   - useDashboardSummaryQuery runs heavy Sales/Purchases/Inventory aggregations.
 *   - Adding 'GeneralLedgerJournal' to that key would re-trigger those expensive
 *     aggregations on every posted voucher (per feedback §3).
 *   - This hook only touches GeneralLedgerLine + GeneralLedgerJournal + ChartOfAccount
 *     + FiscalYear, so its invalidation scope is narrow and its payload is tiny.
 *
 * staleTime: 5 minutes — acceptable staleness for a balance-sheet position
 * on an operational dashboard. Not a real-time ticker.
 */
export function useCashBalanceQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  const today = new Date().toISOString().slice(0, 10);

  return useQuery({
    // Entity-driven query key per DEVELOPMENT_CHECKLIST.md §2.
    // Includes all DB entities touched by the RPC so predicate-based
    // cache invalidation correctly busts this cache when relevant data changes.
    queryKey: [
      'company', activeCompany,
      'GeneralLedgerLine', 'ChartOfAccount', 'FiscalYear',
      'cashBankBalance',
    ],
    queryFn: async () => {
      const { data, error } = await sajilo.auth.supabase.rpc('get_cash_bank_balance', {
        p_company_id: activeCompany,
        p_as_of_date: today,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
    staleTime: 5 * 60 * 1000,   // 5 minutes — avoids DB hammering during peak entry
    refetchOnWindowFocus: false, // balance doesn't need refetch on every tab switch
  });
}

export function useBankAccountsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();

  return useQuery({
    // V2: Reordered Query Key for precise invalidation targeting
    queryKey: ['company', activeCompany, 'bankAccountsWithBalances', 'BankAccount', 'ChartOfAccount', 'GeneralLedgerLine'],
    queryFn: async () => {
      // 1. Fetch physical BankAccount metadata
      const { data: bankData, error: bankError } = await sajilo.auth.supabase
        .from('BankAccount')
        .select('*')
        .eq('company_id', activeCompany)
        .order('created_at', { ascending: false });

      if (bankError) throw bankError;

      // 2. Fetch COA accounts flagged as Cash or Bank
      const { data: coaData, error: coaError } = await sajilo.auth.supabase
        .from('ChartOfAccount')
        .select('id, account_name, account_type, is_cash_account, is_bank_account, current_balance')
        .eq('company_id', activeCompany)
        .or('is_cash_account.eq.true,is_bank_account.eq.true');

      if (coaError) throw coaError;

      let mergedAccounts = [...(bankData || [])];
      const mappedGlIds = new Set(mergedAccounts.map(a => a.gl_account_id).filter(Boolean));

      // 3. Auto-include any flagged COA accounts not yet registered as a BankAccount row
      (coaData || []).forEach(coa => {
        if (!mappedGlIds.has(coa.id)) {
          const treasuryType = coa.is_cash_account ? 'Cash' : 'Bank';
          mergedAccounts.push({
            id: coa.id, // using COA id as virtual ID
            account_name: coa.account_name,
            account_type: treasuryType,
            gl_account_id: coa.id,
            is_active: true,
            is_virtual: true
          });
        }
      });

      // 4. Fetch LIVE General Ledger lines for bulletproof accuracy
      const glIds = mergedAccounts.map(a => a.gl_account_id).filter(Boolean);
      let glBalances = {};

      if (glIds.length > 0) {
        const { data: glData, error: glError } = await sajilo.auth.supabase
          .from('GeneralLedgerLine')
          .select('account_id, debit_amount, credit_amount')
          .eq('company_id', activeCompany)
          .in('account_id', glIds);

        if (glError) throw glError;

        if (glData) {
          glData.forEach(line => {
            if (!glBalances[line.account_id]) glBalances[line.account_id] = 0;
            glBalances[line.account_id] += (line.debit_amount || 0) - (line.credit_amount || 0);
          });
        }
      }

      // Fallback to COA cache if no GL lines exist
      (coaData || []).forEach(coa => {
        if (glBalances[coa.id] === undefined) glBalances[coa.id] = coa.current_balance || 0;
      });

      return { accounts: mergedAccounts, glBalances };
    },
    enabled: !!activeCompany,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// --- MUTATIONS ---

export function useItemMutation(companyId) {
  const queryClient = useQueryClient();
  const activeCompany = companyId || sajilo.getCompanyId();
  return useMutation({
    mutationFn: async ({ action, id, payload }) => {
      if (action === 'create') return await sajilo.entities.Item.create(payload);
      if (action === 'update') return await sajilo.entities.Item.update(id, payload);
      if (action === 'delete') return await sajilo.entities.Item.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes('Item') });
    }
  });
}

export function usePartnerMutation(companyId) {
  const queryClient = useQueryClient();
  const activeCompany = companyId || sajilo.getCompanyId();
  return useMutation({
    mutationFn: async ({ action, id, payload }) => {
      if (action === 'create') return await sajilo.entities.BusinessPartner.create(payload);
      if (action === 'update') return await sajilo.entities.BusinessPartner.update(id, payload);
      if (action === 'delete') return await sajilo.entities.BusinessPartner.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes('BusinessPartner') });
    }
  });
}
