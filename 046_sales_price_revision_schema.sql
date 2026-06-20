-- 046_sales_price_revision_schema.sql
-- Create tracking table for item sales price changes

CREATE TABLE IF NOT EXISTS public."ItemPriceRevisionLog" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public."Item"(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public."ItemCategory"(id) ON DELETE SET NULL,
    old_selling_price NUMERIC(15, 4) NOT NULL,
    new_selling_price NUMERIC(15, 4) NOT NULL,
    revision_type TEXT CHECK (revision_type IN ('MANUAL_INDIVIDUAL', 'PERCENTAGE_INDIVIDUAL', 'PERCENTAGE_CATEGORY', 'FIXED_AMOUNT_CATEGORY')),
    adjustment_value NUMERIC(10, 2),
    remarks TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES auth.users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_item_price_revision_company_item ON public."ItemPriceRevisionLog"(company_id, item_id);
CREATE INDEX IF NOT EXISTS idx_item_price_revision_company_created ON public."ItemPriceRevisionLog"(company_id, created_at);

-- RLS
ALTER TABLE public."ItemPriceRevisionLog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "secure_tenant_isolation_ItemPriceRevisionLog" ON public."ItemPriceRevisionLog";
CREATE POLICY "secure_tenant_isolation_ItemPriceRevisionLog" ON public."ItemPriceRevisionLog"
    FOR ALL TO authenticated
    USING (public.user_has_company_access(company_id))
    WITH CHECK (public.user_has_company_access(company_id));

-- Add RPC function for bulk update
CREATE OR REPLACE FUNCTION apply_price_revision_rpc(
    p_company_id UUID,
    p_category_id UUID,
    p_item_id UUID,
    p_adjustment_type TEXT,
    p_adjustment_value NUMERIC,
    p_remarks TEXT,
    p_user_id UUID
) RETURNS INT AS $$
DECLARE
    v_item RECORD;
    v_new_price NUMERIC(15, 4);
    v_count INT := 0;
BEGIN
    FOR v_item IN 
        SELECT id, selling_price 
        FROM public."Item" 
        WHERE company_id = p_company_id 
          AND (p_category_id IS NULL OR category_id = p_category_id)
          AND (p_item_id IS NULL OR id = p_item_id)
          AND is_active = true
    LOOP
        -- Calculate new price
        IF p_adjustment_type = 'PERCENTAGE_CATEGORY' OR p_adjustment_type = 'PERCENTAGE_INDIVIDUAL' THEN
            -- Round to nearest whole number as requested
            v_new_price := ROUND(v_item.selling_price * (1 + (p_adjustment_value / 100)));
        ELSIF p_adjustment_type = 'FIXED_AMOUNT_CATEGORY' THEN
            v_new_price := v_item.selling_price + p_adjustment_value;
        ELSIF p_adjustment_type = 'MANUAL_INDIVIDUAL' THEN
            v_new_price := p_adjustment_value; -- Explicit new price
        ELSE
            RAISE EXCEPTION 'Invalid adjustment type: %', p_adjustment_type;
        END IF;

        -- Ensure price doesn't go below 0
        IF v_new_price < 0 THEN
            v_new_price := 0;
        END IF;

        -- Only update if the price actually changed
        IF v_new_price != v_item.selling_price THEN
            -- Update Item
            UPDATE public."Item"
            SET selling_price = v_new_price
            WHERE id = v_item.id;

            -- Log Revision
            INSERT INTO public."ItemPriceRevisionLog" (
                company_id, item_id, category_id, old_selling_price, new_selling_price, 
                revision_type, adjustment_value, remarks, created_by
            ) VALUES (
                p_company_id, v_item.id, p_category_id, v_item.selling_price, v_new_price,
                p_adjustment_type, p_adjustment_value, p_remarks, p_user_id
            );

            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION apply_price_revision_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION apply_price_revision_rpc TO service_role;
