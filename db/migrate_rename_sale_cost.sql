-- Migration: replace sale_cost with purchase_price + listing_price
-- Drop the empty purchase_price column added by the prior migration (if present)
ALTER TABLE items DROP COLUMN IF EXISTS purchase_price;

-- Rename sale_cost → purchase_price (preserves any existing data)
ALTER TABLE items RENAME COLUMN sale_cost TO purchase_price;

-- Add listing_price — set when the item is posted to eBay
ALTER TABLE items ADD COLUMN IF NOT EXISTS listing_price NUMERIC DEFAULT 0;
