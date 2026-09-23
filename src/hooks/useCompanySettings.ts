import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { DEFAULT_SETTINGS } from '@/store/settingsStore';

/**
 * Canonical hook for reading company-wide configuration.
 *
 * Returns settings grouped by domain for contextual TypeScript autocomplete.
 * Sub-objects are individually memoized to prevent referential equality
 * breakage in useEffect dependency arrays.
 *
 * Complies with: DEVELOPMENT_CHECKLIST §2 — React Context Referential Equality.
 * Never creates a new top-level object literal; returns domain sub-refs directly.
 */
export function useCompanySettings() {
  const { globalSettings, isLoadingAuth } = useAuth();
  const s = { ...DEFAULT_SETTINGS, ...(globalSettings || {}) };

  const finance = useMemo(
    () => ({
      currency: s.currency ?? 'NPR',
      vatRate: s.vat_rate ?? 13,
      taxDefaultBehavior: s.tax_default_behavior ?? 'Exclusive',
      periodLockDate: s.period_lock_date ?? null,
      defaultCostingMethod: s.default_costing_method ?? 'WAC',
      enableMultiCurrency: s.enable_multi_currency === true,
      dateFormat: s.date_format ?? 'AD',
      displayBsDate: s.display_bs_date ?? false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalSettings]
  );

  const inventory = useMemo(
    () => ({
      negativeStockPolicy: s.negative_stock_policy ?? 'STRICT_BLOCK',
      enableBatchExpiry: s.enable_batch_expiry === true,
      overReceiveTolerance: s.over_receive_tolerance_pct ?? 0,
      showRecentTradingHistory: s.show_recent_trading_history !== false,
      enableStockAssembly: s.enable_stock_assembly !== false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalSettings]
  );

  const workflow = useMemo(
    () => ({
      approvalEnabled: s.enable_approvals === true,
      approvalLimit: s.approval_limit_amount ?? 50000,
      voucherNumberingMethod: s.invoice_numbering_method ?? 'Auto',
      duplicateHandling: s.invoice_duplicate_handling ?? 'Block',
      enablePurchaseOrders: s.enable_purchase_orders !== false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalSettings]
  );

  const security = useMemo(
    () => ({
      sessionIdleTimeoutMinutes: s.session_idle_timeout_minutes ?? 0,
      enableStrictAuditLogging: s.enable_strict_audit_logging === true,
      ipWhitelist: s.ip_whitelist ?? [],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [globalSettings]
  );

  return {
    isLoading: isLoadingAuth,
    finance,
    inventory,
    workflow,
    security,
  };
}
