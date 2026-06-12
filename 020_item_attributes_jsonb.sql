ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_item_attributes_jsonb ON "Item" USING gin (attributes);
