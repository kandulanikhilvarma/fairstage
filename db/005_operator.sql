CREATE TABLE IF NOT EXISTS operator_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('dispute','repair')),
  source_id uuid NOT NULL,
  round_id uuid NOT NULL REFERENCES rounds(id),
  status text NOT NULL CHECK (status IN ('open','in_review','waiting_provider','closed')),
  decision text NOT NULL CHECK (decision IN ('pending','needs_information','provider_review','no_action')),
  owner_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind,source_id),
  CHECK (
    (status IN ('open','in_review') AND decision IN ('pending','needs_information')) OR
    (status='waiting_provider' AND decision='provider_review') OR
    (status='closed' AND decision='no_action')
  )
);

CREATE TABLE IF NOT EXISTS operator_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES operator_cases(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_name text NOT NULL,
  actor_email text NOT NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 3000),
  status text NOT NULL CHECK (status IN ('open','in_review','waiting_provider','closed')),
  decision text NOT NULL CHECK (decision IN ('pending','needs_information','provider_review','no_action')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id,version)
);

CREATE INDEX IF NOT EXISTS operator_cases_status ON operator_cases(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS operator_case_events_case ON operator_case_events(case_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS disputes_operator_queue ON disputes(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS audit_events_operator_queue ON audit_events(action,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION reject_operator_event_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Operator case events are append-only.';
END;
$$;

CREATE TRIGGER operator_case_events_append_only
BEFORE UPDATE OR DELETE ON operator_case_events
FOR EACH ROW EXECUTE FUNCTION reject_operator_event_change();
