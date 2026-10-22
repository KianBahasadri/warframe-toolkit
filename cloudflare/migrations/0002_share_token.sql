ALTER TABLE accounts ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX accounts_share_token ON accounts(share_token) WHERE share_token IS NOT NULL;
