-- =====================================================================
--  Subscription Management System  |  PostgreSQL 14+
--  Money = NUMERIC(12,2)   Timestamps = TIMESTAMPTZ   Dates = DATE
--  Run:  psql -d yourdb -f schema_new.sql
--
--  Flow:  catalog -> quotation template -> subscription -> invoice -> payment
--  Rule of thumb: documents (subscriptions, invoices) COPY prices, taxes and
--  discounts from the catalog when created, so later catalog edits never
--  change old invoices.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS & SEQUENCES
-- ---------------------------------------------------------------------
CREATE TYPE user_role           AS ENUM ('admin', 'staff', 'customer');
CREATE TYPE product_type        AS ENUM ('service', 'software', 'add_on', 'goods');
CREATE TYPE billing_period      AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
CREATE TYPE tax_kind            AS ENUM ('percentage', 'fixed');      -- fixed = amount per unit
CREATE TYPE discount_kind       AS ENUM ('percentage', 'fixed');
CREATE TYPE discount_scope      AS ENUM ('product', 'subscription');
CREATE TYPE subscription_status AS ENUM ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed');
CREATE TYPE invoice_status      AS ENUM ('draft', 'confirmed', 'paid', 'cancelled');
CREATE TYPE payment_method      AS ENUM ('cash', 'card', 'bank_transfer', 'upi', 'cheque', 'other');

CREATE SEQUENCE subscription_number_seq;
CREATE SEQUENCE invoice_number_seq;

-- ---------------------------------------------------------------------
-- 2. AUTH: users, roles, password reset
-- ---------------------------------------------------------------------
-- Public signup creates role='customer' only. Only an admin can create 'staff'.
-- Password rules (9+ chars, upper, lower, special) are checked in the app
-- BEFORE hashing; the DB only ever sees the hash.
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  full_name     TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'customer',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by    BIGINT      REFERENCES users(id),          -- the admin who added a staff member
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format CHECK (position('@' IN email) > 1)
);
-- one account per email, case-insensitive
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- Store only a hash of the emailed token. Single use, short expiry.
CREATE TABLE password_reset_tokens (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- ---------------------------------------------------------------------
-- 3. CUSTOMERS
-- ---------------------------------------------------------------------
-- A customer may exist without a login (staff created it). user_id links the
-- portal login. Portal queries must always filter by the logged-in user's
-- customer row (customers.user_id = :current_user).
CREATE TABLE customers (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  company_name  TEXT,
  email         TEXT        NOT NULL,
  phone         TEXT,
  tax_number    TEXT,                                       -- e.g. GSTIN / VAT id
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT        NOT NULL DEFAULT 'IN',
  created_by    BIGINT      REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. CATALOG: taxes, products, variants, plans, payment terms
-- ---------------------------------------------------------------------
-- percentage: rate is a % (18.00 = 18%).  fixed: rate is an amount per unit.
CREATE TABLE taxes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  kind       tax_kind    NOT NULL DEFAULT 'percentage',
  rate       NUMERIC(8,4) NOT NULL CHECK (rate >= 0),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT taxes_pct_max CHECK (kind <> 'percentage' OR rate <= 100)
);

CREATE TABLE products (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT         NOT NULL,
  type        product_type NOT NULL,
  sales_price NUMERIC(12,2) NOT NULL CHECK (sales_price >= 0),
  cost_price  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  tax_id      BIGINT       REFERENCES taxes(id),            -- default tax; admin-controlled
  notes       TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,           -- deactivate instead of delete
  created_by  BIGINT       REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- e.g. attribute='Brand', value='Odoo', extra_price=560
CREATE TABLE product_variants (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  BIGINT       NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute   TEXT         NOT NULL,
  value       TEXT         NOT NULL,
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE (product_id, attribute, value),
  UNIQUE (id, product_id)                                   -- lets lines prove variant belongs to product
);

-- billing_period + price = what/how often it bills. The boolean flags are the
-- admin's per-plan decisions about what can happen to subscriptions on it.
CREATE TABLE plans (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           TEXT           NOT NULL,
  price          NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
  billing_period billing_period NOT NULL,
  min_quantity   INTEGER        NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  available_from DATE           NOT NULL,
  available_to   DATE,
  auto_close     BOOLEAN        NOT NULL DEFAULT FALSE,     -- subscription closes itself at its expiry date
  is_closable    BOOLEAN        NOT NULL DEFAULT TRUE,      -- can be closed early
  is_pausable    BOOLEAN        NOT NULL DEFAULT FALSE,
  is_renewable   BOOLEAN        NOT NULL DEFAULT TRUE,
  is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
  created_by     BIGINT         REFERENCES users(id),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT plans_dates CHECK (available_to IS NULL OR available_to >= available_from)
);

CREATE TABLE payment_terms (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      TEXT    NOT NULL UNIQUE,                        -- 'Immediate', 'Net 30'
  due_days  INTEGER NOT NULL CHECK (due_days >= 0),         -- due_date = invoice_date + due_days
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- 5. DISCOUNTS (admin-only to create)
-- ---------------------------------------------------------------------
CREATE TABLE discount_rules (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                TEXT          NOT NULL,
  kind                discount_kind NOT NULL,
  value               NUMERIC(12,2) NOT NULL CHECK (value > 0),   -- % or amount
  scope               discount_scope NOT NULL,                    -- product lines only, or the whole subscription
  min_purchase_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_quantity        INTEGER       NOT NULL DEFAULT 0,
  start_date          DATE          NOT NULL,
  end_date            DATE,
  usage_limit         INTEGER       CHECK (usage_limit IS NULL OR usage_limit > 0),  -- NULL = unlimited
  times_used          INTEGER       NOT NULL DEFAULT 0,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_by          BIGINT        NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT discount_pct_max   CHECK (kind <> 'percentage' OR value <= 100),
  CONSTRAINT discount_dates     CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT discount_limit_ok  CHECK (usage_limit IS NULL OR times_used <= usage_limit)
);

-- For scope='product': which products the rule touches.
CREATE TABLE discount_products (
  discount_id BIGINT NOT NULL REFERENCES discount_rules(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id)       ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

-- ---------------------------------------------------------------------
-- 6. QUOTATION TEMPLATES
-- ---------------------------------------------------------------------
CREATE TABLE quotation_templates (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL,
  plan_id       BIGINT      NOT NULL REFERENCES plans(id),
  validity_days INTEGER     NOT NULL CHECK (validity_days > 0),
  notes         TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by    BIGINT      REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_template_lines (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id BIGINT  NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id  BIGINT  NOT NULL REFERENCES products(id),
  variant_id  BIGINT,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (variant_id, product_id) REFERENCES product_variants (id, product_id)
);

-- ---------------------------------------------------------------------
-- 7. SUBSCRIPTIONS
-- ---------------------------------------------------------------------
-- Lifecycle: draft -> quotation -> confirmed -> active -> closed
-- ('paused' is an extra state for plans that allow pausing).
-- Transitions are enforced by a trigger in section 10.
CREATE TABLE subscriptions (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number                TEXT        NOT NULL UNIQUE
                          DEFAULT 'SUB-' || lpad(nextval('subscription_number_seq')::text, 6, '0'),
  customer_id           BIGINT      NOT NULL REFERENCES customers(id),
  plan_id               BIGINT      NOT NULL REFERENCES plans(id),
  template_id           BIGINT      REFERENCES quotation_templates(id),   -- NULL if built from scratch
  salesperson_id        BIGINT      REFERENCES users(id),
  payment_term_id       BIGINT      NOT NULL REFERENCES payment_terms(id),
  status                subscription_status NOT NULL DEFAULT 'draft',
  start_date            DATE        NOT NULL,
  expiry_date           DATE        NOT NULL,
  quotation_valid_until DATE,                                -- created_on + template.validity_days
  next_invoice_date     DATE,                                -- billing cursor, advanced by the billing job
  notes                 TEXT,
  paused_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  close_reason          TEXT,
  created_by            BIGINT      REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subs_dates           CHECK (expiry_date >= start_date),
  CONSTRAINT subs_active_has_next CHECK (status <> 'active' OR next_invoice_date IS NOT NULL)
);

-- unit_price is COPIED from product.sales_price + variant.extra_price (editable per line).
CREATE TABLE subscription_lines (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id BIGINT        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id      BIGINT        NOT NULL REFERENCES products(id),
  variant_id      BIGINT,
  quantity        INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_id          BIGINT        REFERENCES taxes(id),
  line_subtotal   NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order      INTEGER       NOT NULL DEFAULT 0,
  FOREIGN KEY (variant_id, product_id) REFERENCES product_variants (id, product_id)
);

-- Discounts attached to a subscription. The billing job applies them to the next
-- invoice automatically and stops when expired or the usage limit is reached.
CREATE TABLE subscription_discounts (
  subscription_id BIGINT      NOT NULL REFERENCES subscriptions(id)   ON DELETE CASCADE,
  discount_id     BIGINT      NOT NULL REFERENCES discount_rules(id),
  added_by        BIGINT      REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, discount_id)
);

-- "Anyone on the team should see where it stands" + audit trail.
CREATE TABLE subscription_status_history (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id BIGINT      NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  from_status     subscription_status,
  to_status       subscription_status NOT NULL,
  changed_by      BIGINT      REFERENCES users(id),          -- NULL = system (auto-close, auto-activate)
  note            TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. INVOICES & PAYMENTS
-- ---------------------------------------------------------------------
-- NOTHING BILLED TWICE: the partial unique index below allows only one
-- non-cancelled invoice per subscription per billing period.
--
-- Billing job sketch (one transaction per subscription):
--   SELECT id FROM subscriptions
--    WHERE status = 'active' AND next_invoice_date <= current_date
--    ORDER BY next_invoice_date
--    FOR UPDATE SKIP LOCKED LIMIT 100;
--   -> INSERT invoice + lines, record discount redemptions,
--   -> UPDATE subscriptions SET next_invoice_date = <next period start>.
--   Loop until next_invoice_date > current_date so missed periods are caught up.
CREATE TABLE invoices (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number              TEXT          NOT NULL UNIQUE
                        DEFAULT 'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0'),
  subscription_id     BIGINT        NOT NULL REFERENCES subscriptions(id),
  customer_id         BIGINT        NOT NULL REFERENCES customers(id),
  status              invoice_status NOT NULL DEFAULT 'draft',
  invoice_date        DATE          NOT NULL DEFAULT current_date,
  due_date            DATE          NOT NULL,                -- invoice_date + payment term days
  period_start        DATE          NOT NULL,
  period_end          DATE          NOT NULL,
  -- customer details copied at creation, so edits to the customer don't rewrite history
  bill_to_name        TEXT          NOT NULL,
  bill_to_address     TEXT,
  bill_to_tax_number  TEXT,
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid         NUMERIC(12,2) NOT NULL DEFAULT 0,      -- kept in sync by trigger from payments
  confirmed_at        TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_by          BIGINT        REFERENCES users(id),    -- NULL = created by the billing job
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT invoices_period     CHECK (period_end >= period_start),
  CONSTRAINT invoices_due        CHECK (due_date >= invoice_date),
  CONSTRAINT invoices_totals     CHECK (total = subtotal - discount_total + tax_total),
  CONSTRAINT invoices_paid_nonneg CHECK (amount_paid >= 0)
);
CREATE UNIQUE INDEX invoices_one_per_period
  ON invoices (subscription_id, period_start, period_end)
  WHERE status <> 'cancelled';

-- Everything here is a snapshot: product name, price, tax rate and discount as
-- they were on the day of invoicing.
CREATE TABLE invoice_lines (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id           BIGINT        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  subscription_line_id BIGINT        REFERENCES subscription_lines(id) ON DELETE SET NULL,
  product_id           BIGINT        REFERENCES products(id),
  description          TEXT          NOT NULL,
  quantity             INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price           NUMERIC(12,2) NOT NULL,
  discount_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_id               BIGINT        REFERENCES taxes(id),
  tax_name             TEXT,
  tax_rate             NUMERIC(8,4),
  tax_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,     -- calculated on (subtotal - discount)
  line_subtotal        NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_total           NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price - discount_amount + tax_amount) STORED,
  CONSTRAINT invoice_lines_discount_cap CHECK (discount_amount <= quantity * unit_price)
);

-- Which discount gave how much on which invoice. times_used on the rule is
-- incremented atomically in the same transaction, e.g.:
--   UPDATE discount_rules SET times_used = times_used + 1
--    WHERE id = $1 AND is_active
--      AND current_date BETWEEN start_date AND COALESCE(end_date, 'infinity')
--      AND (usage_limit IS NULL OR times_used < usage_limit);
--   -- 0 rows updated = expired or exhausted, so don't apply it.
CREATE TABLE discount_redemptions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discount_id     BIGINT        NOT NULL REFERENCES discount_rules(id),
  subscription_id BIGINT        NOT NULL REFERENCES subscriptions(id),
  invoice_id      BIGINT        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (discount_id, invoice_id)
);

-- Record payments against confirmed invoices (checked in the app).
-- Several rows per invoice = partial payments.
CREATE TABLE payments (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id   BIGINT         NOT NULL REFERENCES invoices(id),
  method       payment_method NOT NULL,
  amount       NUMERIC(12,2)  NOT NULL CHECK (amount > 0),
  payment_date DATE           NOT NULL DEFAULT current_date,
  reference    TEXT,                                         -- txn id / cheque no.
  note         TEXT,
  recorded_by  BIGINT         REFERENCES users(id),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 9. OPERATIONS: billing run log, audit log
-- ---------------------------------------------------------------------
-- One row per scheduled run, so "nothing skipped" can be proven.
CREATE TABLE billing_runs (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_date       DATE        NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  due_count      INTEGER     NOT NULL DEFAULT 0,
  invoiced_count INTEGER     NOT NULL DEFAULT 0,
  failed_count   INTEGER     NOT NULL DEFAULT 0,
  errors         JSONB
);

CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    BIGINT      REFERENCES users(id),
  action      TEXT        NOT NULL,                          -- 'invoice.send', 'discount.create', ...
  entity_type TEXT        NOT NULL,
  entity_id   BIGINT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 10. TRIGGERS
-- ---------------------------------------------------------------------
-- 10a. keep updated_at fresh
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','customers','products','plans','discount_rules',
                           'quotation_templates','subscriptions','invoices']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- 10b. subscription state machine
CREATE FUNCTION check_subscription_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
       (OLD.status = 'draft'     AND NEW.status IN ('quotation', 'closed'))
    OR (OLD.status = 'quotation' AND NEW.status IN ('draft', 'confirmed', 'closed'))
    OR (OLD.status = 'confirmed' AND NEW.status IN ('active', 'closed'))
    OR (OLD.status = 'active'    AND NEW.status IN ('paused', 'closed'))
    OR (OLD.status = 'paused'    AND NEW.status IN ('active', 'closed'))
  ) THEN
    RAISE EXCEPTION 'Invalid subscription status change: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_subscription_transition
  BEFORE UPDATE OF status ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION check_subscription_transition();

-- 10c. payments -> invoice.amount_paid and Paid status
--      RACE FIX: lock the invoice row BEFORE summing. Without the lock, two
--      concurrent payments each sum only their own uncommitted row and the
--      last one to commit overwrites amount_paid with a too-small number.
--      FOR NO KEY UPDATE (not FOR UPDATE) because the payments foreign key
--      already holds a FOR KEY SHARE lock; FOR UPDATE would deadlock.
--      (all SET expressions below read the OLD row, so they stay consistent)
CREATE FUNCTION sync_invoice_payments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_invoice_id BIGINT := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid       NUMERIC(12,2);
BEGIN
  PERFORM 1 FROM invoices WHERE id = v_invoice_id FOR NO KEY UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE invoice_id = v_invoice_id;

  UPDATE invoices
     SET amount_paid = v_paid,
         paid_at = CASE
                     WHEN status = 'confirmed' AND v_paid >= total THEN now()
                     WHEN status = 'paid'      AND v_paid <  total THEN NULL
                     ELSE paid_at
                   END,
         status  = CASE
                     WHEN status = 'confirmed' AND v_paid >= total THEN 'paid'::invoice_status
                     WHEN status = 'paid'      AND v_paid <  total THEN 'confirmed'::invoice_status
                     ELSE status
                   END
   WHERE id = v_invoice_id;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_payments();

-- ---------------------------------------------------------------------
-- 11. INDEXES (for the sub-2-second dashboards and the billing job)
-- ---------------------------------------------------------------------
CREATE INDEX subs_customer_idx      ON subscriptions (customer_id);
CREATE INDEX subs_plan_idx          ON subscriptions (plan_id);
CREATE INDEX subs_status_idx        ON subscriptions (status);
CREATE INDEX subs_due_idx           ON subscriptions (next_invoice_date) WHERE status = 'active';
CREATE INDEX subs_expiry_idx        ON subscriptions (expiry_date)       WHERE status IN ('active', 'paused');
CREATE INDEX sub_lines_sub_idx      ON subscription_lines (subscription_id);
CREATE INDEX sub_history_sub_idx    ON subscription_status_history (subscription_id, changed_at DESC);

CREATE INDEX invoices_customer_idx  ON invoices (customer_id);
CREATE INDEX invoices_sub_idx       ON invoices (subscription_id);
CREATE INDEX invoices_status_due_idx ON invoices (status, due_date);
CREATE INDEX invoices_overdue_idx   ON invoices (due_date) WHERE status = 'confirmed';
CREATE INDEX invoices_date_idx      ON invoices (invoice_date);
CREATE INDEX invoice_lines_inv_idx  ON invoice_lines (invoice_id);

CREATE INDEX payments_invoice_idx   ON payments (invoice_id);
CREATE INDEX payments_date_idx      ON payments (payment_date);

CREATE INDEX discounts_active_idx   ON discount_rules (start_date, end_date) WHERE is_active;
CREATE INDEX redemptions_disc_idx   ON discount_redemptions (discount_id);
CREATE INDEX audit_entity_idx       ON audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- 12. REPORTING VIEWS (finance dashboard)
-- ---------------------------------------------------------------------
-- Overdue = confirmed (sent, not fully paid) and past due date. Computed, never stored.
CREATE VIEW v_overdue_invoices AS
SELECT i.id, i.number, i.customer_id, c.name AS customer_name,
       i.due_date, (current_date - i.due_date) AS days_overdue,
       i.total, i.amount_paid, (i.total - i.amount_paid) AS amount_due
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id
 WHERE i.status = 'confirmed' AND i.due_date < current_date;

-- Monthly recurring revenue per active subscription (before discounts and tax).
CREATE VIEW v_subscription_mrr AS
SELECT s.id AS subscription_id, s.customer_id,
       SUM(sl.line_subtotal) * CASE p.billing_period
         WHEN 'daily'   THEN 30
         WHEN 'weekly'  THEN 52.0 / 12
         WHEN 'monthly' THEN 1
         WHEN 'yearly'  THEN 1.0 / 12
       END AS mrr
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  JOIN subscription_lines sl ON sl.subscription_id = s.id
 WHERE s.status = 'active'
 GROUP BY s.id, s.customer_id, p.billing_period;

CREATE VIEW v_monthly_revenue AS
SELECT date_trunc('month', payment_date)::date AS month,
       SUM(amount) AS collected,
       COUNT(*)    AS payment_count
  FROM payments
 GROUP BY 1;

-- One-row summary. For date-filtered numbers, run the same aggregates with a WHERE in the API.
CREATE VIEW v_dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'active')                          AS active_subscriptions,
  (SELECT COALESCE(SUM(mrr), 0) FROM v_subscription_mrr)                                AS mrr,
  (SELECT COALESCE(SUM(amount), 0) FROM payments)                                       AS revenue_collected,
  (SELECT COALESCE(SUM(total - amount_paid), 0) FROM invoices WHERE status = 'confirmed') AS outstanding_amount,
  (SELECT COUNT(*) FROM v_overdue_invoices)                                             AS overdue_invoices,
  (SELECT COALESCE(SUM(amount_due), 0) FROM v_overdue_invoices)                         AS overdue_amount;

-- ---------------------------------------------------------------------
-- 13. SEED DATA
-- ---------------------------------------------------------------------
INSERT INTO payment_terms (name, due_days) VALUES
  ('Immediate', 0), ('Net 15', 15), ('Net 30', 30);

COMMIT;
