-- Trusted operator ONLY, after creating/inviting the user via Supabase Auth.
-- psql "$DATABASE_URL" -v organization_id=... -v user_id=... -v member_role=employee -f supabase/ops/provision-membership.sql
-- Pass credentials through secure environment settings, never shell literals/history.
\set ON_ERROR_STOP on
\if :{?organization_id}
\else
  \echo 'Missing organization_id'
  \quit 1
\endif
\if :{?user_id}
\else
  \echo 'Missing user_id'
  \quit 1
\endif
\if :{?member_role}
\else
  \echo 'Missing member_role (owner, admin, crew_lead, worker)'
  \quit 1
\endif
begin;
insert into public.memberships(organization_id,user_id,role,active)
values (:'organization_id'::uuid, :'user_id'::uuid, :'member_role', true)
on conflict (organization_id,user_id) do update set role=excluded.role, active=true;
commit;
