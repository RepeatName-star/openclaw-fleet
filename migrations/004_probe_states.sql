-- Probe state for exponential backoff + Full Jitter (restart-safe)

CREATE TABLE IF NOT EXISTS instance_probe_states (
  instance_id uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  probe_kind text NOT NULL,
  consecutive_failures integer NOT NULL DEFAULT 0,
  next_allowed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, probe_kind)
);

CREATE INDEX IF NOT EXISTS instance_probe_states_next_allowed_at_idx
  ON instance_probe_states (next_allowed_at);

