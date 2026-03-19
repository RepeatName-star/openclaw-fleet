ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS last_seen_ip text;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_name text;

CREATE INDEX IF NOT EXISTS instances_display_name_idx ON instances (display_name);
CREATE INDEX IF NOT EXISTS tasks_task_name_idx ON tasks (task_name);
