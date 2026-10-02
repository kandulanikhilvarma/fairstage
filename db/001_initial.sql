CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('employer','candidate')),
  company text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'US',
  email_verified boolean NOT NULL DEFAULT false,
  connect_id text UNIQUE,
  connect_ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  location text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  salary_min integer NOT NULL CHECK (salary_min >= 0),
  salary_max integer NOT NULL CHECK (salary_max >= salary_min),
  stages integer NOT NULL CHECK (stages BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(employer_id);
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  candidate_id uuid NOT NULL REFERENCES users(id),
  note text NOT NULL,
  status text NOT NULL DEFAULT 'applied',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,candidate_id)
);
CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES users(id),
  candidate_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('Introduction','Skills interview','Work sample')),
  minutes integer NOT NULL CHECK (minutes BETWEEN 15 AND 180),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 500 AND 1000000),
  fee_cents integer NOT NULL CHECK (fee_cents >= 0),
  scheduled_at timestamptz NOT NULL,
  meeting_url text NOT NULL,
  terms text NOT NULL,
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','funded','completed','paid','disputed','cancelled')),
  employer_confirmed boolean NOT NULL DEFAULT false,
  candidate_confirmed boolean NOT NULL DEFAULT false,
  payment_intent_id text UNIQUE,
  charge_id text UNIQUE,
  checkout_id text,
  transfer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (employer_id <> candidate_id)
);
CREATE INDEX IF NOT EXISTS rounds_employer ON rounds(employer_id);
CREATE INDEX IF NOT EXISTS rounds_candidate ON rounds(candidate_id);
CREATE TABLE IF NOT EXISTS ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id),
  type text NOT NULL CHECK (type IN ('funded','paid','refunded','disputed','reversed')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  provider_ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL UNIQUE REFERENCES rounds(id),
  opened_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);
