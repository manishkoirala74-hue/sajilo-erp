import React from 'react';
import { usePermissions } from '@/lib/AuthContext';

/**
 * Defense-in-depth Permission Guard Component
 * Wraps sensitive UI controls or pages and enforces permission checks.
 */
export default function PermissionGuard({ permission, children, fallback = null }) {
  const { can } = usePermissions();

  if (!permission) return <>{children}</>;

  const isAllowed = can(permission);
  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
