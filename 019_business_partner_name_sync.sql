-- Trigger function to synchronize Business Partner name changes to Chart of Accounts
CREATE OR REPLACE FUNCTION sync_partner_name_to_ledger()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if the name actually changed
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        
        -- Update the internal cache names in the BusinessPartner table
        NEW.receivable_account_name := NEW.name;
        NEW.payable_account_name := NEW.name;

        -- Update the actual Chart of Accounts for Receivable
        IF NEW.receivable_account_id IS NOT NULL THEN
            UPDATE "ChartOfAccount"
            SET account_name = NEW.name
            WHERE id = NEW.receivable_account_id;
        END IF;

        -- Update the actual Chart of Accounts for Payable
        IF NEW.payable_account_id IS NOT NULL THEN
            UPDATE "ChartOfAccount"
            SET account_name = NEW.name
            WHERE id = NEW.payable_account_id;
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trg_sync_partner_name_to_ledger ON "BusinessPartner";

-- Create the trigger before update
CREATE TRIGGER trg_sync_partner_name_to_ledger
BEFORE UPDATE ON "BusinessPartner"
FOR EACH ROW
EXECUTE FUNCTION sync_partner_name_to_ledger();
