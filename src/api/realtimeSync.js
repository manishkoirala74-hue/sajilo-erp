import { sajilo } from '@/api/sajiloClient';

/**
 * Subscribes to CompanySettings changes via Realtime.
 * Abstracted to decouple AuthContext from Supabase-specific APIs.
 * Swap this implementation when migrating to a different backend.
 */
export const subscribeToCompanySettings = (companyId, onUpdate) => {
  const channel = sajilo.auth.supabase
    .channel(`company-settings-${companyId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'CompanySettings',
        filter: `company_id=eq.${companyId}`,
      },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();

  return () => sajilo.auth.supabase.removeChannel(channel);
};
