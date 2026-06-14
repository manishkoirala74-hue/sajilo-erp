-- Add the toggle to CompanySettings
ALTER TABLE "CompanySettings" 
ADD COLUMN IF NOT EXISTS "show_recent_trading_history" BOOLEAN DEFAULT true;
