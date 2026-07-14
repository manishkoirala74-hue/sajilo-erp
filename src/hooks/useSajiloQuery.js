import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';

// --- QUERIES ---

export function useItemsQuery() {
  return useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const data = await sajilo.entities.Item.filter({ is_active: true }, '-created_at', 1000);
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCustomersQuery() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const data = await sajilo.entities.BusinessPartner.filter({ is_customer: true }, '-created_at', 1000);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useVendorsQuery() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const data = await sajilo.entities.BusinessPartner.filter({ is_vendor: true }, '-created_at', 1000);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const data = await sajilo.entities.CompanySettings.list();
      return data.length > 0 ? data[0] : {};
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useGodownsQuery() {
  return useQuery({
    queryKey: ['godowns'],
    queryFn: async () => {
      const data = await sajilo.entities.Godown.filter({ is_active: true }, 'name');
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useDailyMetricsQuery() {
  return useQuery({
    queryKey: ['dailyMetrics'],
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
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes for "real-time" dashboard
  });
}

// --- MUTATIONS ---

export function useItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, id, payload }) => {
      if (action === 'create') return await sajilo.entities.Item.create(payload);
      if (action === 'update') return await sajilo.entities.Item.update(id, payload);
      if (action === 'delete') return await sajilo.entities.Item.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    }
  });
}

export function usePartnerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, id, payload }) => {
      if (action === 'create') return await sajilo.entities.BusinessPartner.create(payload);
      if (action === 'update') return await sajilo.entities.BusinessPartner.update(id, payload);
      if (action === 'delete') return await sajilo.entities.BusinessPartner.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    }
  });
}
