drop policy if exists "platform admin le auditoria global" on public.audit_log;
create policy "platform admin le auditoria global"
on public.audit_log for select to authenticated
using (public.is_platform_admin());

create index if not exists audit_log_platform_recent_idx
on public.audit_log(timestamp desc, collection, action);

revoke update, delete, truncate on public.audit_log from authenticated;

