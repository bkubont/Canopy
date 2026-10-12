\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message; end if; raise notice 'PASS: %',message; end $$;
insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-0000-0000-000000000201','fresh@example.test',now());
insert into public.organizations(id,name,timezone) values('00000000-0000-0000-0000-000000000101','Fresh business','America/New_York');
insert into public.memberships values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201','owner',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000201"}',true);
insert into public.clients(organization_id,name) values('00000000-0000-0000-0000-000000000101','Fresh client');
insert into public.projects(organization_id,client_id,title)
  select organization_id,id,'Fresh job' from public.clients;
select pg_temp.assert_true((select schedule_status='ready' and work_progress is null and version=1 from public.projects),'Fresh job has independent initial statuses/version');
select pg_temp.assert_true((select count(*) from public.user_profiles where user_id=auth.uid())=1,'New Auth account gets automatic profile');
select pg_temp.assert_true((select count(*) from public.events where action='project_created' and not is_actual_work)=1,'Fresh creation produces typed event without false work');
select pg_temp.assert_true((select count(*) from public.admin_team_members('00000000-0000-0000-0000-000000000101'))=1,'Fresh owner gets scoped administrative identity projection');
select public.change_project_schedule((select id from public.projects),'scheduled',current_date,1);
select public.change_project_progress((select id from public.projects),'estimate',current_date,2);
select pg_temp.assert_true((select count(*) from public.events where is_actual_work)=0,'Schedule and card movement do not count as work');
select public.record_phase_work((select id from public.projects),'estimate',current_date,'Fresh actual work');
select pg_temp.assert_true((select count(*) from public.events where is_actual_work)=1,'Fresh actual work is separately recorded');
reset role;
select pg_temp.assert_true((select public.business_day('00000000-0000-0000-0000-000000000101'))=(now() at time zone 'America/New_York')::date,'Organization business date uses IANA timezone');
rollback;
