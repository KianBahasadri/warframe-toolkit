DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS account_profile_chunks;
DROP TABLE IF EXISTS accounts;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  profile_hash TEXT NOT NULL,
  profile_chunks INTEGER NOT NULL CHECK (profile_chunks > 0),
  revision INTEGER NOT NULL DEFAULT 0,
  share_token TEXT
);
CREATE UNIQUE INDEX accounts_share_token ON accounts(share_token) WHERE share_token IS NOT NULL;

-- D1 limits each row to 2 MB. Keep the existing 10 MiB save limit by chunking.
CREATE TABLE account_profile_chunks (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  contents TEXT NOT NULL,
  PRIMARY KEY (account_id, profile_id, chunk_index)
);
