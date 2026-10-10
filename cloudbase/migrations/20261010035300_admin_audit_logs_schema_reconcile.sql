-- Align an existing admin audit table with the release schema without dropping rows.
alter table public.admin_audit_logs
  alter column actor_user_id type text using actor_user_id::text,
  alter column expires_at drop default,
  alter column expires_at drop not null;
