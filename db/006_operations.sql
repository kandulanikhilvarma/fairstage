CREATE INDEX IF NOT EXISTS auth_tokens_expiry ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS rounds_employer_page ON rounds(employer_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS rounds_candidate_page ON rounds(candidate_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS jobs_employer_page ON jobs(employer_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS jobs_public_page ON jobs(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS ledger_round_page ON ledger(round_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS disputes_round_page ON disputes(round_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS applications_candidate_page ON applications(candidate_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS applications_job_page ON applications(job_id,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS operation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed','failed')),
  counts jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_runs_job_time ON operation_runs(job,finished_at DESC);
