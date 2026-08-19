alter table public.client_error_events
  add column if not exists status text not null default 'open',
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id),
  add column if not exists resolution_note text;

do $$ begin
  alter table public.client_error_events
    add constraint client_error_events_status_check
    check (status in ('open', 'resolved', 'ignored'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_client_error_events_status_created
  on public.client_error_events(status, created_at desc);
create index if not exists idx_client_error_events_fingerprint
  on public.client_error_events(fingerprint, created_at desc);

create policy client_error_events_platform_select
  on public.client_error_events for select to authenticated
  using (public.is_platform_admin());
create policy client_error_events_platform_update
  on public.client_error_events for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
create policy automation_logs_platform_select
  on public.automation_logs for select to authenticated
  using (public.is_platform_admin());

grant update(status, resolved_at, resolved_by, resolution_note)
  on public.client_error_events to authenticated;
