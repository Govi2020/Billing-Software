ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renewed_from_id BIGINT REFERENCES subscriptions(id);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS sent_to TEXT,
  ADD COLUMN IF NOT EXISTS billing_run_id BIGINT REFERENCES billing_runs(id);

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS tax_kind tax_kind;

ALTER TABLE billing_runs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_runs_status_check') THEN
    ALTER TABLE billing_runs ADD CONSTRAINT billing_runs_status_check
      CHECK (status IN ('running', 'succeeded', 'partial', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_runs_trigger_check') THEN
    ALTER TABLE billing_runs ADD CONSTRAINT billing_runs_trigger_check
      CHECK (trigger IN ('schedule', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscription_discounts_discount_idx
  ON subscription_discounts(discount_id);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_company_trgm_idx ON customers USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_email_trgm_idx ON customers USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS subscriptions_number_trgm_idx ON subscriptions USING gin (number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS invoices_number_trgm_idx ON invoices USING gin (number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_email_lower_idx ON customers (lower(email));

CREATE OR REPLACE VIEW v_subscription_mrr AS
SELECT s.id AS subscription_id, s.customer_id,
       SUM(sl.line_subtotal) * CASE p.billing_period
         WHEN 'daily' THEN 30
         WHEN 'weekly' THEN 52.0 / 12
         WHEN 'monthly' THEN 1
         WHEN 'yearly' THEN 1.0 / 12
         ELSE NULL
       END AS mrr
  FROM subscriptions s JOIN plans p ON p.id=s.plan_id
  JOIN subscription_lines sl ON sl.subscription_id=s.id
 WHERE s.status='active'
 GROUP BY s.id, s.customer_id, p.billing_period;

CREATE OR REPLACE FUNCTION assert_invoice_line_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  invoice_key BIGINT;
  header invoices%ROWTYPE;
  sum_subtotal NUMERIC(12,2);
  sum_discount NUMERIC(12,2);
  sum_tax NUMERIC(12,2);
  sum_total NUMERIC(12,2);
BEGIN
  IF TG_TABLE_NAME='invoices' THEN
    invoice_key := COALESCE(NEW.id, OLD.id);
  ELSE
    invoice_key := COALESCE(NEW.invoice_id, OLD.invoice_id);
  END IF;
  SELECT * INTO header FROM invoices WHERE id=invoice_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(line_subtotal),0), COALESCE(SUM(discount_amount),0),
         COALESCE(SUM(tax_amount),0), COALESCE(SUM(line_total),0)
    INTO sum_subtotal, sum_discount, sum_tax, sum_total
    FROM invoice_lines WHERE invoice_id=invoice_key;
  IF header.subtotal IS DISTINCT FROM sum_subtotal
     OR header.discount_total IS DISTINCT FROM sum_discount
     OR header.tax_total IS DISTINCT FROM sum_tax
     OR header.total IS DISTINCT FROM sum_total THEN
    RAISE EXCEPTION 'Invoice totals do not match line totals for invoice %', invoice_key;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_totals_from_lines ON invoice_lines;
CREATE CONSTRAINT TRIGGER trg_invoice_totals_from_lines
  AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION assert_invoice_line_totals();
DROP TRIGGER IF EXISTS trg_invoice_totals_from_header ON invoices;
CREATE CONSTRAINT TRIGGER trg_invoice_totals_from_header
  AFTER INSERT OR UPDATE ON invoices
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION assert_invoice_line_totals();

ALTER TABLE taxes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE payment_terms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE payment_terms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS email_outbox_retry_idx
  ON email_outbox(next_attempt_at, id) WHERE status='pending';
DROP TRIGGER IF EXISTS trg_taxes_updated ON taxes;
CREATE TRIGGER trg_taxes_updated BEFORE UPDATE ON taxes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_payment_terms_updated ON payment_terms;
CREATE TRIGGER trg_payment_terms_updated BEFORE UPDATE ON payment_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_product_variants_updated ON product_variants;
CREATE TRIGGER trg_product_variants_updated BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION record_subscription_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor_text TEXT := NULLIF(current_setting('app.user_id', true), '');
  note_text TEXT := NULLIF(current_setting('app.status_note', true), '');
BEGIN
  INSERT INTO subscription_status_history (subscription_id, from_status, to_status, changed_by, note)
  VALUES (NEW.id, OLD.status, NEW.status, actor_text::bigint, note_text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscription_status_history ON subscriptions;
CREATE TRIGGER trg_subscription_status_history AFTER UPDATE OF status ON subscriptions
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION record_subscription_status_change();

CREATE OR REPLACE FUNCTION check_invoice_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT ((OLD.status='draft' AND NEW.status IN ('confirmed','cancelled'))
       OR (OLD.status='confirmed' AND NEW.status IN ('paid','cancelled'))
       OR (OLD.status='paid' AND NEW.status='confirmed')) THEN
    RAISE EXCEPTION 'Invalid invoice status change: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_transition ON invoices;
CREATE TRIGGER trg_invoice_transition BEFORE UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION check_invoice_transition();

CREATE OR REPLACE FUNCTION guard_invoice_line_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_invoice_id BIGINT := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_status invoice_status;
BEGIN
  SELECT status INTO v_status FROM invoices WHERE id=v_invoice_id FOR NO KEY UPDATE;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Invoice lines can only be changed while invoice is draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_line_guard ON invoice_lines;
CREATE TRIGGER trg_invoice_line_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION guard_invoice_line_mutation();

CREATE OR REPLACE FUNCTION guard_payment_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_status invoice_status;
  v_total NUMERIC(12,2);
  v_paid NUMERIC(12,2);
BEGIN
  SELECT status, total INTO v_status, v_total
    FROM invoices WHERE id=NEW.invoice_id FOR NO KEY UPDATE;
  IF v_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'Payments require a confirmed invoice';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM payments WHERE invoice_id=NEW.invoice_id;
  IF v_paid + NEW.amount > v_total THEN
    RAISE EXCEPTION 'Payment exceeds invoice balance';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payment_insert_guard ON payments;
CREATE TRIGGER trg_payment_insert_guard BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION guard_payment_insert();
