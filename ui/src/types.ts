export type InstanceSummary = {
  id: string;
  name: string;
  updated_at: string;
  online: boolean;
  control_ui_url?: string | null;
  skills_snapshot_at?: string | null;
};

export type TaskItem = {
  id: string;
  target_type: string;
  target_id: string;
  action: string;
  status: string;
  attempts: number;
  updated_at: string;
};

export type TaskAttempt = {
  attempt: number;
  status: string;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};
