CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  credits INTEGER DEFAULT 0,
  google_key TEXT DEFAULT '',
  anthropic_key TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by INTEGER,
  stripe_customer_id TEXT DEFAULT '',
  stripe_subscription_id TEXT DEFAULT '',
  trial_ends_at TIMESTAMPTZ,
  reset_token TEXT,
  reset_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prospects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT,
  phone TEXT,
  address TEXT,
  rating REAL,
  reviews INTEGER DEFAULT 0,
  city TEXT,
  status TEXT DEFAULT 'todo',
  notes TEXT DEFAULT '',
  rappel TEXT DEFAULT '',
  niche TEXT DEFAULT '',
  search_id INTEGER,
  website_url TEXT DEFAULT '',
  has_facebook INTEGER DEFAULT -1,
  has_instagram INTEGER DEFAULT -1,
  has_tiktok INTEGER DEFAULT -1,
  search_mode TEXT DEFAULT 'site',
  owner_name TEXT DEFAULT '',
  pipeline_stage TEXT DEFAULT 'cold_call',
  objection TEXT DEFAULT '',
  meeting_date TEXT DEFAULT '',
  deal_type TEXT DEFAULT '',
  deal_date TEXT DEFAULT '',
  deal_recurrence TEXT DEFAULT '',
  deal_value REAL DEFAULT 0,
  email TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add instagram_handle if missing
DO $$ BEGIN
  ALTER TABLE prospects ADD COLUMN instagram_handle TEXT DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  niche TEXT,
  country TEXT,
  results_count INTEGER DEFAULT 0,
  search_mode TEXT DEFAULT 'site',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_attempts (
  id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  attempt_type TEXT NOT NULL,
  result TEXT NOT NULL,
  note TEXT DEFAULT '',
  audio_data TEXT DEFAULT '',
  audio_duration INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_cache (
  id SERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  results_json TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  prospect_id INTEGER,
  number TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL DEFAULT 0,
  tva_rate REAL DEFAULT 20,
  tva REAL DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  token TEXT UNIQUE,
  notes TEXT DEFAULT '',
  valid_until TEXT DEFAULT '',
  signature_data TEXT DEFAULT '',
  signed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deleted_prospects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  phone TEXT,
  name_key TEXT,
  addr_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deleted_prospects_user ON deleted_prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_user ON prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_phone ON prospects(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_attempts_prospect ON call_attempts(prospect_id);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(token);
CREATE INDEX IF NOT EXISTS idx_quotes_prospect ON quotes(prospect_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
