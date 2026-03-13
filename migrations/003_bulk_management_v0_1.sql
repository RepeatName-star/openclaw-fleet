-- Bulk management v0.1 (Selector/Campaign/Gate/Events/Artifacts/Skill Bundles)

-- =========================
-- Instance facts (v0.1)
-- =========================
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS gateway_reachable boolean,
  ADD COLUMN IF NOT EXISTS gateway_reachable_at timestamptz,
  ADD COLUMN IF NOT EXISTS openclaw_version text,
  ADD COLUMN IF NOT EXISTS openclaw_version_at timestamptz,
  -- Event-driven invalidation marker for skills snapshot freshness.
  ADD COLUMN IF NOT EXISTS skills_snapshot_invalidated_at timestamptz;

-- =========================
-- Labels
-- =========================
CREATE TABLE IF NOT EXISTS instance_labels (
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL DEFAULT '',
  -- "system" or "business"
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, key)
);

CREATE INDEX IF NOT EXISTS instance_labels_source_idx ON instance_labels (source);
CREATE INDEX IF NOT EXISTS instance_labels_key_idx ON instance_labels (key);
CREATE INDEX IF NOT EXISTS instance_labels_key_value_idx ON instance_labels (key, value);

-- =========================
-- Groups as named selectors
-- =========================
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS selector text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- =========================
-- Campaigns (fan-out batch execution)
-- =========================
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  selector text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  gate jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollout jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation integer NOT NULL DEFAULT 1,
  -- "open" or "closed"
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status);
CREATE INDEX IF NOT EXISTS campaigns_expires_at_idx ON campaigns (expires_at);

-- Per-instance campaign state with idempotency by (campaign_id, generation, instance_id).
CREATE TABLE IF NOT EXISTS campaign_instances (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending',
  blocked_reason text,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  last_transition_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, generation, instance_id)
);

CREATE INDEX IF NOT EXISTS campaign_instances_state_idx ON campaign_instances (state);
CREATE INDEX IF NOT EXISTS campaign_instances_instance_id_idx ON campaign_instances (instance_id);

-- =========================
-- Artifacts (raw payload/results for analysis)
-- =========================
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  content jsonb NOT NULL,
  sha256 text,
  bytes integer
);

CREATE INDEX IF NOT EXISTS artifacts_expires_at_idx ON artifacts (expires_at);

-- =========================
-- Events (L2 audit timeline)
-- =========================
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_generation integer,
  instance_id uuid REFERENCES instances(id) ON DELETE SET NULL,
  instance_name text,
  labels_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  facts_snapshot jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts);
CREATE INDEX IF NOT EXISTS events_campaign_id_idx ON events (campaign_id, campaign_generation);
CREATE INDEX IF NOT EXISTS events_instance_id_idx ON events (instance_id);

-- =========================
-- Skill bundles (tar.gz)
-- =========================
CREATE TABLE IF NOT EXISTS skill_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  format text NOT NULL DEFAULT 'tar.gz',
  created_at timestamptz NOT NULL DEFAULT now(),
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL,
  content bytea NOT NULL
);

CREATE INDEX IF NOT EXISTS skill_bundles_sha256_idx ON skill_bundles (sha256);
CREATE INDEX IF NOT EXISTS skill_bundles_name_idx ON skill_bundles (name);
