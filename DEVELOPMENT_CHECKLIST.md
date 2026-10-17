# Development Checklist & Architectural Principles

This document serves as the core set of architectural principles and lessons learned during the development of Sajilo ERP. These standards must be adhered to in all future feature development, refactoring, and database migrations.

---

## 1. Database & Migrations

- **Roll Forward Strategy:** Never modify or mutate historical SQL migration files once they have been executed in a shared or production environment (e.g., Supabase). If a flaw is discovered in script `155`, create `156` to patch it. This preserves migration checksums and auditable history.
- **Mandatory SQL Rollback Scripts:** Whenever a SQL script is created or updated for schema changes, migrations, or RPC modifications, you must simultaneously create or update a corresponding rollback script (`*_rollback.sql`) to ensure all database changes can be safely reverted.
- **Explicit RPC Execution Grants:** Every new or updated PostgreSQL Function (`CREATE OR REPLACE FUNCTION`) intended for frontend access via PostgREST **must** include an explicit execution grant at the bottom of the script:  
  `GRANT EXECUTE ON FUNCTION public.function_name(...) TO authenticated, service_role;`
- **Avoid PostgREST RPC Ambiguity (`42P13` & `PGRST203`):** Because the Supabase JS client transmits parameters as JSON strings, PostgREST cannot distinguish between `uuid` and `text` data types. Never create overloaded RPC wrappers that share parameter names but differ only in `uuid`/`text` types. Always explicitly include `DROP FUNCTION IF EXISTS public.function_name(...);` before recreating functions to prevent PostgreSQL `42P13: cannot change return type of existing function` crashes.
- **Deterministic Row Resolution:** Whenever using `LIMIT 1` to resolve duplicates (such as multiple user role assignments), it must be paired with a deterministic `ORDER BY` clause (e.g., `ORDER BY is_owner DESC, is_tenant_admin DESC`). Failing to do so causes PostgreSQL to return arbitrary rows, leading to unpredictable privilege loss.
- **Deterministic Pessimistic Row Locking (`ORDER BY item_id ASC FOR UPDATE`):** When locking multiple inventory rows or item records across concurrent transactions (e.g., assemblies, bulk transfers, batch receipts), **always sort keys deterministically in ascending order** (`ORDER BY item_id ASC FOR UPDATE`). Divergent lock acquisition orders across concurrent transactions create fatal PostgreSQL deadlocks (`40P01: deadlock detected`) that kill active transactions.
- **Scalar Variable Typing in Sufficiency Checks:** Avoid selecting single columns into untyped `RECORD` variables when verifying stock availability. Use explicitly declared scalar variables (e.g., `v_cur_qty NUMERIC := 0;`) and evaluate:
  ```sql
  SELECT current_qty INTO v_cur_qty FROM public."CurrentStock" WHERE ...;
  IF NOT FOUND OR v_cur_qty < v_line.quantity OR v_cur_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Item "%" only has % available...', v_line.item_name, COALESCE(v_cur_qty, 0);
  END IF;
  ```
- **Native Document Sequence Fallback in Creation RPCs:** In header creation RPCs (`create_or_update_*`), if `p_voucher_no` is `NULL`, empty, or `'AUTO'`, PostgreSQL must automatically generate the official voucher number via `public.get_next_voucher_number(p_company_id, p_doc_type, p_date)`. Never generate ad-hoc client-side timestamp strings.
- **Aggregating Privileges with `bool_or`:** When flattening or deduplicating JOINs (instead of using `SELECT DISTINCT`), use `GROUP BY` paired with `bool_or(COALESCE(column, false))` to safely elevate and preserve boolean access flags (like `is_owner` or `is_tenant_admin`) across duplicate records.
- **Strict Security Guards:** Always enforce workspace-level validations (e.g., `membership_status = 'active'`) inside PostgreSQL RPCs. Never drop these checks during query optimizations.
- **Zero-RLS Overhead Auth:** Avoid complex computational logic inside RLS policies. Pre-calculate roles and flags (like `is_owner` or `is_tenant_admin`) directly into index-safe junction tables (like `UserCompany`) and authorize natively in RPCs to eliminate RLS performance degradation.
- **Schema-to-Client Store Symmetry (The `_id` and `_name` Column Parity Rule):** In settings tables (like `CompanySettings`), whenever foreign key relationships store both an ID (`gl_*_id UUID`) and a human-readable display string (`gl_*_name TEXT`), both columns must be explicitly added to SQL migrations, `supabase_schema.sql`, entity schemas (`.jsonc`), and client state stores (`DEFAULT_SETTINGS`). Omitting the display column causes PostgREST to abort entire update payloads with `column does not exist`.
- **Service Role Security Guard Pattern in PL/pgSQL (`IF auth.uid() IS NOT NULL`):** Unconditionally checking `user_id = auth.uid()` inside stored procedures and RPCs will abort legitimate executions by automated cron jobs, Vercel warming tasks (`/api/warm-db.js`), administrative migration scripts, and backend service roles where `auth.uid()` is null. Always guard identity checks to enforce tenancy for interactive users while permitting elevated administrative callers:
  ```sql
  IF auth.uid() IS NOT NULL THEN
      IF NOT EXISTS (
          SELECT 1 FROM public."UserCompany"
          WHERE company_id = p_company_id AND user_id = auth.uid() AND membership_status = 'active'
      ) THEN
          RAISE EXCEPTION 'Access denied: User is not an active member of this company.';
      END IF;
  END IF;
  ```
- **Relational vs. JSONB Schema Verification & Line Item Naming Law:** Never assume database table naming conventions. In Sajilo ERP:
  - Invoice line items are named `SalesInvoiceLine` and `PurchaseInvoiceLine` (never `SalesInvoiceItem` or `PurchaseInvoiceItem`).
  - Financial vouchers store journal ledger lines directly within embedded JSONB (`FinancialVoucher.entries`), with no relational line table.
  Attempting to index or query non-existent relations crashes migrations with PostgreSQL `42P01: relation does not exist`. Always verify exact table names against `supabase_schema.sql` before authoring SQL.
- **Runtime Subquery Column Validation (`42703: column does not exist`):** PostgreSQL evaluates subquery and CTE columns dynamically at query runtime. For transactional document headers, always verify exact column naming against schema definitions:
  - Invoices use `invoice_number`, `grand_total`, `invoice_date`, and `created_at` (never `voucher_no`, `net_total`, or `created_date`).
  - Financial vouchers use `voucher_no`, `voucher_date`, `total_amount`, and `created_at`.
  Referencing mismatched or assumed column aliases inside analytical subqueries causes catastrophic query failures (`42703: column does not exist`).
- **B-Tree Composite Indexing Law (`company_id, ...`):** Single-column indexes on high-cardinality fields (such as `created_at` or `status`) are largely ineffective in multi-tenant architectures because every operational query filters first by `company_id`. Always deploy composite B-Tree indexes:
  - **Status & Lifecycle Filtering:** `CREATE INDEX IF NOT EXISTS idx_*_company_status ON public."<Table>"(company_id, status);`
  - **Chronological Feeds & Date Sorting:** `CREATE INDEX IF NOT EXISTS idx_*_company_date ON public."<Table>"(company_id, <date_column> DESC);`
  - **Foreign-Key Parent-Child Joins:** `CREATE INDEX IF NOT EXISTS idx_*line_company_parent ON public."<LineTable>"(company_id, <parent_id>);`
  - **Active Record Lookups:** `CREATE INDEX IF NOT EXISTS idx_*_company_active ON public."<MasterTable>"(company_id, is_active);`
- **`Item.item_name` Column Parity Law in Stock Triggers:** In table `"Item"`, the column name is `item_name`, not `name`. Whenever database triggers or functions (such as `update_current_stock()` on `InventoryLedger`) raise policy exceptions referencing items (e.g., `Negative stock not allowed for item %`), always query `SELECT item_name INTO v_item_name FROM "Item" WHERE id = NEW.item_id;`. Querying `SELECT name INTO v_item_name` crashes PostgreSQL with runtime error `42703: column "name" does not exist`, completely masking the underlying negative stock violation and crashing transaction execution.
- **Administrative Cleanup Under Anti-Tamper & Stock Triggers:** `GeneralLedgerJournal` enforces append-only immutability via `trg_gl_journal_anti_tamper_del`, which throws `Append-Only Ledger Violation: Cannot delete a Posted journal entry.` on hard `DELETE`. Similarly, `InventoryLedger` fires `trg_update_current_stock` on `DELETE`. Whenever administrative data-correction migrations or sweepers purge corrupted or orphaned test records, you must wrap the cleanup block in trigger-suspension and maintenance mode:
  ```sql
  SET LOCAL sajilo.maintenance_mode = 'true';
  ALTER TABLE public."GeneralLedgerJournal" DISABLE TRIGGER trg_gl_journal_anti_tamper_del;
  ALTER TABLE public."InventoryLedger" DISABLE TRIGGER trg_update_current_stock;
  -- [Perform cleanup and atomic reconciliation]
  ALTER TABLE public."InventoryLedger" ENABLE TRIGGER trg_update_current_stock;
  ALTER TABLE public."GeneralLedgerJournal" ENABLE TRIGGER trg_gl_journal_anti_tamper_del;
  SET LOCAL sajilo.maintenance_mode = 'false';
  ```

---

## 2. React SPA & State Management

- **Framework Client API Parity (`get` vs `getById`):** Dynamic entity proxies (like `sajilo.entities[tableName]`) must expose both `.get(id)` and `.getById(id)` as identical, transparent aliases. Calling an unmapped alias throws `TypeError: ... is not a function`, which catches silently in form loaders, displays generic toasts, and leaves forms completely blank.
- **Safe Limit Sanitization in Query Proxies:** Always sanitize `limit` arguments in framework list/filter wrappers:
  ```javascript
  const safeLimit = (typeof limit === 'number' && limit > 0) ? limit : 1000;
  ```
  Passing non-numeric falsy values (like `limit=false` or strings) causes PostgREST to generate malformed query strings (`?limit=false`) that crash queries with 400 Bad Request.
- **Entity-Driven React Query Keys:** All TanStack Query hooks must explicitly declare their database entity and workspace ID in the query array (e.g., `['Company', companyId, 'Item', 'items']`). This allows for dynamic, predicate-based cache invalidation without maintaining fragile manual dictionaries.
- **Organic Loading vs. Hard Remounts:** Do not use `key={workspaceId}` on top-level layout wrappers (like `<main>`) to force DOM destruction on context switches. Instead, rely on Entity-Driven Query Keys; when the `companyId` changes, React Query will automatically transition the existing mounted components into local `isLoading = true` states without destroying the DOM tree.
- **Guard UI Banners with Loading States:** When rendering UI warnings for "missing" data (e.g., `!activeFiscalYear`), always pair the logic with the corresponding network loading state (`!fyIsLoading`). Failure to do so results in UI flashes and flickering while the data is being fetched.
- **Eliminate Main-Thread Freezing:** Never fetch massive, unpaginated tables (e.g., all items, all partners) in the background during UI blocking events like context switching. Parsing megabytes of JSON freezes the single-threaded V8 engine. Let TanStack Query lazy-load domain data organically as components mount.
- **React Context Referential Equality:** When writing wrapper hooks for React Context (e.g., `usePermissions()`), return the context reference directly rather than returning a new object literal (e.g., `{ hasAccess: context.hasAccess }`). Creating a new object on every render breaks referential equality and will cause infinite loops in downstream `useEffect` dependency arrays.
- **Fail-Closed Route Guard Architecture:** Always design route guards with a "fail-closed" fallback. If a user navigates to an unregistered application route, the fallback must restrict access rather than granting it to any authenticated user.
- **Longest-Prefix Route Matching:** To protect dynamic, nested URLs (e.g., `/sales/invoices/INV-123`), route permission configurations must be evaluated by matching the path prefix. Sort the configuration array by path length descending (longest first) to ensure deep links are evaluated against their most specific, tightest permission block before hitting broad parent wildcards.
- **Prune Dead UI Elements:** When an action column or set of administrative buttons is guarded by a permission check, ensure the enclosing layout (like the table header "Actions") is also dynamically hidden for unauthorized users to prevent rendering empty columns and broken UX.
- **Unimported Conditional JSX Identifiers (The Edge-Case Warning Trap):** Never render conditional JSX elements (such as `<AlertTriangle />` in a configuration warning banner or error alert) without verifying the component is explicitly imported at module scope. Because edge-case conditions (e.g. `isMissingGL`) are false during typical development flows, unimported icons bypass visual testing and throw fatal runtime `ReferenceError` crashes in production when the edge-case is triggered. Always run comprehensive project-wide linting and build checks (`npm run build`) to catch undeclared JSX symbols.
- **Module-Scope React Hook Import Law:** Never assume React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`) are ambiently accessible or injected globally by the bundler. In Vite and standard ES module environments, using any hook without explicitly declaring `import { useState, ... } from 'react';` at module scope causes immediate runtime crashes (`ReferenceError: useState is not defined`) as soon as the component mounts. Always declare all hook imports explicitly at module scope and run `npm run build` to verify clean module resolution.
- **Consolidated Query Destructuring & Derived In-Memory State:** When transitioning components from multi-query waterfalls to consolidated RPC payloads (e.g., `get_dashboard_analytics_payload`):
  1. **Safe Destructuring with Default Fallbacks:** Never destructure RPC results without fallback defaults (e.g., `const pendingApprovals = analytics?.pending_approvals || [];`). Omitting fallback declarations throws fatal runtime `ReferenceError: <variable> is not defined` when rendering template loops.
  2. **In-Memory Derivation over Secondary Queries:** For secondary UI representations (such as mobile activity feeds or combined transaction carousels like `recentDocs`), derive the combined dataset in-memory using `useMemo` from primary RPC collections (`recentSales` and `recentBills`) rather than executing redundant network queries.

---

## 3. General Refactoring

- **Audit Stale References:** When ripping out custom logic (e.g., replacing an in-memory `queryCache` with React Query), aggressively search the codebase for lingering invocations (e.g., `queryCache.clear()`). Silent JavaScript `ReferenceErrors` in background functions will permanently lock UI loading states.

---

## 4. Mobile UX & Form Paradigms

- **The Mobile Data-Entry Pivot (Master-Detail):** Never use vertically stacked cards for complex line-item data entry on mobile, as it breaks spatial context and forces endless scrolling. Fork the UI: use a high-density table for desktop, and a compact Summary List paired with a Bottom Sheet (Drawer) for mobile line-item editing.
- **The Modal Pivot (Sticky App Bars):** Do not use floating, absolute-positioned close buttons on mobile dialogs; they conflict with virtual keyboards. Full-screen mobile modals must implement a sticky App Bar (Header) to anchor primary actions (Save, Close).
- **The Mobile Keyboard Trap (`inputMode`):** Never use `pattern="[0-9]*"` for numeric/currency inputs, as it strictly blocks decimal points. Use `inputMode="decimal"` paired with `type="text"` to reliably summon the native numeric keypad on iOS and Android.
- **The iOS Focus Trap & Continuous Entry:** When building continuous "Save & Add Next" loops, do not rely on `setTimeout` to refocus inputs, as this violates iOS Safari's user gesture model. Instead, bind `onPointerDown={(e) => e.preventDefault()}` to the submit button. This prevents the browser from dropping focus, keeping the virtual keyboard permanently open.
- **Drawer Overflow Protection:** When rendering forms inside a bottom drawer, wrap the form body in an `overflow-y-auto` container while keeping the header and footer sticky. This ensures inputs are never trapped beneath the virtual keyboard.
- **Destructive Mobile Actions:** Ensure mobile delete actions meet the 44x44px touch target minimum. Favor instant deletion paired with an "Undo Toast" rather than aggressive, flow-breaking confirmation modals.
- **Physical Device Verification:** Chrome DevTools Device Mode cannot accurately simulate native virtual keyboard DOM shifts or `visualViewport` events. Always verify complex mobile forms on a physical device.
- **The Multi-Column Data Trap (Sticky Matrix):** When rendering wide data tables on mobile, applying `overflow-x-auto` to the wrapper isn't enough; the first column (e.g., Account Name) must be frozen (`sticky left-0`) with a subtle drop shadow to maintain row context during horizontal scrolling.
- **The Top-Left Intersection (Z-Index Hierarchy):** When combining a sticky header (`top-0 z-10`) with a sticky first column (`left-0 z-20`), the intersecting top-left cell must have the highest z-index (`top-0 left-0 z-30`) to prevent data cells from bleeding through during diagonal scrolling.
- **Z-Index Portal Collisions:** Never arbitrarily bump a full-screen modal's z-index (e.g., to `z-[100]`) without accounting for UI library Portals. Shadcn/Radix tooltips, popovers, and Select dropdowns default to `z-50`. Modals should sit beneath `z-50` (e.g., `z-40`) to ensure dropdowns don't open invisibly underneath them.
- **App Bar Action Overflow:** Full-screen mobile modals must keep their App Bars strictly organized. Do not clutter the header. Keep a Close button on the left, a truncated Title in the center, and hide all secondary actions (Excel, Print) inside an ellipsis (...) dropdown on the far right.
- **Swipe Affordances:** For horizontally scrollable navigation pills, use visual cues like a CSS mask (`[mask-image:linear-gradient(...)]`) or deliberate padding (`pr-8`) so the last item peeks out, providing an intuitive cue that the container is swipeable.
- **iOS Safe Area Insets:** For any `100dvh` container, apply `pb-[env(safe-area-inset-bottom)]` to the main scroll container to prevent the iOS Home Indicator from covering the bottom-most clickable elements or data rows.
- **Table Accessibility & Keyboard Navigation:** Always add `tabIndex={0}`, `role="region"`, and an `aria-label` to horizontally scrollable table wrappers so they can be navigated via keyboard. Ensure `scope="col"` and `scope="row"` are applied to headers and sticky axes so screen readers announce coordinates correctly.

---

## 5. Ledger Governance & UI Consistency

- **The Draft-First State Machine Law:** Never permit direct creation of documents in `Completed` or `Posted` status. Transaction forms must always save headers and line items as `Draft` first. Finalization (stock deduction, GL posting) must be an explicit secondary atomic step. If an atomic completion RPC fails, the document safely remains an editable `Draft` instead of being permanently locked in an orphaned state.
- **The Inventory Ledger WAC Audit Rule (`wac_at_post` Parity):** Every inventory movement written to `InventoryLedger` must explicitly record `wac_at_post`. Reporting engines (such as `get_stock_ledger_statement_rpc`) evaluate running valuation as `rolling_qty * il.wac_at_post`. Omitting this field leaves it at `0`, causing inventory reports to show a zero NPR value balance despite positive physical stock.
- **Append-Only Ledger Principle:** Financial journals (`GeneralLedgerJournal`) must never be hard-deleted if they are `Posted`. Reversals must be executed by creating explicit contra-entries. Database functions or RPCs must never issue raw `DELETE` commands for posted ledger entries.
- **Two-Way Reversal Architecture & Physical Depletion Guards:** Every operational document that commits stock or GL entries must have an atomic reversal counterpart (`cancel_*` RPC and UI triggers). Before permitting reversal, the kernel must execute a *Physical Depletion Guard* verifying that produced/received goods have not already been consumed or sold (`CurrentStock.current_qty >= produced_qty`). Reversals must restore consumed stock, decrement produced stock, post `-REV` inventory audit rows, and generate balanced contra-journals via `rpc_reverse_gl_journal`.
- **Direct Table-Row Reversals vs Modal Drill-Downs:** Users should not be forced to open a read-only modal to cancel a transaction. Provide a direct "Reverse" action button on `Completed` rows in the DataTable (paired with a reason prompt modal) alongside the view modal trigger.
- **Strict UI State Machines & RBAC:** Action buttons in the UI must strictly map to the document's state and proper RBAC (Role-Based Access Control) permissions. For example, "Delete" operations are only for Draft items governed by `hasAccess`, while "Reverse" operations apply to Posted items and require elevated permissions like `checkPermissionKey`.
- **Audit Trails for Reversals:** Any reversal or cancellation action must require an explicit reason from the user. This reason must be appended to the transaction's narration/remarks for strict audit visibility.
- **Data Normalization & Adapters:** When building global UI components (like a `GlobalVoucherDrawer`), data normalization adapters must rigorously support the specific schemas of all entity types being passed in (e.g., handling both `debit`/`credit` and `debit_amount`/`credit_amount`, ensuring fields like `voucher_date` and `contact_name` are part of fallback chains).
- **Field Normalization for Remarks:** When extracting remarks, notes, or descriptions for global views or PDF generation, explicitly check all alias fields across different domains (e.g., `data.remarks || data.notes || data.narration || data.description`) to ensure metadata is never silently dropped.
- **Line-Level vs Header-Level Narrations:** Recognize that some entities (like Invoices) store remarks at the document header, while others (like Financial Journals) store critical narrations at the line-item level. Generic table views and SQL data fetchers must explicitly `SELECT` and render line-level `description` fields in their matrix views, avoiding the pitfall of only fetching accounts and amounts.
- **Sub-Ledger vs. Entity-Type Dual-Entry Rule:** Document-level entities (`entity_type = 'Customer'`) and General Ledger lines are decoupled in voucher transactions. Financial Vouchers post directly to the sub-ledger `ChartOfAccount` (`receivable_account_id` / `payable_account_id`) with `entity_type = null`. Ledger aggregations must never filter by `entity_type` alone.

---

## 6. V9 Architecture & Transaction Form Learnings

- **Data Grid Performance & React Rendering:** Large dynamic arrays (like invoice line items) must not cause full component tree re-renders on every keystroke. Always extract rows into separate components and wrap them in `React.memo` with deep-equality checks for high-frequency data entry grids.
- **Stale-Closure Bugs & Callbacks:** Avoid stale closures in list mutations (e.g., undo/delete operations). When child components trigger actions that modify arrays without access to functional state updaters, shadow the value array in a `useRef(value)` to ensure stable `useCallback` closures without infinite re-render loops.
- **Keyboard Navigation & DOM Performance:** Do not attach hundreds of `onKeyDown` listeners to individual inputs in a data grid (causes memory bloat and lag). Use a single delegated event listener on the parent container (e.g., `<tbody onKeyDown={...}>`) to handle Excel-style keyboard traversal, manipulating DOM focus directly via structural data attributes like `data-row` and `data-col`.
- **Cross-Tenant Data Leaks & Security:** When users open multiple tabs and switch workspaces/tenants, background forms might mistakenly post data to the wrong tenant. Wrap all transaction forms in a strict guard component (e.g., `<DocumentGuard>`) that uses `key={activeCompany.id}` to explicitly force a full React unmount and remount if the active tenant changes mid-session.
- **Layout Reflows & Scrollbars:** Avoid CSS utility classes like `min-w-max` on tables that artificially force horizontal scrollbars on standard 1080p monitors. Use `w-full table-fixed` combined with explicit column widths to let tables scale natively. Keep sidebars decoupled from the main layout flow (e.g., as a `z-50` absolute overlay) to prevent transaction grids from violently reflowing when the sidebar expands or collapses.
- **Dropdown Component Integrity & Virtualization:** Avoid spreading `...props` arbitrarily onto DOM elements inside reusable components like `<SearchableSelect>`. Explicitly destructure known props to prevent injecting massive JSON objects or arrays into DOM attributes, which causes severe performance degradation and React unknown-prop warnings. Furthermore, never artificially slice large option arrays (e.g., `options.slice(0, 100)`) as a band-aid for DOM lag; use headless virtualization (`@tanstack/react-virtual` in `ERPCombobox`) to render thousands of items smoothly without dropping frames.

---

## 7. Core Development Lessons (Post-Cash/Bank Architecture)

- **Taxonomy Separation (Column Overloading):** Never overload a single column with dual meanings. In financial systems, double-entry classification (e.g., `ChartOfAccount.account_type` = 'Asset') is fundamentally different from treasury classification (e.g., 'Cash' or 'Bank'). Relying on one column for both causes invisible bugs. Use dedicated boolean flags (e.g., `is_cash_account`) or separate structural columns for secondary taxonomies.
- **Native Type Joins & Prior Schema State:** Before proposing structural schema changes (like changing TEXT to UUID), always verify if prior migrations have already executed this fix. Attempting to run `ALTER COLUMN` on an already-converted column aborts migrations. Furthermore, always ensure JOINs strictly use `UUID = UUID` without casting (`::uuid`) so PostgreSQL can effectively utilize B-Tree and Foreign Key indexes.
- **Defensive Database Filtering:** Even if application logic currently guarantees a specific state (e.g., all journals are instantly 'Posted' synchronously), structural aggregations and RPCs must include defensive filters (e.g., `AND status = 'Posted'`). This protects dashboard aggregations against future feature additions like Drafts or Approvals.
- **Robust Backfill Design:** Data backfills must account for legacy and manual data entry. Do not rely solely on system flags (e.g., `is_system_account = true`) to identify records if users could have manually created equivalent records before those flags were standardized. Use primary identifiers (codes/names) as fallbacks (e.g., `account_code = '1110' OR account_name = 'Cash in Hand'`).
- **Rollback Fidelity (Exact Prior State):** Rollback scripts for RPCs or Views must restore the *exact previous code state*, even if that prior state contained bugs. Rollbacks are state snapshots, not logical undo buttons. Reverting an RPC means replacing it with its exact previous `CREATE OR REPLACE FUNCTION` body, not just leaving it as-is.

---

## 8. Command Palette & Search Architecture Learnings

- **Source of Truth for Routing (No Hardcoded Paths):** When building centralized navigation configurations (like a report registry or search index), ensure all URL strings exactly match the path defined in the application's actual router (e.g., `App.jsx`). Hardcoded mismatches cause silent 404 errors when navigated via shortcuts like Quick Search.
- **Polymorphic Action Dispatching (navPath vs path):** Never assume all search palette items have a plain route `path`. Reports and modal tools may specify dynamic parameters (e.g., `navPath: '/reports?report=day_book'`) or open modals directly (`type: 'MODAL'`). The navigation dispatcher must resolve `target: item.navPath || item.path` and always close the command dialog (`onOpenChange?.(false)`) before or upon navigating to prevent stuck overlay states and no-ops.
- **Unique Item IDs in CMDK:** When aggregating multiple catalogs (pages, reports, settings, quick-actions) into CMDK lists, always assign globally unique identifiers (e.g., `REP_${item.id || item.navPath}`, `SET_${item.path}`). Item ID collisions cause CMDK's internal value indexer to select the wrong item or fail silently on <kbd>Enter</kbd>.
- **CMDK Library Internal Filtering:** When using libraries like CMDK for search palettes, do not override the filter prop with closures that depend on React render-cycle state (e.g., `cleanSearch`). Use the library's internal searchStr argument natively inside the filter function. This ensures real-time, 60fps reactivity and prevents race conditions and keystroke lag.
- **Dataset Deduplication vs Active Search:** If a search palette combines multiple data sources (e.g., Quick Actions and Navigation) and deduplicates items across them, ensure deduplication logic only applies to the default (empty) search state. Deduplicating items while the user is actively searching can cause valid results to silently disappear if they are hidden from the default view.
- **Browser Shortcut Hijacking (Ctrl+K):** Global keyboard event listeners intended to override native browser shortcuts (like Chrome's omnibox focus on Ctrl+K) must use case-insensitive matching (`e.key.toLowerCase() === 'k'`). This guarantees `e.preventDefault()` fires correctly regardless of CapsLock state or keyboard configurations.
- **RBAC Filtering in Discovery Menus:** Feature flags and permission checks (`canAccessRoute`, `hasPermission`) must be strictly applied to all discovery endpoints like Command Palettes, Settings search, and Quick Actions—not just the primary Sidebar navigation. Unfiltered discovery lists allow users to bypass navigation UI and hit unauthorized routes directly.

---

## 9. HR, Attendance, & Payroll Architecture (Dual-Date)

- **Dual Calendar Systems (AD/BS):** Always store the source of truth as an AD `DATE` in PostgreSQL to prevent UTC timezone drift errors (e.g., `new Date().toISOString()` shifting local midnight to the previous day). Compute and render localized calendars (like Bikram Sambat) dynamically at the client-side edge, or via deterministic mapping tables.
- **Matrix Bulk Uploads vs Flat Storage:** While relational databases demand flat records (Employee, Date, Status), never force end-users to input data this way. Use Matrix formats (Rows = Entities, Columns = Days) for Excel templates. Use defensive client-side unpivoting (like ExcelJS) to handle Excel time-fractions (multiplying fractions by 24) and regex sanitization before transmitting flat JSON arrays to bulk RPCs.
- **Draft → Post Financial Workflows:** Never execute complex financial calculations and GL journal postings in a single synchronous action. Always implement a two-step state machine: 1) generate a `Draft` (calculating LOP and generating payslips), and 2) an explicit `Post` action to commit the GL journals and lock the period.
- **GiST Exclusion Constraints:** When enforcing non-overlapping date ranges per tenant (e.g., preventing two Payroll Runs covering the same dates for the same company), use `EXCLUDE USING gist (company_id WITH =, daterange(start, end, '[]') WITH &&)`. Note: Comparing `UUID`s inside a GiST index requires explicitly enabling the `btree_gist` extension.
- **Bulletproof State Locking via Triggers:** Do not rely on UI flags or client-side checks to prevent tampering with finalized data. Use database triggers (`BEFORE INSERT OR UPDATE OR DELETE`) to cross-reference related records (e.g., blocking `AttendanceRecord` changes if the overlapping `PayrollRun` is `Posted`).

---

## 10. PDF Generation & Export Architecture Learnings

- **Strict Data-Sanitization Firewalls:** Never deeply couple vector PDF engines (like `jspdf-autotable`) directly to React DOM components or raw internal arrays (`['Label', '', '']`). Always construct a dedicated "Export Mapper" utility that sanitizes UI state, enforces null fallbacks, calculates mathematical layout padding, and outputs structured engine-native configurations (e.g., `[{ content: 'Label', colSpan: 2, styles: {...} }]`).
- **Accounting Typography Consistency:** Standard financial exports require absolute semantic precision. Enforce a unified visual language globally via shared constants (`src/constants/pdfStyles.js`), ensuring exact conventions like standard double-underlining for totals (`lineWidth: { top: 0.5, bottom: 1.5 }`), red negative text colors (`[220, 38, 38]`), and locking critical financial columns to exact point widths (e.g., 80pt) across all related statements.
- **Synchronous Engine Traps (jsPDF):** `jsPDF.addImage()` is strictly synchronous and will crash or blank out if handed raw internet URLs inside rendering loops. All external assets (such as corporate logos) must be asynchronously pre-fetched, converted to Base64 blobs, and cached in the client-side state store (`settingsStore`) **before** invoking the PDF generator to ensure zero-latency exports.
- **Table Geometry & Multi-Page Collisions:** When rendering recurring corporate headers and audit footers using multi-page lifecycle hooks (`didDrawPage`), you must explicitly define protective bounding boxes for the table content (`margin: { top: 140, bottom: 60 }`, `startY: 140`). Otherwise, jspdf-autotable will forcefully paint rows directly over the custom headers on page 2 and beyond.
- **Asynchronous UX Loading States:** Large exports or exports requiring asset pre-fetching (Base64 logos) block the main thread. Always implement local `isExporting` UI loading spinners on action buttons and wrap PDF generation functions in `try/catch/finally` blocks to safely release the thread on failure.
- **Top-Level ESM Restrictions:** Remember that ECMAScript import statements can only be declared at the top-level scope of a module. Never conditionally inject `import { ... }` blocks inside functions or if statements, as it will trigger a fatal `SyntaxError: Unexpected token '{'` when the bundle evaluates in the browser.

---

## 11. Financial Report Architecture, Hierarchical Exports & Audit Governance

- **ExcelJS Hierarchy & Native Outlining (`outlineLevel`):** In multi-level financial reports (Income Statement / P&L, Balance Sheet, Trial Balance), never flatten the data tree by prepending manual whitespace indentation (`"    Operating Expense"`) or merging text rows. Excel natively supports row outlining: recursively walk the hierarchy tree and set `row.outlineLevel = 0 | 1 | 2`, pairing with worksheet configuration `ws.properties.outlineProperties = { summaryBelow: false }`. This allows accountants to expand and collapse report groups directly inside Microsoft Excel and LibreOffice Calc while maintaining formula and pivot integrity.
- **Accounting Number Formatting & Underlines in Excel:** Always transmit raw numerical values (`Number(val || 0)`) to ExcelJS cells rather than pre-formatted strings containing currency prefixes (`"NPR 1,500.00"`). Excel treats string values as text, breaking `=SUM()` calculations. Use explicit cell number formats (`cell.numFmt = '#,##0.00;(#,##0.00);"-"'`). Apply standard double-underlines on final accounting totals (`border: { top: { style: 'thin' }, bottom: { style: 'double' } }`).
- **Single Source of Truth for Reports Discovery (`reportsRegistry.js`):** Never maintain fragmented, hardcoded arrays of reports across navigation sidebars, page cards, and command palettes. Maintain a centralized registry (`src/config/reportsRegistry.js`) defining every report's unique ID, title, description, category, navigation path or query parameter, icon, and searchable keywords. New reports added to this registry must automatically index into search comboboxes, category grids, and permission guards without touching navigation components.
- **Cross-Route Navigation for Modal Reports:** When search palettes or global headers link to modal-based reports (`/reports?report=profit_loss`) from external sub-routes (such as `/reports/accounting/day-book`), the navigation dispatcher must branch: navigate directly for routed pages, or route to `/reports?report=id` for modal reports. The modal shell (`ReportViewer.jsx`) must actively listen to URL search parameters (`searchParams.get('report')`) in `useEffect` so that the modal mounts, fetches data, and displays cleanly without requiring a full page refresh.
- **Reusable Asynchronous Export Toolbars (`ReportExportActions`):** Client-side generation of complex spreadsheets or vector PDFs takes 1–4 seconds. Never rely on unadorned `<button onClick={...}>` elements. Use a standardized toolbar (`<ReportExportActions onExportExcel={...} onExportPdf={...} />`) that accepts asynchronous promises, manages isolated loading spinners (`<Loader2 className="animate-spin" />`), disables buttons during processing to prevent rapid double-clicks, surfaces toast notifications on completion, and applies `print:hidden` to ensure export buttons never print onto physical paper or PDFs.
- **Audit Log Chain-of-Custody Compliance:** In regulated ERP environments, spreadsheet exports of system audit trails, communication outbox logs, or deletion records lack legal provenance unless stamped. Any export of an Audit Trail or User Activity Log **must** inject an immutable metadata block at the top of the worksheet (`exportAuditLogXLSX`):
  1. Exported By: Full Name and Email of the logged-in user (`currentUser`).
  2. Exact UTC ISO Timestamp and local system timestamp.
  3. Active audit filter date range (`From -> To`).
  4. Confidentiality and legal disclaimer watermark: *"CONFIDENTIAL AUDIT LOG — Official record for compliance, regulatory inspection, and internal controls."*
- **Elimination of Silent No-Op Stubs:** Never commit placeholder stubs (such as `onExport={() => {}}` or `<Button>Export CSV</Button>` without an `onClick` handler) into production code. Silent buttons create severe user frustration. All tabular report views must either pass an active export callback or clearly display disabled state with an explanatory tooltip or empty-data notification toast.
- **JSX Multi-Element Conditional Branching:** When updating conditional branches in React (e.g. `loading ? <Spinner /> : (<Toolbar /> <Card />)`), never leave adjacent sibling elements unparented. In JSX, every branch of a conditional expression must evaluate to a single root element. Always wrap multiple sibling elements in a semantic wrapper (`<div className="space-y-3">...</div>`) or React fragment (`<>...</>`) to prevent esbuild compilation crashes.

---

## 12. Enterprise Navigation, Field-Selection, Dropdowns & Keyboard Architecture (The 5-Pillar Standard)

- **Navigation Hitbox Stability & Hover Expansion Physics:** Never allow interactive navigation menus to change width on hover (e.g., expanding from 72px to 256px over 300ms) without locking user preference. When the container width shifts while the user clicks, the mouse coordinates at `mousedown` and `mouseup` diverge, causing the browser to cancel the click and forcing users to double-click. Default navigation sidebars to `isPinned: true` on desktop screens.
- **Zero Nested Interactive Elements (HTML5 Spec Compliance):** Never nest `<button>` inside `<Link>` or `<a>` tags (such as a star-favorite button inside a navigation link). Browsers and React synthesize conflicting click events when interactive elements are nested, resulting in swallowed clicks and broken routing. Always decouple them as flex siblings:
  ```jsx
  <div className="flex items-center ...">
    <Link to={item.path} className="flex-1 ...">{item.label}</Link>
    <button type="button" onClick={handleFavorite} className="p-1 ..."><Star /></button>
  </div>
  ```
- **Radix UI Tooltip Event Cancellation:** Radix UI's `<Tooltip>` attaches a `DismissableLayer` that intercepts and consumes `pointerdown` events to dismiss tooltips on interaction. When a navigation sidebar is expanded and labels are fully visible, conditionally bypass `<Tooltip>` rendering entirely so pointer events are never intercepted or swallowed.
- **The CMDK Portal Detachment Bug:** Never wrap `<Command>` around a trigger button while rendering `<CommandList>` inside a detached Radix `PopoverContent` Portal (`document.body`). CMDK relies on querying its root DOM subtree (`root.querySelectorAll('[cmdk-item]')`). Because portals render into `document.body` outside the CMDK root, CMDK finds 0 items, making ArrowUp/ArrowDown and Enter keys completely non-functional. Dropdown components using portals must either keep the CMDK root inside the popover or use a native accessible combobox pattern.
- **Headless Virtualization for Large ERP Datasets (`ERPCombobox.jsx`):** In ERP applications, entity collections (Customers, Suppliers, Inventory Items, Chart of Accounts) regularly exceed 5,000+ records. Never render raw arrays of DOM options or artificially slice them to 100 items. Use headless virtualization (e.g., `@tanstack/react-virtual` in `ERPCombobox.jsx`). Keyboard navigation (`ArrowDown`/`ArrowUp`) must dynamically invoke `virtualizer.scrollToIndex()`, rendering only ~10 visible items in the DOM while maintaining instant 60FPS keyboard and typing responsiveness.
- **Standardized Dropdown Traversal (Tab Auto-Commit & Escape Dismiss):** All selection and search fields (`ERPCombobox`, `SearchableSelect`, `ReportSearch`, `SettingsSearch`) must follow standard enterprise keyboard behaviors:
  1. **Enter:** Commits highlighted option or opens the dropdown if closed.
  2. **Tab:** If an item is currently highlighted in the open list, pressing <kbd>Tab</kbd> **must auto-commit** the highlighted selection before advancing focus to the next input field, rather than discarding user selection.
  3. **Escape:** Closes the popover immediately and returns focus to the trigger input.
  4. **Blur Sanitization:** Listen to `onBlur` and verify `!containerRef.current?.contains(e.relatedTarget)`. If focus leaves the dropdown container, close the menu immediately so detached floating menus never remain stuck on screen.
- **Stack-Based Scope Controller for Keyboard Shortcuts (`shortcutManager.ts`):** Global hotkeys (like `Alt+I`, `Alt+J`, `Ctrl+K`) must never leak into modals or high-density line-item data entry grids. Implement a LIFO Scope Stack:
  - When a modal opens, it pushes its ID to the top of the stack with `blockGlobalShortcuts: true`.
  - The global listener checks the stack; if a modal scope is active, it strictly intercepts and blocks global hotkeys from firing.
  - When the modal unmounts, it pops its scope, restoring global hotkey listeners cleanly.
- **Form Traversal Controller (Enter-as-Tab Paradigm):** Data-entry operators in ERP systems require rapid numerical entry without repeatedly reaching for the mouse or Tab key. Wrap transactional forms in `ERPFormScope`. Pressing <kbd>Enter</kbd> advances focus to the next focusable input (inputs, textareas, comboboxes, buttons) while <kbd>Shift+Enter</kbd> moves backwards. Form submission is only triggered on explicit submit buttons or `Ctrl+Enter`.
- **Intent-Driven Predictive Prefetching (`routePrefetcher.js`):** Eliminate route transition latency and network waterfalls before the user clicks:
  - **Sidebar:** Attach `prefetchRoute(item.path)` to `onMouseEnter` and `onFocus`.
  - **Command Palette & Search:** Attach `prefetchRoute(item.path)` to item hover and keyboard focus.
  - During the 200–300ms hover/keystroke window before click or Enter, silently prefetch the Vite code-split bundle chunk and foundational TanStack Query data (e.g. active items, chart of accounts) with a 5-minute `staleTime`.
- **Centralized Action Registry & Global Quick-Create (`actionRegistry.js`):** Unify all application routes, reports catalog, settings, and quick-create actions (`Alt+J`, `Alt+I`, `Alt+P`, `Alt+C`, `Alt+M`) into a single source of truth. Adding a new route or modal here automatically propagates across Command Palette, global shortcuts, and navigation drawers without touching disparate UI files.

---

## 13. Centralized Report Architecture, Sub-Ledger Accounting & Dynamic Matrix Governance

- **Centralized Layout Template & Design System (`reportTheme.js`):**
  Never build one-off styling, arbitrary table padding, unstandardized fonts, or custom heading layouts on individual report pages. All report pages (both routed standalone reports like `DayBookReport` and modal reports inside `ReportViewer`) must inherit their layout from the central template (`src/config/reportTheme.js`).
  - Standard tokens (`REPORT_TYPOGRAPHY`, `REPORT_COLORS`, `REPORT_DENSITY`) govern font families, heading scales, cell padding, header borders, and table density.
  - All reports must embed the central `BusinessHeader` (displaying enterprise name, PAN/TAX ID, dynamic report title, date range, and currency with print-safe CSS).
  - All reports must embed `ReportExportActions` for unified Excel and PDF exports with standardized visual loading spinners.
  - **Single Point of Evolution:** Any future enhancement or update made to the central template in `reportTheme.js` must instantly propagate to all current and future reports without modifying individual report files.

- **The Sub-Ledger Accounting Law (The `entity_type` Trap):**
  In Sajilo ERP double-entry accounting, customer receivables and vendor payables are governed strictly through dedicated Sub-Ledger accounts in the Chart of Accounts (`BusinessPartner.receivable_account_id` and `payable_account_id`), nested under *Trade Receivables (Customers)* and *Trade Payables (Suppliers)*.
  - **The Trap:** While Sales Invoices and Purchase Bills tag `entity_type = 'Customer'` / `'Vendor'` and `entity_id = partner.id`, Financial Vouchers (Receipt Vouchers, Payment Vouchers, Bank Transfers, and Contra/Journal Entries) post to `GeneralLedgerLine` with `entity_type = null` and `entity_id = null`.
  - **The Standard:** **Never** filter `GeneralLedgerLine` by `.eq('entity_type', 'Customer')` or `.eq('entity_type', 'Vendor')` to calculate customer or vendor balances. Doing so ignores all vouchers and receipts, producing catastrophic balance errors or false zero balances.
  - **The Aggregation Rule:** Ledger balance fetchers must aggregate debits and credits by `account_id IN (receivable_account_ids)` (or `payable_account_ids`), using `entity_id` solely as a secondary fallback.
  - **Opening Balance Rule:** Always factor in `opening_balance` and `opening_balance_type` ('Dr' vs 'Cr') from `BusinessPartner` to guarantee net double-entry balance integrity ($$Total\ Invoiced - Total\ Paid + Opening\ Balance$$).

- **Dynamic Matrix & Semantic Column Alignment Standard:**
  **Eliminate hardcoded numeric column indices** (such as `rightCols = new Set([headers.length - 1, headers.length - 2])`).
  - Hardcoded index sets collapse when optional metadata columns (e.g., Contact Number, PAN/TAX ID, Billing Address) are toggled dynamically on a report: text addresses get right-aligned while currency amounts get pushed left.
  - **Semantic Dynamic Alignment:** Column alignment must be evaluated dynamically by:
    1. *Header Keywords:* Inspecting header strings for currency tokens (`(NPR)`, `(Rs)`, `(%)`) and accounting keywords (`Amount`, `Debit`, `Credit`, `Balance`, `Total`, `Invoiced`, `Paid`, `Billed`, `Qty`, `Cost`, `Revenue`, `Value`, `WAC`, `Shortage`, `Current`, `Days`, `Gross`, `Net`).
    2. *Value Heuristics:* Inspecting non-empty sample cell values for numeric types or currency prefix formatting (`NPR `, `(NPR `).
  - Explicit alignment utility classes (`amount-cell tabular-nums text-right` vs `text-left`) must be applied uniformly to `<th scope="col">`, `<tbody> <td scope="row">`, and `<tfoot> <td>`.

- **Dynamic Footer Matrix & Column Shift Prevention:**
  In tabular reports supporting dynamic or configurable columns (e.g., optional partner metadata checkboxes), the table footer (`tfoot`), vector PDF footer, and Excel export footer **must strictly match the total column count of the headers**.
  - If a table has 4 base columns and 3 optional metadata columns (7 columns total), a 4-item footer causes a severe column shift where totals align under unrelated metadata fields.
  - **Footer Padding Rule:** Always pad dynamic footer arrays with `...metaHeaders.map(() => '')` (or dynamic empty padding) so that `footer.length === headers.length` across HTML tables, PDF engines (`jspdf-autotable`), and Excel spreadsheets (`exportFlatXLSX`).
  - **Full Accounting Summaries:** Never leave summary columns blank (e.g., `['TOTAL', '', '', balance]`). Always compute and display complete accounting totals (e.g., Total Invoiced, Total Paid, and Net Balance) across all numeric columns.

- **Report Lifecycle & Auto-Load Governance (The Commented-Hook Trap):**
  When a report is opened with valid default filter parameters (such as the active fiscal year or default date range), it must **auto-load data immediately on mount**.
  - **The Trap:** Never leave mount hooks disabled or commented out (e.g., `// useEffect(() => { load(); }, [load])`). Commented-out mount hooks leave reports in an uninitialized state (`hasLoaded = false`), misleading users with an empty screen or an unexplained *"Click Apply to generate"* placeholder.
  - **The Standard:** Mount hooks must automatically trigger data fetching on initial component mount. Retain the `Apply` button for intentional user re-filtering without blocking initial navigation.

- **Defensive Multi-Tenant Resolution in Client Data Fetchers:**
  Client-side data fetchers (such as `reportDataFetcher.js`) that query Supabase directly must always defensively validate the active company context:
  `const p_company_id = sajilo.getCompanyId(); if (!p_company_id) return [];`
  - Passing `undefined` to Supabase query builders (e.g., `.eq('company_id', undefined)`) causes PostgREST to crash with PostgreSQL error `22P02: invalid input syntax for type uuid: "undefined"`.
  - This unhandled exception crashes `Promise.all` routines, returning empty arrays and causing reports to render blank.

- **Partner Statement & Ledger Presentation Uniformity:**
  Single-partner statements (Customer Statement, Vendor Statement) and ledger drill-downs must follow the exact same architectural foundation and `ReportTheme` layout as multi-partner summary reports.
  - Supplementary details (PAN/VAT number, contact details, billing address, credit limits) must be rendered using standardized information cards and badge chips that cleanly toggle off in print mode (`print:hidden` / `print-hide`).
  - When generating vector PDFs or printing directly from the browser, statements must respect standard A4 margins (`size: A4 portrait` or `landscape`, `margin: 10mm`), ensuring table borders, corporate headers, and signature blocks never collide with page boundaries.

- **Database RPC Type Signatures & Resilient Client Fallbacks:**
  - **Strict Type Matching in RPCs:** When developing database functions (such as aging calculations or balance aggregations), avoid mixing `UUID` and `TEXT` types in equality operations (which triggers PostgreSQL `42883: operator does not exist: uuid = text`).
  - **Resilient Client Fallbacks:** Because database RPCs may encounter permission differences, schema migrations, or legacy signatures in production, client-side data fetchers must always include robust client-side aggregation fallbacks (querying base ledger lines directly) to guarantee zero-downtime reporting even if an RPC fails.

---

## 14. Configuration Management, System Seeding, GL Account Mapping & Frontend Resilience

- **Chart of Accounts (COA) Seeding Governance & Duplicate Resilience:**
  - **Unconditional Account Ingestion:** When seeding default baseline accounts (`seedDefaultChartOfAccounts()`), never restrict the existing-account query to `{ is_system_account: true }`. In live environments, baseline or parent accounts may have been created without this flag (or defaulted to `false`/`null`). Always fetch all accounts for the active company (`list('account_code', 2000)`) and pre-populate the hierarchy code-to-ID lookup dictionary.
  - **Account Creation Try-Catch Fallback:** Never allow a single duplicate account code to abort the entire seeder. Wrap individual account creation in a try/catch block. If creation fails due to an existing record, query the existing account by code, record its ID in the lookup dictionary, and seamlessly continue building the account hierarchy.
  - **Defensive Parent Resolution:** When linking `parent_account_id`, resolve from both `codeToId[acc.parent]` and search `existingAccounts` by parent code to ensure sub-ledgers are always tethered to their valid parent group.

- **The Query Limit Trap in Administrative Lookups:**
  - In ERP systems with active operations, master entity collections (sub-ledgers, customer/vendor accounts, inventory items) rapidly exceed standard pagination thresholds.
  - **The Trap:** Using conservative limits like `limit: 300` in setup pages or seeder reloaders will truncate accounts alphabetically, causing critical accounts starting with later letters (such as `2140 - Unearned EMI Interest` under 'U') to disappear from dropdowns and mappings.
  - **The Standard:** Administrative lookups and mapping screens must fetch with sufficient headroom (`limit: 2000`) or paginate comprehensively so system accounts are never clipped.

- **Dual-Strategy Mapping (Code + Semantic Keywords) for Restore Defaults:**
  - When auto-populating default GL accounts during "Restore Defaults", do not rely exclusively on rigid exact-string code equality. Account codes can contain trailing whitespace or minor organizational prefix variations across companies.
  - **The Standard:** Use a dual-strategy lookup: match by trimmed `account_code` first; if not found, fall back to matching an array of semantic lowercase keywords across `account_name` (e.g., `2140` fallback to `['unearned', 'interest']`; `4400` fallback to `['interest', 'income']`). This guarantees 100% mapping accuracy even across modified charts of accounts.

- **Resilient UI Label Resolution from In-Memory Entities:**
  - Never depend exclusively on persisted string columns (e.g., `settings.gl_*_name`) to render verification checkmarks and labels in settings forms.
  - If a company's database record contains only the UUID foreign key (`settings.gl_*_id`), the UI must dynamically resolve the name from loaded account lists:
    `✓ {settings[field_name] || accounts.find(a => a.id === settings[field_id])?.account_name}`
  - This ensures that users immediately see which account is mapped with clear visual confirmation (`✓`), even when working across legacy database schemas where name columns were not backfilled.

- **Defensive Client-Side Update Recovery for Schema Cache Mismatches:**
  - When persisting client settings forms (`sajilo.entities.CompanySettings.update(id, payload)`), the update payload may contain newly introduced display-name fields (`*_name`) that have not yet been migrated in a particular database instance.
  - The form submit handler (`handleSave`) must implement an automatic fallback: if PostgREST throws a column-missing error for non-critical display fields, gracefully strip those specific keys from the payload and retry the update once. This prevents user form-save lockouts while logging the diagnostic for developer review.

- **Proactive GL Account Health Checks & Pre-Flight Validation:**
  - Critical transactions (such as checkout, installment sales, or returns) enforce strict account mapping guards and fail if required GL accounts are null.
  - The GL mapping screen must maintain an active `HealthCheckBanner` checking all core and feature control accounts (including AR, AP, VAT, Inventory, COGS, Unearned Interest, and Interest Income).
  - Prominently flag missing critical accounts in red and non-critical module accounts in yellow, enabling administrators to resolve configuration gaps before users encounter runtime transaction blockers.

---

## 15. Manufacturing, Stock Assembly, Inventory Valuation & Atomic Posting Governance

- **Horngren-IFRS Master Production Cost Formula & Scrap Accounting:**
  The mathematical integrity of production builds must follow standard managerial cost accounting:
  $$\text{Total Production Cost} = \text{Total Consumed Value} + \text{Overhead} - \text{Scrap Recovery Value} - \text{Abnormal Spoilage}$$
  - **Normal Process Loss:** Physical shrinkage, dust, or standard evaporation is an inherent cost of production. Its cost is fully absorbed by the good finished units. **Never add normal wastage cost back into the formula** (which causes severe double-counting of raw material costs).
  - **Scrap / By-Product Recovery Value:** If scrap (e.g. steel offcuts, wood shavings, trim paper) has net realizable value, the user must be permitted to specify its estimated recovery unit price. The system debits Scrap Inventory Asset at this recovery value and **subtracts** it from the Total Production Cost of the finished good. Never force pristine raw material WAC onto scrap.
  - **Abnormal Spoilage:** Catastrophic machine errors or spoiled batches must be deducted from inventory valuation and expensed immediately to an operational Loss/Expense GL account.

- **Zero-Trust Backend Live Cost Injection (The WAC Time-Drift Trap):**
  Client forms display raw material costs based on item WAC at the moment the draft form is opened. If the user saves a draft at 9:00 AM, leaves for lunch, new purchase batches arrive at 12:00 PM updating the item's WAC from NPR 100 to NPR 120, and the user approves the assembly at 1:00 PM:
  - **The Risk:** Trusting the drafted line item cost permanently decouples GL inventory valuation from actual warehouse WAC.
  - **The Law:** The completion RPC (`complete_stock_assembly`) must **never** trust the drafted `unit_cost` of raw materials. It must fetch live `weighted_average_cost` directly from the locked `Item` record at the exact millisecond of database execution and overwrite the line item cost before computing General Ledger journal entries.

- **Rolling Weighted Average Cost (WAC) Blending for Produced Items:**
  When finished goods are produced into existing inventory, the system must recalculate the item's WAC dynamically:
  $$\text{New WAC} = \frac{(\text{Current QOH} \times \text{Current WAC}) + \text{Total Production Cost}}{\text{Current QOH} + \text{Produced Qty}}$$
  This guarantees that subsequent sales invoices deduce Cost of Goods Sold (COGS) at the blended cost.

- **Discrete UOM Recipe Scaling in Assembly Cloning:**
  When users scale assembly quantities (e.g. cloning a previous 1-unit recipe to build 7 units), discrete units of measure cannot physically exist in fractions:
  - For discrete UOMs (`PCS`, `NOS`, `BOX`, `UNIT`, `SET`, `BAG`, `PKT`, `PAIR`, `DOZEN`), always apply `Math.ceil()` or discrete integer rounding (`Math.max(1, Math.ceil(originalQty * scaleFactor))`) to eliminate fractional piece anomalies in the inventory ledger.
  - Continuous UOMs (`KG`, `LTR`, `MTR`, `TON`, `SQFT`) scale with standard floating decimal precision (3 decimal places).

- **The Inventory Ledger `wac_at_post` Parity Rule:**
  Any database RPC writing movements to `InventoryLedger` **must** populate `wac_at_post`:
  - Consumed raw materials: `wac_at_post = v_live_wac`
  - Scrap recovery: `wac_at_post = v_line.unit_cost` (NRV)
  - Finished goods produced: `wac_at_post = v_produced_unit_cost`
  - Reversals: `wac_at_post = original_unit_cost`
  *Reason:* Inventory valuation reports (`get_stock_ledger_statement_rpc`) compute running balances via `rolling_quantity * il.wac_at_post`. Omitting `wac_at_post` causes the report to display a zero NPR balance despite positive physical stock on hand.

- **Two-Way Reversal Architecture & Physical Depletion Guards:**
  Completed assemblies and production runs must be fully reversible in case of user data-entry errors or defective production:
  - **Physical Depletion Guard:** The cancellation RPC must verify that finished goods have not already been sold or consumed (`CurrentStock.current_qty >= produced_qty`). If stock is depleted, block cancellation with an explanatory error.
  - **Stock Restoration:** Atomically restock consumed raw materials into `CurrentStock` and `Item.quantity_on_hand`; deduct produced finished goods.
  - **Audit Ledgers:** Insert matching `-REV` voucher rows into `InventoryLedger`.
  - **GL Contra Journals:** Commit balanced contra-entries through `rpc_reverse_gl_journal`, marking the original journal as `Cancelled`.
  - **Direct UI Triggers:** Expose the "Reverse" action button both in the read-only view modal and directly on `Completed` rows in the DataTable.

- **Unified Cross-Document Item Transaction History:**
  Item dashboard history modals (`ItemTransactionHistory.jsx`) must query all transaction sources that affect inventory balances:
  - Purchases (`PurchaseInvoiceLine`)
  - Sales (`SalesInvoiceLine`)
  - Adjustments (`StockAdjustmentLine`)
  - Assemblies (`StockAssemblyItem` join `StockAssembly`)
  Ensure assembly production lines appear as `+` (Inflow) and raw material consumption appears as `-` (Outflow), with dedicated filter tabs (`All`, `Purchases`, `Sales`, `Adjustments`, `Assemblies`) and directional badges.

- **Strict Document Sequence Governance (Zero Ad-Hoc Numbers):**
  Never use client-generated timestamps (`ASM-${Date.now().slice(-6)}`).
  All transactional voucher types must be registered in:
  1. `DocumentSequenceConfig` (seeded per company with prefix, padding, and fiscal year prefix settings).
  2. `src/utils/documentSequence.js` (`getPredictedVoucherNumber` for real-time UI previews).
  3. Settings → Operations → Document Sequences (`DEFAULT_DOC_TYPES` in `VoucherSequence.jsx`).
  4. Database creation RPC (`create_or_update_*`): if `assembly_no` is `'AUTO'` or empty, call `get_next_voucher_number(company_id, doc_type, date)`.

- **Strict Auto-Numbering Placeholder Paradigm (Preventing Unique Key Collisions):**
  Never set a predicted document sequence string (e.g. from `getPredictedVoucherNumber(...)`) as the actual input field value when mounting creation forms. If user sessions or background transactions create a record concurrently, the static predicted string remains unincremented on the client and will fail with `duplicate key value violates unique constraint` (e.g., `StockAssembly_company_id_assembly_no_key`).
  - Always initialize document number form fields with `'AUTO'`.
  - Render the predicted sequence purely as a visual preview placeholder: `placeholder={predictedNumber ? \`Auto (${predictedNumber})\` : 'AUTO'}` alongside an `Auto-Numbered` badge.
  - Sanitize payload submissions: if the user left the input blank, kept `'AUTO'`, or left the matching predicted sequence unchanged, map the field to `'AUTO'`.
  - Ensure the database creation RPC (`create_or_update_*`) or underlying `get_next_voucher_number()` executes atomic sequence locking (`FOR UPDATE`) to assign the authoritative sequential number inside the single transaction block.

- **The Single Source of Stock Mutation Law (Trigger vs. Direct RPC Mutation):**
  In Sajilo ERP, table `InventoryLedger` has an active database trigger `trg_update_current_stock` (`AFTER INSERT OR UPDATE OR DELETE`) that automatically maintains `CurrentStock` and checks the negative stock policy (`STRICT_BLOCK`). Therefore, stored procedures and RPCs (such as `complete_stock_assembly`, `cancel_stock_assembly`, checkout RPCs) **must never directly execute `UPDATE "CurrentStock"` or `INSERT INTO "CurrentStock"`** when they also insert audit rows into `InventoryLedger`. Doing so causes a double mutation (e.g. deducting twice the consumed quantity, or incrementing twice the produced quantity), which falsely triggers negative stock errors on valid transactions and corrupts physical inventory counts. The RPC should only lock the row (`SELECT current_qty ... FOR UPDATE`) for concurrency safety and sufficiency checks, then let the `InventoryLedger` insert drive `CurrentStock` via the trigger.

- **Transactional Child Cleanup Law (Preventing Ghost Ledger Records):**
  Whenever test scripts or document cancellation/deletion routines remove parent transaction records (e.g. `StockAssembly`), they must atomically remove or reverse all associated child ledger rows (`InventoryLedger`, `GeneralLedgerJournal`, `GeneralLedgerLine`). Leaving child rows behind creates orphaned ledger records that permanently distort stock statements, ledger reports, and running balances.

---

## 16. Performance, Latency Optimization, Master Data Caching & Enterprise Infrastructure Standards

- **Pillar 1: Base64 in Database Anti-Pattern (The Storage Reference Law):**
  - **The Risk:** Persisting raw binary data (such as Base64 data URIs for company logos, receipts, or attachments) inside PostgreSQL relational text columns causes severe database bloat, exhausts I/O bandwidth, and floods client network payloads (inflating single-record API responses to 380+ KB).
  - **The Law:** Relational tables must store **only lightweight CDN URLs or Storage file paths**. Raw binary data must be uploaded directly to Supabase Storage (e.g., `company-assets` public bucket), yielding a 99.55% payload reduction (from 383.43 KB down to 1.74 KB) and enabling browser-level edge caching.
  - **Migration Standard:** When legacy data contains Base64 strings, provide idempotent NodeJS migration scripts (e.g. `scripts/migrate_logos_to_storage.mjs`) to decode buffers, upload them into Supabase Storage buckets, and replace inline strings with public CDN URLs.

- **Pillar 2: Master Data Architecture & Granular Caching with Predicate Invalidation (`useMasterData.js`):**
  - **The Waterfall Trap:** Navigating across ERP pages (Dashboard, Items, Categories, Invoices, Vouchers, POS) frequently triggers redundant, uncoordinated network fetches for identical reference datasets (items, categories, customers, vendors, accounts, fiscal years), causing 20–30 simultaneous REST requests and freezing the single-threaded JavaScript runtime.
  - **Granular Entity-Keyed Caching:** Centralize all master data access in `useMasterData.js` built on TanStack Query with structured query keys:
    `['Company', companyId, '<EntityName>', '<subKey>']` (e.g., `['Company', companyId, 'ItemCategory', 'categories']`).
  - **Cache Durations:** Configure reference data with `staleTime: 5 * 60 * 1000` (5 minutes) and `gcTime: 30 * 60 * 1000` (30 minutes). Static domain lookups (e.g., payment methods, active fiscal years) can use `staleTime: Infinity`.
  - **Mutation-Aware Predicate Invalidation:** Wire framework mutation handlers in `sajiloClient.js` to dynamic predicate invalidations:
    ```javascript
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey.includes(tableName)
    });
    ```
    This delivers instant 0ms cached lookups on cross-route navigation while guaranteeing immediate cache eviction whenever an entity is created, updated, or deleted.

- **Pillar 3: Single-Roundtrip Analytical Payloads vs. Request Waterfalls (`get_dashboard_analytics_payload`):**
  - **The REST Waterfall Anti-Pattern:** Orchestrating 10–15 independent HTTP REST calls from frontend dashboards to compute KPI cards, trends, aging buckets, and recent transactions exhausts browser connection pools, incurs high TCP latency, and triggers layout thrashing as individual widgets resolve at different times.
  - **The Database RPC Standard:** Consolidate high-density analytical dashboards into a single PostgreSQL stored procedure (`get_dashboard_analytics_payload`) that computes KPI totals, sales/purchase trends, AR/AP aging buckets, cash/bank balances, and pending approvals directly inside the database engine.
  - **Single Network Roundtrip:** The database engine returns a pre-aggregated, unified JSON object in a single HTTP request with ~400–500ms total latency.

- **Pillar 4: Zero-Maintenance Automated Database Warming via Vercel Cron (`vercel.json`):**
  - **The Cold-Start Latency Penalty:** Serverless and cloud database instances enter sleep/idle states after periods of inactivity, causing 2,000ms–4,000ms latency spikes for early morning or returning users.
  - **Automated Warming Infrastructure:** Deploy a zero-maintenance database warming cron job:
    1. **Vercel Cron Configuration (`vercel.json`):**
       ```json
       "crons": [
         {
           "path": "/api/warm-db",
           "schedule": "*/15 3-13 * * 1-6"
         }
       ]
       ```
       Runs every 15 minutes during business hours (9:00 AM – 7:00 PM NPT, Monday through Saturday).
    2. **Lightweight Healthcheck Handler (`api/warm-db.js`):** Executes a minimal database ping (`SELECT 1` or lightweight company count) to keep PostgreSQL connection pools, SSL handshakes, and query caches warm.
    3. **Cron Security:** Protect the endpoint with `CRON_SECRET` bearer token validation to block unauthorized external execution.

- **Pillar 5: Geographic Network Alignment & Serverless Region Pinning (`bom1`):**
  - **The Cross-Continental Latency Tax:** Deploying frontend edge/serverless functions in default US/EU data centers (`iad1`, `sfo1`) while the database resides in Mumbai (`ap-south-1`) introduces a 150ms–300ms cross-continental latency tax on *every* database round-trip.
  - **Regional Pinning Standard:** Explicitly configure Vercel Serverless Function deployment regions in `vercel.json` to `"regions": ["bom1"]` (Mumbai, India). Colocating serverless functions in the exact same physical region as the Supabase database cuts network transmission latency from >250ms to <25ms.

- **Pillar 6: Precision Telemetry Baselining & Verifiable Deltas:**
  - Never implement performance optimizations without recording empirical before-and-after benchmarks. Every optimization must verify:
    1. **Payload Size Delta:** Quantify network transfer bytes (e.g., verifying 383 KB → 1.74 KB, a 99.55% reduction).
    2. **Request Count Delta:** Measure browser network calls on initial route load (e.g., 14 requests → 1 request).
    3. **Roundtrip Latency (TTFB):** Benchmark total wall-clock time from user request to interactive state (e.g., multi-second waterfalls → ~445ms single roundtrip).

---

## 17. Multi-Tenant Workspace Resolution & Self-Healing Law (Preventing Infinite Login Loops)

- **The Stale Workspace Resolution Trap:**
  In multi-tenant cloud applications, persisting the active tenant ID in browser `localStorage` (`activeCompanyId`) creates an inherent risk of state desynchronization. If a company is deleted, its membership is deactivated, or the user's tenant assignment changes in the database, the client continues to request authentication for the stale company ID on subsequent page loads or logins.

- **The Decoupling of Authentication and Workspace Authorization:**
  Never conflate user identity authentication (`Supabase Auth session`) with company workspace authorization (`UserCompany membership`). An authenticated user with valid login credentials must **never** be set to `isAuthenticated = false` or redirected to `/login` simply because their previously selected company is inaccessible. Redirecting an authenticated user to the login route creates an **unrecoverable infinite redirect loop**:
  $$\text{User Logs In} \longrightarrow \text{Redirect to } / \longrightarrow \text{Read Stale Company} \longrightarrow \text{Access Denied} \longrightarrow \text{Redirect to } /login \longrightarrow \text{Infinite Loop}$$

- **The Dual-Layer Auto-Fallback Standard:**
  1. **Database Layer (`get_user_auth_context` RPC):**
     When `p_company_id` is passed from the client, the database procedure must first validate membership. If membership is not found (due to deleted company, revoked access, or stale client UUID), the RPC **must not immediately fail with `company_access_denied`**. Instead, it must automatically fall back to querying the user's default or oldest active company (`is_default DESC, created_at ASC LIMIT 1`). Only if the user has no active companies at all should it return `no_company` or `company_access_denied`.
  2. **Client Layer (`AuthContext.jsx`):**
     If `get_user_auth_context` returns `company_access_denied` when a `storedCompanyId` was provided, the client must self-heal:
     - Discard the stale stored company (`sajilo.setCompanyId(null)` / `localStorage.removeItem('activeCompanyId')`).
     - Immediately re-fetch `get_user_auth_context({ p_company_id: null })` to resolve the default active workspace.
     - Keep `isAuthenticated = true` to preserve the user's verified session.
  3. **Router Layer (`ProtectedRoute.jsx`):**
     If a user genuinely has `authError.type === 'company_access_denied'` across all companies, render a dedicated `<AccessDenied />` workspace view rather than returning `unauthenticatedElement` (`<Navigate to="/login" replace />`). This breaks any potential redirect cycles and allows the user to switch accounts or contact support.

---

## 18. Complete Company Purge & Default Promotion Law (`force_delete_company.sql`)

- **The Replica Mode Silencing Trap (Bypassed Foreign Key Cascades):**
  - **The Risk:** In PostgreSQL, executing `SET LOCAL session_replication_role = 'replica'` silences all user-defined triggers (such as `trg_gl_journal_anti_tamper` and stock guards). However, it **also silences PostgreSQL's internal foreign-key cascade actions (`ON DELETE CASCADE`)**!
  - **The Flaw:** Running a single `DELETE FROM "Company" WHERE id = v_company_id;` while in replica mode deletes *only* the row in `Company`, leaving all child records (`Item`, `StockAssembly`, `FiscalYear`, `Godown`, `InventoryLedger`, `CompanySettings`) permanently orphaned in the database.
  - **The Law:** A complete administrative force-purge script (`force_delete_company.sql`) **must never rely on hardcoded table lists or cascade triggers under replica mode**. It must execute **dynamic metadata discovery** across `information_schema.columns` (for all current and future tables with `company_id`) and `pg_constraint` (for child line tables without `company_id`), guaranteeing 100% automated cleanup even as new modules or tables are added to Sajilo ERP in the future.

- **The Cloud Storage Purge Standard:**
  - Database table deletions do not clean up files stored in cloud object storage (e.g. Supabase Storage bucket `erp_documents`).
  - Purge scripts must delete all matching files in `storage.objects` where `bucket_id = 'erp_documents' AND (name LIKE v_company_id || '/%' OR name LIKE '%' || v_company_id || '%')` to prevent storage bloat and orphaned media.

- **The Automatic Default Workspace Promotion Law:**
  - When an admin deletes a company that served as the primary workspace (`is_default = true`) for users, the deletion script must not leave those users in an unassigned state.
  - The script must identify affected users and **automatically promote their oldest active secondary company to `is_default = true` in `UserCompany`**:
    ```sql
    WITH candidate_defaults AS (
        SELECT uc.id,
               ROW_NUMBER() OVER (PARTITION BY uc.user_id ORDER BY uc.created_at ASC) as rn
        FROM public."UserCompany" uc
        JOIN public."Company" c ON c.id = uc.company_id
        WHERE uc.user_id IN (SELECT user_id FROM tmp_affected_users)
          AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
          AND (c.status IS NULL OR c.status = 'ACTIVE')
          AND (c.is_active IS NULL OR c.is_active = true)
    )
    UPDATE public."UserCompany"
    SET is_default = true
    WHERE id IN (SELECT id FROM candidate_defaults WHERE rn = 1);
    ```
  - This ensures that upon next login, the user's dashboard automatically resolves to their secondary company workspace with zero configuration or manual intervention.

