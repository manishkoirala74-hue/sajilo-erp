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
