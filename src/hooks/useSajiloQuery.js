import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';

// --- QUERIES ---

export function useItemsQuery(companyId) {
  const activeCompany = companyId || sajilo.getCompanyId();
  return useQuery({
    queryKey: ['items', activeCompany],
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
    queryKey: ['customers', activeCompany],
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
    queryKey: ['vendors', activeCompany],
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
    queryKey: ['settings', activeCompany],
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
    queryKey: ['godowns', activeCompany],
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
    queryKey: ['dailyMetrics', activeCompany],
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
      queryClient.invalidateQueries({ queryKey: ['items', activeCompany] });
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
      queryClient.invalidateQueries({ queryKey: ['customers', activeCompany] });
      queryClient.invalidateQueries({ queryKey: ['vendors', activeCompany] });
    }
  });
}
