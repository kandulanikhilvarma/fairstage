CREATE TABLE IF NOT EXISTS auth_identities (
  provider text NOT NULL CHECK (provider IN ('google')),
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider, subject)
);
CREATE INDEX IF NOT EXISTS auth_identities_user ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS oauth_challenges (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  nonce text NOT NULL,
  code_verifier text NOT NULL,
  role text NOT NULL CHECK (role IN ('employer','candidate')),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_challenges_expiry ON oauth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS magic_links (
  token_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('employer','candidate')),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS magic_links_expiry ON magic_links(expires_at);
