alter table tasks
  add column task_origin text not null default 'manual';

update tasks
set task_origin = 'campaign'
where id in (
  select task_id
  from campaign_instances
  where task_id is not null
);

update tasks
set task_origin = 'system'
where task_origin = 'manual'
  and action in (
    'agents.files.list',
    'agents.files.get',
    'agents.files.set',
    'fleet.gateway.probe'
  );

create index if not exists tasks_task_origin_created_idx
  on tasks (task_origin, created_at desc);
