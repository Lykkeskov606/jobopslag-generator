-- Enable pgvector for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
  subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'tier1_monthly', 'tier2_monthly', 'pay_per_use')),
  preferred_output_language TEXT NOT NULL DEFAULT 'da' CHECK (preferred_output_language IN ('da', 'en')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier IN (1, 2)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived')),
  output_language TEXT NOT NULL DEFAULT 'da' CHECK (output_language IN ('da', 'en')),
  jurisdiction TEXT NOT NULL DEFAULT 'dk',
  completion_step INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Project members (v1: only owner, v2: adds contributor/viewer)
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'contributor', 'viewer')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),
  UNIQUE (project_id, user_id)
);

-- Project inputs per step (JSONB)
CREATE TABLE IF NOT EXISTS project_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  input_data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, step_number)
);

-- Project outputs
CREATE TABLE IF NOT EXISTS project_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL,
  variant TEXT,
  content TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('da', 'en')),
  ai_model_version TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI calls audit trail
CREATE TABLE IF NOT EXISTS ai_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  step_number INTEGER,
  prompt_file TEXT,
  response_text TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_cents INTEGER,
  latency_ms INTEGER,
  ai_model_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bias violations audit trail
CREATE TABLE IF NOT EXISTS bias_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  step_number INTEGER,
  rule_triggered TEXT NOT NULL,
  text_snippet TEXT,
  user_action TEXT CHECK (user_action IN ('resolved', 'ignored', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bias rules (hard-coded + manageable via admin)
CREATE TABLE IF NOT EXISTS bias_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  jurisdictions TEXT[] NOT NULL DEFAULT ARRAY['dk'],
  languages TEXT[] NOT NULL DEFAULT ARRAY['da', 'en'],
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RAG sources
CREATE TABLE IF NOT EXISTS rag_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  citation TEXT NOT NULL,
  content_chunk TEXT NOT NULL,
  embedding vector(1536),
  jurisdictions TEXT[] NOT NULL DEFAULT ARRAY['universal'],
  languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
  active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_version TEXT
);

-- Project outcomes (v1: table exists, populated in v2+)
CREATE TABLE IF NOT EXISTS project_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'applications_received', 'qualified_applications', 'interviews_held',
    'hired', 'retention_6m', 'retention_12m', 'performance_rating'
  )),
  value NUMERIC,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('manual', 'email_survey', 'ats', 'self_report'))
);

-- Events (for admin drop-off analysis and funnel tracking)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'signup', 'login', 'project_started', 'step_completed',
    'project_abandoned', 'project_downloaded', 'subscription_started',
    'subscription_cancelled', 'bias_triggered', 'ai_call_made'
  )),
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily metrics (precomputed nightly by cron job)
CREATE TABLE IF NOT EXISTS daily_metrics (
  date DATE PRIMARY KEY,
  active_users INTEGER NOT NULL DEFAULT 0,
  new_signups INTEGER NOT NULL DEFAULT 0,
  tier1_projects INTEGER NOT NULL DEFAULT 0,
  tier2_projects INTEGER NOT NULL DEFAULT 0,
  completed_projects INTEGER NOT NULL DEFAULT 0,
  ai_cost_cents INTEGER NOT NULL DEFAULT 0,
  mrr_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_project ON ai_calls(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_created ON ai_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_bias_violations_project ON bias_violations(project_id);
CREATE INDEX IF NOT EXISTS idx_rag_sources_active ON rag_sources(active);

-- Seed bias rules (Tier A — Danish juridical risk)
INSERT INTO bias_rules (pattern, category, severity, jurisdictions, languages) VALUES
  ('ung|yngre|frisk|moden|ældre|\+50|senior|junior|nyuddannet', 'age_discrimination', 'high', ARRAY['dk'], ARRAY['da']),
  ('rockstar|ninja|guru|warrior|aggressiv|dominerende|drengerøv|hardcore', 'gendered_masculine', 'high', ARRAY['dk'], ARRAY['da']),
  ('støttende|samarbejdsvillig|indlevende|omsorgsfuld', 'gendered_feminine_balance', 'medium', ARRAY['dk'], ARRAY['da']),
  ('han/hun|mand/kvinde', 'direct_gender_spec', 'high', ARRAY['dk'], ARRAY['da']),
  ('dansk baggrund|skandinavisk|kun europæere', 'ethnicity', 'high', ARRAY['dk'], ARRAY['da']),
  ('single|uden familieforpligtelser|ung mor', 'family_status', 'high', ARRAY['dk'], ARRAY['da']),
  ('skal være sund|uden begrænsninger|fysisk stærk', 'disability', 'high', ARRAY['dk'], ARRAY['da']),
  ('kristen|muslim|jødisk', 'religion', 'high', ARRAY['dk'], ARRAY['da']),
  -- Tier B — bias words
  ('krigsmaskine|killer instinct|dominerer markedet|dominerer feltet', 'aggressive_metaphor', 'medium', ARRAY['dk'], ARRAY['da']),
  ('passer ind i vores DNA|som en af os|en del af familien', 'cultural_exclusion', 'medium', ARRAY['dk'], ARRAY['da']),
  ('de bedste|top 1%|elitespiller', 'vague_elite_signal', 'low', ARRAY['dk'], ARRAY['da']),
  ('kun fra de bedste universiteter', 'education_elitism', 'medium', ARRAY['dk'], ARRAY['da']),
  -- English equivalents
  ('aggressive|dominant|competitive|decisive|fearless|rockstar|ninja|guru|wheelhouse|a-player', 'gendered_masculine_en', 'high', ARRAY['dk'], ARRAY['en']),
  ('supportive|collaborative|empathetic|nurturing', 'gendered_feminine_balance_en', 'medium', ARRAY['dk'], ARRAY['en']),
  ('rock star|top performer|best of the best|world-class', 'elite_signal_en', 'low', ARRAY['dk'], ARRAY['en'])
ON CONFLICT DO NOTHING;
