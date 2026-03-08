-- Migration: add purchase_price (what we paid) to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_price NUMERIC DEFAULT 0;
