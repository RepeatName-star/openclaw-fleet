ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS control_ui_url text,
  ADD COLUMN IF NOT EXISTS skills_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skills_snapshot_at timestamptz;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS result jsonb;
