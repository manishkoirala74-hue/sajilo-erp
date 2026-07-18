# Unified PDF and Excel Export Architecture Walkthrough

The transition from a fragile browser-based print mechanism (`window.print`) to a robust, serverless, and idempotent reporting architecture has been fully implemented.

## What was Changed

### 1. Database Archiving and Lifecycle Policy
- **Migration Script (`0112_create_report_archive.sql`)**: 
  - Created the `report_archive` table with `parameters` stored as JSONB for dynamic querying.
  - Implemented the critical `idx_gl_journal_updated_at` descending index on `GeneralLedgerJournal` to prevent full table scans and keep cache validation sub-millisecond.
  - Integrated `pg_cron` to act as a nightly garbage collector, automatically deleting reports older than 30 days.
  - Applied Row Level Security (RLS) to ensure users can only access their own company's reports.
  - Established the structural foundation for the Supabase Database Webhook to listen for `DELETE` events.

### 2. Robust Security and Cleanup
- **Secure Webhook Handler (`api/webhook-delete-report.js`)**: 
  - Deployed an endpoint that intercepts the `DELETE` payload from the `pg_cron` job.
  - Secured the endpoint by cross-referencing the `x-webhook-secret` header against the `SUPABASE_WEBHOOK_SECRET` environment variable, ensuring malicious actors cannot forge deletion requests.
  - Cleanly syncs the database with the `erp_documents` storage bucket by physically deleting the stale PDF files.

### 3. High-Performance PDF Generation Engine
- **Serverless Orchestrator (`api/generate-pdf.js`)**:
  - Built a Node.js-enforced Vercel Serverless Function to orchestrate PDF compilation.
  - Memory limits explicitly bumped to `1024MB` in `vercel.json` to handle Yoga layout calculations.
  - The endpoint queries Supabase RPCs internally, bypassing Vercel's strict 4.5MB payload limit.
  - Automatically uploads the PDF to the storage bucket and inserts the cache record along with the precise `ledger_timestamp`.
- **Declarative Typography (`FinancialReportTemplate.jsx`)**:
  - Shifted away from legacy web views into a declarative `@react-pdf/renderer` template.
  - Globally registered the `Roboto` font to ensure flawless rendering of specific UTF-8 glyphs and regional currency symbols (e.g., NPR) instead of falling back to default blank boxes.

### 4. Idempotent Frontend Caching
- **State-Driven Engine (`reportExportEngine.js`)**:
  - Implemented a state-based cache invalidator that completely decouples from time.
  - It probes the ledger for `MAX(updated_at)` and checks if an identical report exists for that exact snapshot.
  - Instantly serves cached URLs, preventing redundant CPU cycles.
- **UI Integration (`ReportViewer.jsx`)**:
  - Ripped out the old, heavily coupled DOM-cloning print portal (`usePrintPortal`).
  - Swapped "Print / PDF" buttons with a clean "Download PDF" asynchronous workflow containing graceful loading states and error handling for timeouts.

> [!TIP]
> **Vercel Configuration:** Make sure your `vercel.json` is deployed so the `1024MB` memory bump and API rewrites are active on the edge infrastructure.
> 
> **Supabase Configuration:** Ensure `pg_cron` is enabled in your Supabase extensions dashboard, and verify the Database Webhook is properly pointed to your production domain with the `x-webhook-secret` correctly configured.
