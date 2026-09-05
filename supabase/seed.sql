-- Local-only test fixture: satisfies audit_log.user_id's FK to auth.users(id)
-- for the fixed test ctx userId used across netlify/lib/*.test.ts. This file
-- is applied by `supabase db reset`/`start` locally and is never pushed to
-- the hosted project by `supabase db push`.
insert into auth.users (id, email, instance_id, aud, role)
values (
  '00000000-0000-0000-0000-000000000000',
  'test@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
)
on conflict (id) do nothing;
