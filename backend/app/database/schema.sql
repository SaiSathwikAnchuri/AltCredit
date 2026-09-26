-- AltCredit MySQL schema (InnoDB / utf8mb4). Raw source tables keep their original
-- columns plus provenance (source, ingestion_run_id). Derived tables (scores, factors,
-- ML predictions) are append-only so score history is retained.
--
-- Note: this schema intentionally does not declare FOREIGN KEY constraints (the
-- original SQLite schema used them only as documentation/PRAGMA-level checks, not
-- for cascading behaviour) — id columns that logically reference another table are
-- kept as plain, indexed VARCHAR columns to avoid load-order/orphan-row failures
-- during ingestion. Short id-style TEXT columns are VARCHAR(64) so they can be
-- primary-keyed/indexed directly.

CREATE TABLE IF NOT EXISTS ingestion_runs (
    run_id        INT AUTO_INCREMENT PRIMARY KEY,
    source        TEXT NOT NULL,
    started_at    TEXT NOT NULL,
    finished_at   TEXT,
    status        TEXT NOT NULL,
    stats_json    TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ingestion_errors (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    run_id        INT,
    file          TEXT, check_code TEXT, severity TEXT, row_ref TEXT, message TEXT, count INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    user_id            VARCHAR(64) PRIMARY KEY,
    applicant_id       VARCHAR(64),
    age                INT,
    education_level    TEXT,
    employment_status  TEXT,
    monthly_income     DOUBLE,
    city_tier          INT,
    housing_status     TEXT,
    cohort             TEXT NOT NULL,      -- historical | live | official_sample | uploaded
    source             TEXT NOT NULL,
    match_confidence   DOUBLE DEFAULT 1.0,
    as_of_date         VARCHAR(32) NOT NULL,      -- scoring date convention (T-01)
    demo_label         TEXT,
    ingestion_run_id   INT,
    created_at         TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS contacts (
    user_id       VARCHAR(64) PRIMARY KEY,
    display_name  TEXT, phone TEXT, locality TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS employment_spells (
    spell_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, employment_type TEXT, employer_category TEXT,
    start_date TEXT, end_date TEXT, declared_income DOUBLE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS residence_spells (
    spell_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, housing_status TEXT, city_tier INT,
    monthly_rent DOUBLE, start_date TEXT, end_date TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,  -- surrogate key: MySQL has no SQLite-style implicit rowid to sort ties by
    transaction_id VARCHAR(64), user_id VARCHAR(64) NOT NULL, date VARCHAR(32) NOT NULL, amount DOUBLE NOT NULL, category TEXT NOT NULL,
    type TEXT NOT NULL, status TEXT, balance_after DOUBLE, subtype TEXT, source TEXT, ingestion_run_id INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_txn_user_date ON transactions(user_id, date);
CREATE TABLE IF NOT EXISTS obligations (
    id INT AUTO_INCREMENT PRIMARY KEY,  -- surrogate key: same reason as transactions.id
    bill_id VARCHAR(64), user_id VARCHAR(64) NOT NULL, obligation_type TEXT NOT NULL, due_date VARCHAR(32) NOT NULL, amount_due DOUBLE,
    paid_date TEXT, amount_paid DOUBLE, days_past_due INT, autopay INT, status TEXT, credit_account_id VARCHAR(64),
    source TEXT, ingestion_run_id INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_obl_user_due ON obligations(user_id, due_date);
CREATE TABLE IF NOT EXISTS credit_accounts (
    credit_account_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, account_type TEXT, lender_type TEXT,
    limit_or_principal DOUBLE, emi DOUBLE, open_date TEXT, close_date TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_acc_user ON credit_accounts(user_id);
CREATE TABLE IF NOT EXISTS card_statements (
    account_id VARCHAR(64), user_id VARCHAR(64) NOT NULL, statement_month TEXT, credit_limit DOUBLE, opening_balance DOUBLE, card_spend DOUBLE,
    payment_amount DOUBLE, outstanding_balance DOUBLE, minimum_due DOUBLE, payment_status TEXT, utilization DOUBLE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_stmt_user ON card_statements(user_id);
CREATE TABLE IF NOT EXISTS life_events (
    event_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, event_type TEXT, event_date TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_life_user ON life_events(user_id);

CREATE TABLE IF NOT EXISTS lenders (
    lender_id VARCHAR(64) PRIMARY KEY, lender_name TEXT NOT NULL, lender_type TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS products (
    product_id VARCHAR(64) PRIMARY KEY, product_name TEXT NOT NULL, type TEXT NOT NULL, min_score INT NOT NULL,
    interest_rate TEXT, interest_rate_pct DOUBLE, amount_min DOUBLE, amount_max DOUBLE, tenure_months DOUBLE,
    annual_fee DOUBLE, segment TEXT, lender_id VARCHAR(64), official INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historical outcome data (Case 1 / Case 2 training only)
CREATE TABLE IF NOT EXISTS historical_applications (
    application_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), application_date TEXT, requested_product_id VARCHAR(64), booked_product_id VARCHAR(64),
    decision TEXT, decline_reason TEXT, booked_amount DOUBLE, tenure_months DOUBLE, default_12m DOUBLE, default_month DOUBLE,
    observation_end_date TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS historical_offers (
    offer_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), product_id VARCHAR(64), lender_id VARCHAR(64), offer_date TEXT, expiry_date TEXT, channel TEXT,
    campaign_type TEXT, offered_rate DOUBLE, offered_amount DOUBLE, score_at_offer DOUBLE, eligible TEXT, response TEXT,
    response_date TEXT, time_to_accept_days DOUBLE, booked TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_hoff_user ON historical_offers(user_id);
CREATE TABLE IF NOT EXISTS simulator_events (
    event_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), event_ts TEXT, session_id TEXT, event_type TEXT, scenario_type TEXT,
    target_product_id VARCHAR(64), simulated_score_delta DOUBLE, source VARCHAR(32) DEFAULT 'dataset', detail_json TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_sim_user ON simulator_events(user_id);

-- Derived: rule scores (authoritative) and ML predictions (secondary)
CREATE TABLE IF NOT EXISTS scores (
    score_id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64) NOT NULL, as_of TEXT NOT NULL,
    score INT NOT NULL, raw_score INT NOT NULL, tier TEXT NOT NULL, decision TEXT NOT NULL,
    data_quality TEXT, rule_version TEXT NOT NULL, `trigger` TEXT, computed_at TEXT NOT NULL, latency_ms DOUBLE,
    is_current INT DEFAULT 1, result_json LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_scores_user ON scores(user_id, is_current);
CREATE TABLE IF NOT EXISTS score_factors (
    score_id INT, factor_id TEXT, points INT, max_points INT, band TEXT,
    value_display TEXT, status TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_sf_score ON score_factors(score_id);
CREATE TABLE IF NOT EXISTS ml_predictions (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64) NOT NULL, score_id INT, model_version TEXT NOT NULL,
    pd DOUBLE, ml_risk_score INT, ml_band TEXT, confidence TEXT, agreement_status TEXT, review_flag TEXT,
    detail_json TEXT, computed_at TEXT NOT NULL, is_current INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_ml_user ON ml_predictions(user_id, is_current);

-- Lender offers and the offer lifecycle
CREATE TABLE IF NOT EXISTS campaigns (
    campaign_id VARCHAR(64) PRIMARY KEY, lender_id VARCHAR(64), name TEXT, product_id VARCHAR(64), created_at TEXT, n_targeted INT, n_sent INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS offers (
    offer_id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, lender_id VARCHAR(64) NOT NULL, product_id VARCHAR(64) NOT NULL,
    interest_rate DOUBLE, amount DOUBLE, message TEXT, status TEXT NOT NULL, campaign_id VARCHAR(64),
    score_at_offer INT, propensity DOUBLE, created_at TEXT NOT NULL, expires_at TEXT, responded_at TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_offers_user ON offers(user_id);
CREATE INDEX ix_offers_lender ON offers(lender_id);
CREATE TABLE IF NOT EXISTS offer_events (
    id INT AUTO_INCREMENT PRIMARY KEY, offer_id VARCHAR(64), event TEXT, actor TEXT, ts TEXT, detail_json TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS bank_applications (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), product_id VARCHAR(64), offer_id VARCHAR(64), bank_reference TEXT,
    status TEXT, preapproval_id TEXT, created_at TEXT, updated_at TEXT, response_json TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS counterfactual_requests (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), product_id VARCHAR(64), current_score INT, target_score INT,
    reachable INT, result_json TEXT, created_at TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Auth and audit
CREATE TABLE IF NOT EXISTS auth_accounts (
    username VARCHAR(64) PRIMARY KEY, password_hash TEXT NOT NULL, `role` TEXT NOT NULL,
    user_id VARCHAR(64), lender_id VARCHAR(64), display_name TEXT, created_at TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY, ts TEXT NOT NULL, actor TEXT, action TEXT NOT NULL, entity VARCHAR(64), entity_id VARCHAR(64),
    rule_version TEXT, model_version TEXT, detail_json TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX ix_audit_entity ON audit_logs(entity, entity_id);
CREATE TABLE IF NOT EXISTS reveals (
    user_id VARCHAR(64), lender_id VARCHAR(64), offer_id VARCHAR(64), revealed_at TEXT, PRIMARY KEY (user_id, lender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
