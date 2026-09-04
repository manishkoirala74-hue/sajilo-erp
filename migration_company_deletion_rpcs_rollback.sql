-- Down Migration: Remove status columns and soft-delete RPCs

DROP FUNCTION IF EXISTS request_company_deletion(uuid);
DROP FUNCTION IF EXISTS cancel_company_deletion(uuid);

ALTER TABLE "Company" DROP COLUMN IF EXISTS status;
ALTER TABLE "Company" DROP COLUMN IF EXISTS deletion_scheduled_at;
