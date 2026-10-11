CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  access_key_hash TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  profile_hash TEXT NOT NULL,
  profile_chunks INTEGER NOT NULL CHECK (profile_chunks > 0),
  revision INTEGER NOT NULL DEFAULT 0
);
-- D1 limits each row to 2 MB. Keep the existing 10 MiB save limit by chunking.
CREATE TABLE account_profile_chunks (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  contents TEXT NOT NULL,
  PRIMARY KEY (account_id, profile_id, chunk_index)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
