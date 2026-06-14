import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/sajiloClient';

/**
 * Hook to fetch and cache item trading history (Sales & Purchases)
 *
 * Configured with:
 * - staleTime: 300000 (5 minutes of local RAM caching)
 * - refetchOnWindowFocus: false (prevents redundant fetches)
 *
 * The RPC 'get_item_recent_trading_history_rpc' uses INDEX ONLY SCANS on composite B-Tree indexes.
 */
export function useItemTradingHistory(itemId, limit = 5) {
  return useQuery({
    queryKey: ['itemTradingHistory', itemId, limit],
    queryFn: async () => {
      if (!itemId) return [];
      const { data, error } = await supabase.rpc('get_item_recent_trading_history_rpc', {
        p_item_id: itemId,
        p_limit: limit,
      });

      if (error) {
        console.error('Error fetching trading history:', error);
        throw error;
      }
      return data || [];
    },
    enabled: Boolean(itemId),
    staleTime: 300000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
