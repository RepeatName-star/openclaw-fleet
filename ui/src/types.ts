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

export type InstanceToolConfig = {
  base_url?: string;
  username?: string;
  default_from_email?: string;
  default_from_name?: string;
};

export type InstanceToolItem = {
  id: string;
  tool_type: string;
  name: string;
  enabled: boolean;
  config: InstanceToolConfig;
};

export type InstanceMailAddress = {
  Name?: string | null;
  Address?: string | null;
  Email?: string | null;
};

export type InstanceMailMessageItem = {
  ID: string;
  MessageID?: string | null;
  Read?: boolean;
  From?: InstanceMailAddress | null;
  To?: InstanceMailAddress[] | null;
  Subject?: string | null;
  Created?: string | null;
  Date?: string | null;
  Snippet?: string | null;
  Tags?: string[] | null;
  Attachments?: number;
};

export type InstanceMailMessagePage = {
  total: number;
  unread: number;
  count: number;
  start: number;
  messages: InstanceMailMessageItem[];
};

export type InstanceMailMessageDetail = {
  ID: string;
  MessageID?: string | null;
  From?: InstanceMailAddress | null;
  To?: InstanceMailAddress[] | null;
  Cc?: InstanceMailAddress[] | null;
  Bcc?: InstanceMailAddress[] | null;
  ReplyTo?: InstanceMailAddress[] | null;
  Subject?: string | null;
  Date?: string | null;
  Text?: string | null;
  HTML?: string | null;
  Attachments?: Array<Record<string, unknown>>;
  Inline?: Array<Record<string, unknown>>;
};

export type InstanceMailSendPayload = {
  from_email: string;
  from_name?: string;
  to_email: string;
  to_name?: string;
  subject: string;
  text: string;
  html?: string;
};

export type InstanceFileItem = {
  name: string;
  missing: boolean;
  size?: number;
  updated_at_ms?: number;
  content?: string;
};

export type InstanceFileSaveResult = {
  ok: boolean;
  file: InstanceFileItem;
};

export type OverviewStats = {
  instances_total: number;
  instances_online: number;
  tasks_total: number;
  tasks_pending: number;
  tasks_leased: number;
  tasks_done: number;
  tasks_error: number;
  campaigns_open: number;
  skill_bundles_total: number;
};

export type TaskItem = {
  id: string;
  target_type: string;
  target_id: string;
  task_name?: string | null;
  action: string;
  status: string;
  attempts: number;
  updated_at: string;
  task_origin?: string | null;
  instance_name?: string | null;
  instance_display_name?: string | null;
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
  display_name?: string | null;
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
  task_id?: string | null;
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
