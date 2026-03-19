export type PaginatedItems<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type InstanceSummary = {
  id: string;
  name: string;
  display_name?: string | null;
  last_seen_ip?: string | null;
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

export type InstanceLabelItem = {
  key: string;
  value: string;
  source: "system" | "business" | string;
  updated_at: string;
};

export type GroupItem = {
  id: string;
  name: string;
  selector: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
};

export type GroupMatchItem = {
  id: string;
  name: string;
};

export type CampaignItem = {
  id: string;
  name: string;
  selector: string;
  action: string;
  payload?: Record<string, unknown>;
  gate?: Record<string, unknown>;
  rollout?: Record<string, unknown>;
  generation: number;
  status: "open" | "closed" | string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  expires_at?: string | null;
};

export type EventItem = {
  id: string;
  event_type: string;
  ts: string;
  campaign_id?: string | null;
  campaign_generation?: number | null;
  instance_id?: string | null;
  instance_name?: string | null;
  labels_snapshot: Record<string, string>;
  facts_snapshot?: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  artifact_id?: string | null;
};

export type ArtifactItem = {
  id: string;
  kind: string;
  created_at: string;
  expires_at: string;
  content: unknown;
  sha256?: string | null;
  bytes?: number | null;
};

export type SkillBundleItem = {
  id: string;
  name: string;
  format: "tar.gz" | string;
  created_at: string;
  sha256: string;
  size_bytes: number;
};
