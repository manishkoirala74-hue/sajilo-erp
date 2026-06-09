import { useEffect } from 'react';

/**
 * useSajiloSync - A hook to listen for cache invalidations from sajiloClient
 * which might occur across different browser tabs via BroadcastChannel.
 * 
 * @param {string[]} tablesToWatch - Array of table names to listen for (e.g. ['Item', 'BusinessPartner'])
 * @param {Function} onRefetch - Callback to run when an invalidation occurs
 */
export function useSajiloSync(tablesToWatch, onRefetch) {
  useEffect(() => {
    const handleInvalidate = (event) => {
      const tableName = event.detail;
      if (!tablesToWatch || tablesToWatch.includes(tableName)) {
        onRefetch();
      }
    };

    window.addEventListener('sajilo_invalidate', handleInvalidate);

    return () => {
      window.removeEventListener('sajilo_invalidate', handleInvalidate);
    };
  }, [tablesToWatch, onRefetch]);
}
