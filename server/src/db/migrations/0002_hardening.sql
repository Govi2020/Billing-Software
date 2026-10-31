-- Extensions to schema_new.sql. The baseline already includes case-insensitive
-- email uniqueness, subscription history storage, invoice period identity,
-- amount_paid synchronization, and most reporting/index structures.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Rotating sessions, request idempotency, and transactional email delivery.
CREATE TABLE refresh_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  family_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  actor_id BIGINT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, endpoint, key)
);
CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys(created_at);

CREATE TABLE email_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  payload JSONB NOT NULL,
  dedupe_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX email_outbox_pending_idx ON email_outbox(id) WHERE status = 'pending';

-- Additional metadata needed for corrections and billing-run traceability.
ALTER TABLE invoices
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN cancelled_by BIGINT REFERENCES users(id),
  ADD COLUMN sent_to TEXT,
  ADD COLUMN billing_run_id BIGINT REFERENCES billing_runs(id);
ALTER TABLE billing_runs
  ADD COLUMN status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'schedule'
    CHECK (trigger_type IN ('schedule', 'manual'));

-- Preserve the tax calculation model in the issued line snapshot.
ALTER TABLE invoice_lines
  ADD COLUMN tax_kind tax_kind;

CREATE OR REPLACE FUNCTION check_invoice_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
       (OLD.status = 'draft' AND NEW.status IN ('confirmed', 'cancelled'))
    OR (OLD.status = 'confirmed' AND NEW.status IN ('paid', 'cancelled'))
    OR (OLD.status = 'paid' AND NEW.status = 'confirmed')
  ) THEN
    RAISE EXCEPTION 'Invalid invoice status change: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_invoice_transition
  BEFORE UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION check_invoice_transition();

CREATE OR REPLACE FUNCTION guard_invoice_line_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_invoice_id BIGINT;
  target_status invoice_status;
BEGIN
  target_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  SELECT status INTO target_status
    FROM invoices
    WHERE id = target_invoice_id
    FOR UPDATE;
  IF target_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Invoice lines can only be changed while the invoice is draft'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_invoice_lines_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_line_mutation();

-- Capture subscription state changes made by users or system jobs. The caller
-- sets app.user_id transaction-locally; missing/empty means a system change.
CREATE OR REPLACE FUNCTION record_subscription_status_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_setting TEXT;
BEGIN
  actor_setting := NULLIF(current_setting('app.user_id', true), '');
  INSERT INTO subscription_status_history
    (subscription_id, from_status, to_status, changed_by)
  VALUES
    (NEW.id, OLD.status, NEW.status, actor_setting::BIGINT);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscription_status_history
  AFTER UPDATE OF status ON subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION record_subscription_status_change();

-- Serialize payment validation with the invoice row lock. The baseline
-- trg_payments_sync keeps amount_paid and paid status in sync after insertion.
CREATE OR REPLACE FUNCTION guard_payment_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_status invoice_status;
  current_paid NUMERIC(12,2);
  invoice_total NUMERIC(12,2);
BEGIN
  SELECT status, amount_paid, total
    INTO current_status, current_paid, invoice_total
    FROM invoices
    WHERE id = NEW.invoice_id
    FOR NO KEY UPDATE;
  IF NOT FOUND OR current_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Payments require a confirmed invoice'
      USING ERRCODE = 'P0001';
  END IF;
  IF current_paid + NEW.amount > invoice_total THEN
    RAISE EXCEPTION 'Payment would exceed invoice total'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_payment_guard
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION guard_payment_insert();

-- Search indexes from the hardening spec.
CREATE INDEX customers_name_trgm_idx
  ON customers USING gin (name gin_trgm_ops);
CREATE INDEX customers_company_name_trgm_idx
  ON customers USING gin (company_name gin_trgm_ops);
CREATE INDEX customers_email_trgm_idx
  ON customers USING gin (email gin_trgm_ops);
CREATE INDEX subscriptions_number_trgm_idx
  ON subscriptions USING gin (number gin_trgm_ops);
CREATE INDEX invoices_number_trgm_idx
  ON invoices USING gin (number gin_trgm_ops);
