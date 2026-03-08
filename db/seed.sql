-- USERS
INSERT INTO users (email, username, password_hash)
VALUES 
('test@test.com', 'test', '$2b$12$9GyUJjZ6kxEucK9VTGvPcO8infrDoGWkv70ndWpfjBMQiChaFe5qi'),
('harrison@gmail.com', 'harg', 'password');


-- ITEMS
INSERT INTO items (userid, name, description, category, brand, year, status, condition, purchase_price, ebay_listing_url, last_price_change_date)
VALUES
(1, 'Vintage Rolex Submariner', 'Classic dive watch in excellent condition', 'watch', 'Rolex', 1995, 'inventory', 'Excellent', 1000, '', '2026-02-28 09:15:00'),
(1, 'Charizard Holo Card', 'Pokemon Base Set holographic Charizard', 'trading card', 'Pokemon', 1999, 'inventory', 'Good', 200, '', '2026-02-28 14:22:00'),
(1, 'iPhone 12 Pro Max', 'A phone that has been used previously. The item may have some signs of cosmetic wear, but is fully operational and functions as intended.', 'Electronics', 'Apple', 1999, 'listed', 'Good', 125, '', '2026-02-28 11:00:00'),
(1, 'Dodgers Sweater', 'Los Angeles Dodgers Nike Dri Fit Authentic Water Resistant Pullover Mens Medium', 'Clothing', 'Nike', 2025, 'sold', 'Good', 30, '', '2026-02-28 16:45:00'),
(1, 'Signed Basketball', 'KAREEM ABDUL JABBAR AUTOGRAPHED SPALDING NBA BASKETBALL LA LAKERS JSA', 'Collectible', 'Spalding', 2025, 'listed', 'Good', 100, '', '2026-02-28 08:30:00'),
(1, 'Embroidered Jacket', 'Laura Ashley Black Embroidered Paisley Collared Denim Jacket Button Suit', 'Clothing', 'Laura Ashley', 2000, 'inventory', 'Good', 20, '', '2026-02-28 13:10:00'),
(1, 'Milwaukee Wrench', 'Milwaukee 2967-20 M18 FUEL 18V 1/2 in High Torque Impact Wrench with Friction Ring - Red', 'Electronics', 'Milwaukee', 2025, 'listed', 'New', 120, '', '2026-02-28 10:55:00'),
(1, 'Nintendo Switch', 'Nintendo Switch Console - Neon Red/Neon Blue Joy-Con', 'Electronics', 'Nintendo', 2017, 'sold', 'Good', 120, '', '2026-02-28 17:20:00'),
(1, 'Sony WH-1000XM4', 'Sony WH-1000XM4 Wireless Noise Cancelling Headphones - Silver', 'Electronics', 'Sony', 2020, 'listed', 'Good', 200, '', '2026-02-28 12:40:00'),
(1, 'Mens Air Jordan 1 High OG Palomino Size 11', 'A pair of pre-owned Mens Air Jordan 1 Retro High OG sneakers in the Palomino colorway, US size 11. The shoes feature a black leather upper with brown/palomino suede on the toe box, ankle flaps, and heel counter. The Nike Swoosh is also in matching suede. The sneakers have black laces and a sail-colored midsole. The Air Jordan Wings logo is visible on the ankle collar. These shoes show signs of wear, including visible creasing on the leather of the toe boxes and some light scuffs/discoloration on the midsoles. The suede shows some light wear. See photos for detailed condition.', 'Shoes', 'Nike', 2023, 'listed', 'Good', 70, 'https://sandbox.ebay.com/itm/110589144953', '2026-02-10 09:05:00');



-- ITEM IMAGES
INSERT INTO item_image (item_id, url)
VALUES
(1, 'https://i.ebayimg.com/images/g/tgkAAOSw37RlVn8Z/s-l1600.webp'),
(2, 'https://i.ebayimg.com/images/g/EFkAAeSw3p9ppLxr/s-l1600.webp'),
(3, 'https://i.ebayimg.com/images/g/6RYAAeSwvwZprZDz/s-l1600.webp'),
(4, 'https://i.ebayimg.com/images/g/ZX8AAeSwEG1pqyGW/s-l1600.webp'),
(5, 'https://i.ebayimg.com/images/g/8poAAeSwW3RprYxs/s-l1600.webp'),
(6, 'https://i.ebayimg.com/images/g/NcYAAeSwo2xprZ5X/s-l1600.webp'),
(7, 'https://i.ebayimg.com/images/g/edEAAeSw4YFpU-IB/s-l1600.webp'),
(8, 'https://i.ebayimg.com/images/g/kjwAAeSwlrFphgb4/s-l1600.webp'),
(9, 'https://i.ebayimg.com/images/g/ejAAAOSwcjlhIHtN/s-l1600.webp'),
(10, 'https://i.ebayimg.sandbox.ebay.com/images/g/WikAAeSwUy5pra0U/s-l1600.webp');




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
(1, 8000, 9500, 11000, 0.85, 12, 'Recent auction results for similar vintage Submariners in comparable condition.', 'Condition grading based on seller photos.', 'hold'),
(2, 200, 300, 400, 0.80, 30, 'Comparable PSA 1-2 Charizard sales in the past 3 months.', 'Exact grading unknown.', 'sell'),
(3, 520, 620, 720, 0.82, 45, 'Sold listings for used iPhone 12 Pro Max 128GB/256GB in Good condition.', 'Price varies by storage and carrier.', 'sell'),
(4, 35, 55, 75, 0.78, 18, 'Completed sales of Nike Dodgers pullovers and similar MLB gear, size M.', 'Season and team performance can affect demand.', 'sell'),
(5, 1200, 1650, 2100, 0.72, 8, 'JSA-certified Kareem Abdul-Jabbar signed basketballs and Lakers memorabilia.', 'Limited comps; authenticity drives premium.', 'hold'),
(6, 28, 42, 58, 0.70, 12, 'Laura Ashley and similar vintage denim jackets with embroidery.', 'Niche market; condition and size matter.', 'sell'),
(7, 220, 265, 310, 0.88, 22, 'Milwaukee M18 FUEL impact wrench kit sales, new and open-box.', 'Strong demand for bare tool and kit.', 'sell'),
(8, 195, 225, 255, 0.85, 60, 'Used Nintendo Switch Neon console sales; high volume of comps.', 'Joy-Con drift may affect realized price.', 'sell'),
(9, 210, 248, 285, 0.84, 38, 'Sony WH-1000XM4 used and refurbished sales in Good condition.', 'XM5 release has softened XM4 prices slightly.', 'sell'),
(10, 55, 70, 85, 0.55, 10, 'The appraisal is primarily based on a single highly relevant eBay listing for the Air Jordan 1 Retro High OG Palomino DZ5485-020 size 11 in Good pre-owned condition, listed at $99.00. Applying the rule that eBay asking prices are typically 10-20% higher than actual transaction prices, the estimated sold value falls between $79.20 and $89.10. Retail price ceilings from Amazon and Google Shopping for new Air Jordan 1 High OG models range from $135.00 to $223.00, which is consistent with a used item being valued significantly lower.', 'We couldnt find enough comparable listings', 'sell');


-- LISTING REFERENCES (appraisal_id resolved by item_id via subquery)
INSERT INTO listing_reference (url, source, price, appraisal_id, condition)
VALUES
('https://www.ebay.com/itm/235391314201', 'ebay', 11000, (SELECT id FROM appraisals WHERE item_id = 1 LIMIT 1), 'good'),
('https://www.ebay.com/itm/225678901234', 'ebay', 9200, (SELECT id FROM appraisals WHERE item_id = 1 LIMIT 1), 'excellent'),
('https://ebay.us/m/yNSb50', 'ebay', 299, (SELECT id FROM appraisals WHERE item_id = 2 LIMIT 1), 'PSA 1'),
('https://www.ebay.com/itm/256789012345', 'ebay', 375, (SELECT id FROM appraisals WHERE item_id = 2 LIMIT 1), 'PSA 2'),
('https://www.ebay.com/itm/266789023456', 'ebay', 589, (SELECT id FROM appraisals WHERE item_id = 3 LIMIT 1), 'good'),
('https://www.ebay.com/itm/276789034567', 'ebay', 649, (SELECT id FROM appraisals WHERE item_id = 3 LIMIT 1), 'good'),
('https://www.ebay.com/itm/286789045678', 'ebay', 52, (SELECT id FROM appraisals WHERE item_id = 4 LIMIT 1), 'good'),
('https://www.ebay.com/itm/296789056789', 'ebay', 61, (SELECT id FROM appraisals WHERE item_id = 4 LIMIT 1), 'new without tags'),
('https://www.ebay.com/itm/306789067890', 'ebay', 1899, (SELECT id FROM appraisals WHERE item_id = 5 LIMIT 1), 'good'),
('https://www.ebay.com/itm/316789078901', 'ebay', 1495, (SELECT id FROM appraisals WHERE item_id = 5 LIMIT 1), 'good'),
('https://www.ebay.com/itm/326789089012', 'ebay', 38, (SELECT id FROM appraisals WHERE item_id = 6 LIMIT 1), 'pre-owned'),
('https://www.ebay.com/itm/336789090123', 'ebay', 45, (SELECT id FROM appraisals WHERE item_id = 6 LIMIT 1), 'good'),
('https://www.ebay.com/itm/346789091234', 'ebay', 279, (SELECT id FROM appraisals WHERE item_id = 7 LIMIT 1), 'new'),
('https://www.ebay.com/itm/356789092345', 'ebay', 249, (SELECT id FROM appraisals WHERE item_id = 7 LIMIT 1), 'open box'),
('https://www.ebay.com/itm/366789093456', 'ebay', 219, (SELECT id FROM appraisals WHERE item_id = 8 LIMIT 1), 'good'),
('https://www.ebay.com/itm/376789094567', 'ebay', 238, (SELECT id FROM appraisals WHERE item_id = 8 LIMIT 1), 'good'),
('https://www.ebay.com/itm/386789095678', 'ebay', 229, (SELECT id FROM appraisals WHERE item_id = 9 LIMIT 1), 'good'),
('https://www.ebay.com/itm/396789096789', 'ebay', 259, (SELECT id FROM appraisals WHERE item_id = 9 LIMIT 1), 'like new'),
('https://www.ebay.com/itm/127582508996?_skw=Jordan+1+High+OG+Palomino+Size+11+Good+Pre-owned&hash=item1db48297c4:g:fswAAeSwUzJpTH39', 'ebay', 80, (SELECT id FROM appraisals WHERE item_id = 10 LIMIT 1), 'good'),
('https://www.amazon.com/AIR-JORDAN-RETRO-HIGH-OG/dp/B0DLGW1DM9?dib=eyJ2IjoiMSJ9.qYGxFpNcMOK07Sb31lxGNO32vmUcjEXkmgtCa8pPDn1XCSyKA07vDl8hCbYLpN5QiNZiUmNZMAVj8vnnognHE5bXuZpCYe_xyrbJ3OqtvqcV2_z2iDFVUB-KK6HeotA_y_hEL9cqlO1APYvSSxQaBfjxz-8TFQaxWS2k0ZkCtKwilXIdd1or-vzDW46HSDXToIAVgfuCP5BRAjMXetSFC6TfkZSrWazgdNW1uNTxO9mwTjnxUabSw35cHPSVj13hSacgh7FChj6RM4hj4oG0EUyde1-8fhW0JHlpbqAz4xM.LzYwwR1DlF-DvBKmaIeY24oy4zPK-BqdI5pX3Rq5OVE&dib_tag=se&keywords=Jordan+Air+Jordan+1+High+OG&qid=1772989528&sbo=RZvfv%2F%2FHxDF%2BO5021pAnSA%3D%3D&sr=8-2', 'amazon', 151, (SELECT id FROM appraisals WHERE item_id = 10 LIMIT 1), 'like new');

-- psql -d appraisal_db -f seed.sql