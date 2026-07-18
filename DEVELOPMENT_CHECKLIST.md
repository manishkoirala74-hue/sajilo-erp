# Development Checklist

Review this checklist before starting the development of any new feature or page. Use it as a foundation to prepare a proper implementation plan.

## 1. Requirements & Scope
- [ ] **Feature Definition:** Clearly define what the feature does, its goals, and the value it provides.
- [ ] **Target Audience/Roles:** Which user roles will have access? Are there specific RBAC (Role-Based Access Control) permissions required?
- [ ] **Edge Cases:** Identify potential edge cases, failure states, or unusual user paths.

## 2. Database & Schema (Supabase/PostgreSQL)
- [ ] **Schema Changes:** Are new tables, columns, or views required?
- [ ] **Multi-tenancy:** Do new tables include `company_id`? 
- [ ] **Foreign Keys & Constraints:** Are foreign keys properly linked with appropriate `ON DELETE` rules? Are NOT NULL, UNIQUE, and CHECK constraints applied?
- [ ] **RLS Policies:** Are Row Level Security (RLS) policies defined for `SELECT`, `INSERT`, `UPDATE`, and `DELETE` (filtering by `company_id` and user role)?
- [ ] **No Always-True Policies:** Ensure there are no overly permissive bypasses like `USING (true) WITH CHECK (true)` on tenant-isolated tables.
- [ ] **Strict Policy Types:** Do RLS policies use strict type casting (e.g., `(auth.uid())::text = created_by::text`) to avoid `UUID` vs `TEXT` mismatch errors?
- [ ] **RPC Security (search_path):** Do all newly created PostgreSQL functions end with `SET search_path = public, pg_temp;`?
- [ ] **RPC Permissions:** Are `SECURITY DEFINER` functions explicitly locked down? (`REVOKE EXECUTE ON FUNCTION <name> FROM public, anon;` followed by explicit `GRANT` to `authenticated` or `service_role`).
- [ ] **RPC Internal Auth:** Do `SECURITY DEFINER` functions explicitly check `auth.uid()` and user roles at the top of the body to enforce permissions?
- [ ] **Migrations:** Create a sequential SQL migration file (e.g., `XXX_feature_name.sql`).

## 3. Backend Logic & APIs
- [ ] **Database Functions (RPCs):** Are any complex transactions required that should be handled inside a PostgreSQL function/RPC?
- [ ] **Triggers:** Do we need any database triggers (e.g., audit logging, automatic stock/ledger updates)?
- [ ] **Data Types & Casts:** Ensure type safety, particularly handling UUIDs, numerics (for currency/quantity), and JSONB fields.
- [ ] **Query Optimization:** Do we need indexes on frequently queried columns?
- [ ] **Proper GL Posting Service Mapping:** Do we need to Map new development to complete GL Posting Servier?

## 4. Frontend Architecture (React/Vite)
- [ ] **Routing:** Where does this new page sit in the application hierarchy? Is it protected by an auth/role guard?
- [ ] **State Management:** Will this feature require global state or local component state?
- [ ] **Component Reusability:** Can we reuse existing UI components, or do we need to build new generic components?
- [ ] **Data Fetching:** How is data fetched from Supabase? Ensure proper loading states and error handling during fetch.
- [ ] **Report Display:** Does this Development or Changes needs to properly display in Reports? Ensure proper loading states and error handling during fetch.
- [ ] **Global Report Filter:** Does every new standalone report page integrate the Global Report Filter (`ReportFilterBar.jsx`)?
- [ ] **Date Columns:** Do report data tables separate AD and BS dates into distinct columns (using `formatToDmyAD` and `formatToDmyBS` with `displayBsDate` context) instead of merging them?
- [ ] **Voucher Links:** Are all Invoice or Voucher numbers rendered using the `<VoucherLink>` component to allow drill-down into voucher details?

## 5. UI/UX & Aesthetics (Tailwind CSS)
- [ ] **Responsive Design:** Does the design work well on both mobile and desktop screens?
- [ ] **Dark Mode Compactible:** Does the design work well on both Dark Mode and Normal Mode?
- [ ] **States:** Have you accounted for Loading, Error, Success, and Empty states?
- [ ] **Form Validation:** Is client-side validation implemented? Are user-friendly error messages displayed?
- [ ] **Accessibility:** Are we using semantic HTML? Are buttons and forms accessible?
- [ ] **Date Fields:** Do all date fields use the `DateInput` component to provide the AD/BS Date Switch feature?

## 6. Security & Performance
- [ ] **Input Validation:** Ensure all inputs are validated both on the frontend and the database level.
- [ ] **Pagination/Virtualization:** If fetching lists, is pagination or infinite scroll implemented to prevent performance bottlenecks?
- [ ] **Rate Limiting/Debouncing:** Are search inputs or rapid actions properly debounced?

## 7. Testing & Verification
- [ ] **Happy Path:** Does the main flow work as expected?
- [ ] **Error Path:** Does the system gracefully handle intentional errors or bad inputs?
- [ ] **Cross-tenant Isolation:** Confirm that a user in Company A absolutely cannot access Company B's data via this new feature.
- [ ] **Syntax & Compiler Check:** Have you verified that there are no stray JSX tags, unclosed components, or duplicate imports? (Always check the compiler/bundler output for parsing errors after code edits).

## 8. Implementation Plan Generation
- [ ] Use the answers to the above questions to formulate a comprehensive step-by-step **Implementation Plan** before writing code.
