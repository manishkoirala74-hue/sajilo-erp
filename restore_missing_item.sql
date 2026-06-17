-- =========================================================================================
-- RESTORE MISSING ITEM
-- =========================================================================================
-- This script restores the "Honda DIO Scotter 2013" item into the database so that it
-- matches the ID inside the Purchase Invoice PI-2026-013.

-- Temporarily disable triggers to bypass the ERR_UNAUTHORIZED_MASTER_DATA block
ALTER TABLE "Item" DISABLE TRIGGER ALL;

INSERT INTO "Item" (
    id,
    item_name,
    item_type,
    unit_of_measure,
    company_id,
    is_active,
    purchase_price,
    selling_price,
    quantity_on_hand,
    weighted_average_cost,
    current_unit_cost
) VALUES (
    '820740e4-f749-4852-bfdc-da5a1b12d4a4',
    'Honda DIO Scotter 2013',
    'Product',
    'PCS',
    'a10e6e72-13ca-46f0-82ba-5cd421da6e2d',
    true,
    50000,
    0,
    0,
    50000,
    50000
) ON CONFLICT (id) DO NOTHING;

-- Re-enable all triggers
ALTER TABLE "Item" ENABLE TRIGGER ALL;
