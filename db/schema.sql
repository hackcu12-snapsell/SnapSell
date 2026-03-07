DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS item_image;
DROP TABLE IF EXISTS appraisals;
DROP TABLE IF EXISTS listing_reference;


-- USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);


-- ITEMS TABLE
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    userid INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    brand TEXT,
    year INTEGER,
    status TEXT CHECK (status IN ('appraised', 'inventory', 'listed', 'sold')),
    sale_cost NUMERIC DEFAULT 0,

    CONSTRAINT fk_items_user
        FOREIGN KEY(userid)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_items_userid ON items(userid);

-- ITEM IMAGES TABLE
CREATE TABLE item_image (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    url TEXT NOT NULL,

    CONSTRAINT fk_item_image_item
        FOREIGN KEY(item_id)
        REFERENCES items(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_item_image_item_id ON item_image(item_id);

-- APPRAISALS TABLE
CREATE TABLE appraisals (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lowest_value NUMERIC,
    mean_value NUMERIC,
    high_value NUMERIC,
    value_confidence NUMERIC,
    volume INTEGER,
    value_reasoning TEXT,
    caveat TEXT,
    decision TEXT,

    CONSTRAINT fk_appraisals_item
        FOREIGN KEY(item_id)
        REFERENCES items(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_appraisals_item_id ON appraisals(item_id);

-- LISTING REFERENCES TABLE
CREATE TABLE listing_reference (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    source TEXT,
    price NUMERIC,
    appraisal_id INTEGER NOT NULL,
    condition TEXT,

    CONSTRAINT fk_listing_reference_appraisal
        FOREIGN KEY(appraisal_id)
        REFERENCES appraisals(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_listing_reference_appraisal_id ON listing_reference(appraisal_id);


-- Create DB
--psql postgres
--CREATE DATABASE appraisal_db;

--psql -d appraisal_db -f schema.sql