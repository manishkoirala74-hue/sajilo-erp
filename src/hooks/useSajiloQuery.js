import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';

// --- QUERIES ---

export function useItemsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'items'],
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
    queryKey: ['company', activeCompany, 'customers'],
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
    queryKey: ['company', activeCompany, 'vendors'],
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
    queryKey: ['company', activeCompany, 'settings'],
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
    queryKey: ['company', activeCompany, 'godowns'],
    queryFn: async () => {
      const data = await sajilo.entities.Godown.filter({ is_active: true }, 'name');
      return data || [];
    },
    enabled: !!activeCompany,
    staleTime: 60 * 60 * 1000,
  });
}

export function useDailyMetricsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'dailyMetrics'],
    queryFn: async () => {
      const td = new Date();
      const fd = new Date();
      fd.setMonth(fd.getMonth() - 5);
      fd.setDate(1);
      
      const fromDate = fd.toISOString().slice(0, 10);
      const toDate = td.toISOString().slice(0, 10);
      
      const data = await sajilo.entities.DailyMetricsRollup.filter({}, '-metric_date', 200);
      return (data || []).filter(d => d.metric_date >= fromDate && d.metric_date <= toDate) || [];
    },
    enabled: !!activeCompany,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes for "real-time" dashboard
  });
}

export function useRecentDocumentsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['company', activeCompany, 'recentDocuments'],
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
      queryClient.invalidateQueries({ queryKey: ['company', activeCompany, 'items'] });
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
      queryClient.invalidateQueries({ queryKey: ['company', activeCompany, 'customers'] });
      queryClient.invalidateQueries({ queryKey: ['company', activeCompany, 'vendors'] });
    }
  });
}
