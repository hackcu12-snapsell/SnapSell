-- Fraud alerts table
-- Only written when Gemini assesses fraud_score >= 0.5.
-- Run after schema.sql: psql -d appraisal_db -f db/fraud_schema.sql

CREATE TABLE IF NOT EXISTS fraud_alerts (
    id          SERIAL PRIMARY KEY,
    item_id     INTEGER NOT NULL,
    fraud_score NUMERIC NOT NULL,        -- 0.0–1.0
    message     TEXT    NOT NULL,        -- human-readable summary for the buyer
    red_flags   JSONB   NOT NULL,        -- array of specific things to watch out for
    flagged_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_fraud_alerts_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_item_id ON fraud_alerts(item_id);
