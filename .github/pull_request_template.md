# Development Checklist

Review this checklist before starting the development of any new feature or page. Use it as a foundation to prepare a proper implementation plan. In Sajilo ERP, every new screen or feature must be properly integrated with existing core systems (Multi-tenancy, GL, AD/BS Dates, Ghost Mode, etc.).

---

## 1. Requirements & Scope
- [ ] **Feature Definition:** Clearly define what the feature does, its goals, and the value it provides.
- [ ] **Target Audience/Roles:** Which user roles will have access? Are there specific RBAC (Role-Based Access Control) permissions required?
- [ ] **Edge Cases:** Identify potential edge cases, failure states, or unusual user paths.

## 2. Database & Data Lifecycle Layer
*Every new table or schema change must pass these checks to ensure the multi-tenant architecture remains intact.*

- [ ] **Tenant Isolation:** Does the table include a `company_id` column?
- [ ] **The Deletion Cascade:** Is the foreign key explicitly defined with `ON DELETE CASCADE` referencing the "Company" table? (Crucial for the Sweeper Edge Function to cleanly wipe tenants).
- [ ] **Ghost Mode Compliance:** If the table holds transactional or operational data, is the `prevent_ghost_mode_mutations` trigger attached so the table locks down when a company is pending deletion?
- [ ] **Timezone Safety:** If the table relies on date ranges for reporting, are queries written using SARGable, timezone-aware boundaries (e.g., `AT TIME ZONE 'Asia/Kathmandu'`)?
- [ ] **Governance & Maintenance:** If you wrote a new anti-tamper trigger for this module, does it include the `sajilo.maintenance_mode` backdoor to allow the orphan sweeper to do its job?
- [ ] **Schema Changes:** Are new tables, columns, or views required? Are primary keys using UUIDs (`gen_random_uuid()`)?
- [ ] **Migrations:** Create a sequential SQL migration file (e.g., `XXX_feature_name.sql`).

## 3. The Security & API Layer
*Guarding against data leaks and unauthorized mutations.*

- [ ] **Row Level Security (RLS):** Is RLS explicitly enabled on the new table, with policies restricting access strictly to the user's `company_id`?
- [ ] **No Always-True Policies:** Ensure there are no overly permissive bypasses like `USING (true) WITH CHECK (true)` on tenant-isolated tables.
- [ ] **Strict Policy Types:** Do RLS policies use strict type casting (e.g., `(auth.uid())::text = created_by::text`) to avoid `UUID` vs `TEXT` mismatch errors?
- [ ] **RPC Security (Invoker Default):** Do new database functions use `SECURITY INVOKER` by default so they natively inherit RLS?
- [ ] **RPC Security (Definer Lock):** If an RPC *must* use `SECURITY DEFINER` to bypass RLS, is the search path explicitly locked (`SET search_path = public, pg_temp`) to prevent hijacking? Did you `REVOKE EXECUTE ON FUNCTION <name> FROM public, anon;` followed by explicit `GRANT` to `authenticated`?
- [ ] **RPC Internal Auth:** Do `SECURITY DEFINER` functions explicitly check `auth.uid()` and user roles at the top of the body to enforce permissions?

## 4. The Financial Engine Layer (If Applicable)
*Only required for modules that affect the ledger (e.g., Payroll, Construction, Godown).*

- [ ] **GL Integration:** Does the module post perfectly balanced double-entry records to `GeneralLedgerJournal` and `GeneralLedgerLine`?
- [ ] **Year-End Close Compatibility:** Do the financial reports for this module explicitly exclude `YearEndClose` and `OpeningBalance` reference modules so historical data doesn't inadvertently zero out?
- [ ] **Immutability:** Does the UI and Database prevent the hard deletion or modification of records once they are marked as 'Posted'?
- [ ] **Financial Reporting RPCs:** When modifying P&L or Balance Sheet RPCs, ensure they always select `statement_group`, `statement_subgroup`, and `normal_balance`, and strictly filter by `a.statement_type` (not `financial_statement`) to prevent unmapped/suspense account groupings in the frontend reports.

## 5. Frontend UI/UX Layer
*Ensuring the user experience is consistent, responsive, and state-aware.*

- [ ] **Ghost Mode UI:** Does the UI component check the `Company.status`? If `'PENDING_DELETION'`, are all "Save/Submit" buttons disabled or hidden to reflect the read-only state?
- [ ] **Theming (Dark/Light):** Are all colors utilizing global CSS variables/Tailwind semantic classes (e.g., `bg-background`, `text-foreground`, `border-border`) rather than hardcoded hex values? Does the design work well on both Dark Mode and Normal Mode?
- [ ] **Responsiveness:** Does the screen function correctly on mobile devices? (e.g., using Tailwind `md:` and `lg:` breakpoints, converting data tables to card views or horizontal scrolling on small screens).
- [ ] **Date Fields & Columns:** Do all date input fields use the `DateInput` component to provide the AD/BS Date Switch feature? Do report data tables separate AD and BS dates into distinct columns (using `formatToDmyAD` and `formatToDmyBS` with `displayBsDate` context)?
- [ ] **Report Display & Filters:** Does every new standalone report page integrate the Global Report Filter (`ReportFilterBar.jsx`)?
- [ ] **Voucher Links:** Are all Invoice or Voucher numbers rendered using the `<VoucherLink>` component to allow drill-down into voucher details?

## 6. Testing & Verification
- [ ] **Happy Path:** Does the main flow work as expected?
- [ ] **Error Path:** Does the system gracefully handle intentional errors or bad inputs?
- [ ] **Cross-tenant Isolation:** Confirm that a user in Company A absolutely cannot access Company B's data via this new feature.
- [ ] **Syntax & Compiler Check:** Have you verified that there are no stray JSX tags, unclosed components, or duplicate imports? (Always check the compiler/bundler output for parsing errors after code edits).

---

## 7. How to Enforce This Workflow

A checklist is only useful if it is consistently enforced. Do not rely on developers remembering to check this document.

1. **The Pull Request (PR) Template:** Make this checklist inescapable by embedding it directly into your Git workflow. Create a `.github/pull_request_template.md` (or equivalent). Every time a developer opens a PR, they must manually check the boxes.
2. **Database Migration Reviews:** Assign one "Database Guardian". No SQL migration should be merged into the main branch until the Guardian manually verifies that `ON DELETE CASCADE`, RLS, and the Ghost Mode triggers are present in the script.
3. **UI Component Wrappers:** To prevent frontend developers from constantly forgetting Dark Mode and Ghost Mode, build Higher-Order Components (HOCs). For example, a `<SecureSubmitButton>` component that automatically checks the global state and disables itself if `company.status === 'PENDING_DELETION'`.
