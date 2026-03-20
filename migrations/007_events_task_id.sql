ALTER TABLE events
ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_task_id_idx ON events (task_id);
