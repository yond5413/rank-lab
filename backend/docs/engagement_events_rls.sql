alter table public.engagement_events enable row level security;

create policy "insert_own_engagement"
  on public.engagement_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);
