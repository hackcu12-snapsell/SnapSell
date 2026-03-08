-- USERS
INSERT INTO users (email, username, password_hash)
VALUES 
('test@test.com', 'test', '$2b$12$9GyUJjZ6kxEucK9VTGvPcO8infrDoGWkv70ndWpfjBMQiChaFe5qi'),
('harrison@gmail.com', 'harg', 'password');


-- ITEMS
INSERT INTO items (userid, name, description, category, brand, year, status, condition, sale_cost)
VALUES
(1, 'Vintage Rolex Submariner', 'Classic dive watch in excellent condition', 'watch', 'Rolex', 1995, 'inventory', 'Excellent', 0),
(2, 'Charizard Holo Card', 'Pokemon Base Set holographic Charizard', 'trading card', 'Pokemon', 1999, 'appraised', 'Good', 0);


-- ITEM IMAGES
INSERT INTO item_image (item_id, url)
VALUES
(1, 'https://i.ebayimg.com/images/g/tgkAAOSw37RlVn8Z/s-l1600.webp'),
(2, 'https://i.ebayimg.com/images/g/EFkAAeSw3p9ppLxr/s-l1600.webp');


-- APPRAISALS
INSERT INTO appraisals (
    item_id,
    lowest_value,
    mean_value,
    high_value,
    value_confidence,
    volume,
    value_reasoning,
    caveat,
    decision
)
VALUES
(
    1,
    8000,
    9500,
    11000,
    0.85,
    12,
    'Recent auction results for similar vintage submariners.',
    'Condition grading based on seller photos.',
    'hold'
),
(
    2,
    200,
    300,
    400,
    0.80,
    30,
    'Comparable PSA 1-2 Charizard sales in the past 3 months.',
    'Exact grading unknown.',
    'sell'
);


-- LISTING REFERENCES
INSERT INTO listing_reference (url, source, price, appraisal_id, condition)
VALUES
(
    'https://www.ebay.com/itm/235391314201',
    'ebay',
    11000,
    1,
    'good'
),
(
    'https://ebay.us/m/yNSb50',
    'ebay',
    299,
    2,
    'PSA 1'
);

-- psql -d appraisal_db -f seed.sql