ALTER TABLE subscriptions
  ADD COLUMN renewed_from_id BIGINT REFERENCES subscriptions(id);

ALTER TABLE invoices
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN cancelled_by BIGINT REFERENCES users(id),
  ADD COLUMN sent_to TEXT,
  ADD COLUMN billing_run_id BIGINT REFERENCES billing_runs(id);

ALTER TABLE invoice_lines
  ADD COLUMN tax_kind tax_kind;

ALTER TABLE billing_runs
  ADD COLUMN status TEXT NOT NULL DEFAULT 'succeeded'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  ADD COLUMN run_type TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (run_type IN ('scheduled', 'manual')),
  ADD COLUMN requested_by BIGINT REFERENCES users(id);

CREATE TABLE workspace_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO workspace_settings (key, value) VALUES
  ('auto_confirm_invoices', 'true'::jsonb),
  ('pause_policy', '"shift"'::jsonb),
  ('company_name', '"Brightloop Software"'::jsonb),
  ('invoice_footer', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX subscriptions_renewed_from_idx ON subscriptions (renewed_from_id)
  WHERE renewed_from_id IS NOT NULL;
CREATE INDEX billing_runs_started_idx ON billing_runs (started_at DESC);

CREATE OR REPLACE FUNCTION record_subscription_status_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_id BIGINT := NULLIF(current_setting('app.user_id', true), '')::BIGINT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO subscription_status_history (
      subscription_id, from_status, to_status, changed_by, note
    ) VALUES (
      NEW.id, OLD.status, NEW.status, actor_id, NEW.close_reason
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_subscription_status_history
  AFTER UPDATE OF status ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION record_subscription_status_history();
