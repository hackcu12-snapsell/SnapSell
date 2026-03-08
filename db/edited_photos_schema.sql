-- Edited / enhanced product photos.
-- Stores Gemini-processed versions of item_image rows.
-- Run after schema.sql: psql -d appraisal_db -f db/edited_photos_schema.sql

CREATE TABLE IF NOT EXISTS edited_photos (
    id              SERIAL PRIMARY KEY,
    item_image_id   INTEGER NOT NULL,
    url             TEXT NOT NULL,          -- same format as item_image.url (/uploads/...)
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_edited_photos_item_image
        FOREIGN KEY (item_image_id)
        REFERENCES item_image(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edited_photos_item_image_id ON edited_photos(item_image_id);
