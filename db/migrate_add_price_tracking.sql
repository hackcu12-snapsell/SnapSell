-- Migration: add last_price_change_date to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_price_change_date TIMESTAMP;
