# Development Checklist & Architectural Principles

This document serves as the core set of architectural principles and lessons learned during the development of Sajilo ERP. These standards must be adhered to in all future feature development, refactoring, and database migrations.

## 1. Database & Migrations

- **Roll Forward Strategy:** Never modify or mutate historical SQL migration files once they have been executed in a shared or production environment (e.g., Supabase). If a flaw is discovered in script `155`, create `156` to patch it. This preserves migration checksums and auditable history.
- **Explicit RPC Execution Grants:** Every new or updated PostgreSQL Function (`CREATE OR REPLACE FUNCTION`) intended for frontend access via PostgREST **must** include an explicit execution grant at the bottom of the script:  
  `GRANT EXECUTE ON FUNCTION public.function_name(...) TO authenticated;`
- **Deterministic Row Resolution:** Whenever using `LIMIT 1` to resolve duplicates (such as multiple user role assignments), it must be paired with a deterministic `ORDER BY` clause (e.g., `ORDER BY is_owner DESC, is_tenant_admin DESC`). Failing to do so causes PostgreSQL to return arbitrary rows, leading to unpredictable privilege loss.
- **Aggregating Privileges with `bool_or`:** When flattening or deduplicating JOINs (instead of using `SELECT DISTINCT`), use `GROUP BY` paired with `bool_or(COALESCE(column, false))` to safely elevate and preserve boolean access flags (like `is_owner` or `is_tenant_admin`) across duplicate records.
- **Strict Security Guards:** Always enforce workspace-level validations (e.g., `membership_status = 'active'`) inside PostgreSQL RPCs. Never drop these checks during query optimizations.
- **Avoid PostgREST RPC Ambiguity (`PGRST203`):** Because the Supabase JS client transmits parameters as JSON strings, PostgREST cannot distinguish between `uuid` and `text` data types. Never create overloaded RPC wrappers that share parameter names but differ only in `uuid`/`text` types. Always explicitly `DROP` old signatures to prevent silent execution failures.
- **Zero-RLS Overhead Auth:** Avoid complex computational logic inside RLS policies. Pre-calculate roles and flags (like `is_owner` or `is_tenant_admin`) directly into index-safe junction tables (like `UserCompany`) and authorize natively in RPCs to eliminate RLS performance degradation.

## 2. React SPA & State Management

- **Entity-Driven React Query Keys:** All TanStack Query hooks must explicitly declare their database entity and workspace ID in the query array (e.g., `['Company', companyId, 'Item', 'items']`). This allows for dynamic, predicate-based cache invalidation without maintaining fragile manual dictionaries.
- **Organic Loading vs. Hard Remounts:** Do not use `key={workspaceId}` on top-level layout wrappers (like `<main>`) to force DOM destruction on context switches. Instead, rely on Entity-Driven Query Keys; when the `companyId` changes, React Query will automatically transition the existing mounted components into local `isLoading = true` states without destroying the DOM tree.
- **Guard UI Banners with Loading States:** When rendering UI warnings for "missing" data (e.g., `!activeFiscalYear`), always pair the logic with the corresponding network loading state (`!fyIsLoading`). Failure to do so results in UI flashes and flickering while the data is being fetched.
- **Eliminate Main-Thread Freezing:** Never fetch massive, unpaginated tables (e.g., all items, all partners) in the background during UI blocking events like context switching. Parsing megabytes of JSON freezes the single-threaded V8 engine. Let TanStack Query lazy-load domain data organically as components mount.
- **React Context Referential Equality:** When writing wrapper hooks for React Context (e.g., `usePermissions()`), return the context reference directly rather than returning a new object literal (e.g., `{ hasAccess: context.hasAccess }`). Creating a new object on every render breaks referential equality and will cause infinite loops in downstream `useEffect` dependency arrays.
- **Fail-Closed Route Guard Architecture:** Always design route guards with a "fail-closed" fallback. If a user navigates to an unregistered application route, the fallback must restrict access rather than granting it to any authenticated user.
- **Longest-Prefix Route Matching:** To protect dynamic, nested URLs (e.g., `/sales/invoices/INV-123`), route permission configurations must be evaluated by matching the path prefix. You must sort the configuration array by path length descending (longest first) to ensure deep links are evaluated against their most specific, tightest permission block before hitting broad parent wildcards.
- **Prune Dead UI Elements:** When an action column or set of administrative buttons is guarded by a permission check, ensure the enclosing layout (like the table header "Actions") is also dynamically hidden for unauthorized users to prevent rendering empty columns and broken UX.

## 3. General Refactoring

- **Audit Stale References:** When ripping out custom logic (e.g., replacing an in-memory `queryCache` with React Query), aggressively search the codebase for lingering invocations (e.g., `queryCache.clear()`). Silent JavaScript `ReferenceErrors` in background functions will permanently lock UI loading states.

## 4. Mobile UX & Form Paradigms

- **The Mobile Data-Entry Pivot (Master-Detail):** Never use vertically stacked cards for complex line-item data entry on mobile, as it breaks spatial context and forces endless scrolling. Fork the UI: use a high-density table for desktop, and a compact Summary List paired with a Bottom Sheet (Drawer) for mobile line-item editing.
- **The Modal Pivot (Sticky App Bars):** Do not use floating, absolute-positioned close buttons on mobile dialogs; they conflict with virtual keyboards. Full-screen mobile modals must implement a sticky App Bar (Header) to anchor primary actions (Save, Close).
- **The Mobile Keyboard Trap (`inputMode`):** Never use `pattern="[0-9]*"` for numeric/currency inputs, as it strictly blocks decimal points. Use `inputMode="decimal"` paired with `type="text"` to reliably summon the native numeric keypad on iOS and Android.
- **The iOS Focus Trap & Continuous Entry:** When building continuous "Save & Add Next" loops, do not rely on `setTimeout` to refocus inputs, as this violates iOS Safari's user gesture model. Instead, bind `onPointerDown={(e) => e.preventDefault()}` to the submit button. This prevents the browser from dropping focus, keeping the virtual keyboard permanently open.
- **Drawer Overflow Protection:** When rendering forms inside a bottom drawer, wrap the form body in an `overflow-y-auto` container while keeping the header and footer sticky. This ensures inputs are never trapped beneath the virtual keyboard.
- **Destructive Mobile Actions:** Ensure mobile delete actions meet the 44x44px touch target minimum. Favor instant deletion paired with an "Undo Toast" rather than aggressive, flow-breaking confirmation modals.
- **Physical Device Verification:** Chrome DevTools Device Mode cannot accurately simulate native virtual keyboard DOM shifts or `visualViewport` events. Always verify complex mobile forms on a physical device.
