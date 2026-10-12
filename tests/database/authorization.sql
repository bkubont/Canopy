\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', message; end if;
  raise notice 'PASS: %', message;
end $$;
create function pg_temp.expect_error(command text, code text, message text) returns void
language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate = code then raise notice 'PASS: %', message; return; end if;
    raise exception 'FAILED: % (expected %, got %: %)', message, code, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % (command unexpectedly succeeded)', message;
end $$;

insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000201'),
 ('00000000-0000-0000-0000-000000000202'),
 ('00000000-0000-0000-0000-000000000203'),
 ('00000000-0000-0000-0000-000000000204'),
 ('00000000-0000-0000-0000-000000000205'),
 ('00000000-0000-0000-0000-000000000206'),
 ('00000000-0000-0000-0000-000000000207');
insert into public.organizations(id,name) values
 ('00000000-0000-0000-0000-000000000101','Sample A'),
 ('00000000-0000-0000-0000-000000000102','Sample B');
insert into public.memberships(organization_id,user_id,role,active) values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201','owner',true),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000202','admin',true),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000203','employee',true),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000204','employee',true),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000207','employee',false),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000205','owner',true);
insert into public.clients(id,organization_id,name) values
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000101','Assigned client'),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000101','Unassigned client'),
 ('00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000102','Other company');
insert into public.projects(id,organization_id,client_id,title) values
 ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000301','Job assigned'),
 ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000302','Hidden job'),
 ('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000303','Other company job'),
 ('00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000301','Phase assigned'),
 ('00000000-0000-0000-0000-000000000405','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000301','Visit assigned');
insert into public.workers(id,organization_id,user_id,name) values
 ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000203','Assigned employee'),
 ('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000204','Unassigned employee'),
 ('00000000-0000-0000-0000-000000000503','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000205','Other company worker');
insert into public.project_assignments values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000501');
insert into public.job_phases(id,organization_id,project_id,phase) values
 ('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000404','prep'),
 ('00000000-0000-0000-0000-000000000602','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','prep');
insert into public.phase_assignments values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000501');
insert into public.visits(id,organization_id,project_id,start_date,end_date) values
 ('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000405',current_date,current_date+2);
insert into public.visit_assignments values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000501');
insert into public.tasks(id,organization_id,project_id,kind,title,work_date,destination) values
 ('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','dump','Dump run',current_date,'Sample dump A'),
 ('00000000-0000-0000-0000-000000000802','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','dump','Dump run',current_date+1,'Sample dump B');
insert into public.notes(organization_id,project_id,body) values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','Visible sample note'),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000402','Hidden sample note');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000201"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=4,'Owner only reads own organization');
select pg_temp.assert_true((select count(*) from public.clients)=2,'Owner sees both own clients');
select pg_temp.assert_true((select count(*) from public.organizations)=1,'Organization isolation');
select pg_temp.expect_error($q$insert into public.clients(organization_id,name) values ('00000000-0000-0000-0000-000000000102','Forbidden')$q$,'42501','Cross-org insert denied');
select pg_temp.expect_error($q$insert into public.memberships values ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000201','owner',true)$q$,'42501','Browser cannot provision memberships');
select pg_temp.expect_error($q$insert into public.projects(organization_id,client_id,title) values ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000303','Cross-company reference')$q$,'23503','Cross-org project/client FK denied');
select pg_temp.expect_error($q$insert into public.project_assignments values ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000503')$q$,'23503','Cross-org worker assignment denied');
select pg_temp.expect_error($q$update public.projects set stage='tree' where id='00000000-0000-0000-0000-000000000401'$q$,'42501','Direct stage writes denied');
select pg_temp.expect_error($q$insert into public.events(organization_id,project_id,kind,work_date,message) values ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','work',current_date,'Fake event')$q$,'42501','Direct event insert denied');
select pg_temp.expect_error($q$update public.events set message='Tampered'$q$,'42501','Event updates denied');
select pg_temp.expect_error('delete from public.events','42501','Event deletion denied');
select pg_temp.expect_error($q$insert into public.photos(organization_id,project_id,object_path,mime_type,size_bytes) values ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','fake','image/jpeg',1)$q$,'42501','Photo writes fail closed pending storage stage');
select pg_temp.assert_true((select count(*) from public.events where kind <> 'created')=0,'Assignments do not create progress');
select public.change_project_stage('00000000-0000-0000-0000-000000000401','prep',current_date-1,1);
select public.change_project_stage('00000000-0000-0000-0000-000000000401','tree',current_date,2);
select pg_temp.assert_true((select stage='tree' and version=3 from public.projects where id='00000000-0000-0000-0000-000000000401'),'Stage and version updated');
select pg_temp.assert_true((select count(*) from public.events where project_id='00000000-0000-0000-0000-000000000401' and work_date=current_date-1 and phase='prep')=1,'Earlier dated progress retained');
select pg_temp.assert_true((select count(*) from public.events where project_id='00000000-0000-0000-0000-000000000401' and work_date=current_date+1)=0,'Future day does not inherit progress');
select pg_temp.expect_error($q$select public.change_project_stage('00000000-0000-0000-0000-000000000401','cleanup',current_date,1)$q$,'40001','Stale version rejected');
select pg_temp.assert_true((select count(*) from public.events where kind='stage')=2,'Rejected change appends no event');
select public.change_project_stage('00000000-0000-0000-0000-000000000401','tree',current_date,3);
select pg_temp.assert_true((select count(*) from public.events where kind='stage')=2,'Repeated stage is idempotent');
select pg_temp.assert_true((select version from public.projects where id='00000000-0000-0000-0000-000000000401')=3,'Repeated stage does not increment version');
select pg_temp.expect_error($q$select public.change_project_stage('00000000-0000-0000-0000-000000000403','tree',current_date,1)$q$,'42501','RPC cannot cross organization');
select pg_temp.expect_error($q$select public.record_phase_work('00000000-0000-0000-0000-000000000403','prep',current_date,'Forbidden')$q$,'42501','Work RPC cannot cross organization');
select pg_temp.expect_error($q$select public.change_project_stage('00000000-0000-0000-0000-000000000401','bad',current_date,3)$q$,'22023','Invalid stage rejected');
select pg_temp.expect_error($q$select public.change_project_stage('00000000-0000-0000-0000-000000000401','cleanup',current_date+20,3)$q$,'22023','Invalid future work date rejected');
select public.record_phase_work('00000000-0000-0000-0000-000000000401','prep',current_date-2,'Sample past work');
update public.job_phases set complete=true where id='00000000-0000-0000-0000-000000000602';
select pg_temp.assert_true((select stage='tree' from public.projects where id='00000000-0000-0000-0000-000000000401'),'Phase completion independent of job stage');
select pg_temp.assert_true((select count(*) from public.events where kind='phase')=1,'Completion appends a phase event');
select pg_temp.assert_true((select count(*) from public.tasks where kind='dump')=2,'Dump runs repeat independently');
select pg_temp.assert_true((select end_date-start_date+1 from public.visits)=3,'Multi-day visit retains inclusive endpoints');
select pg_temp.expect_error($q$insert into public.visits(organization_id,project_id,start_date,end_date) values ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401',current_date,current_date-1)$q$,'23514','Reversed visit dates rejected');
select pg_temp.expect_error($q$insert into public.visits(organization_id,project_id,start_date,end_date) values ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401',current_date,current_date+365)$q$,'23514','Overlong visit dates rejected explicitly');
select pg_temp.expect_error($q$update public.job_phases set project_id='00000000-0000-0000-0000-000000000402' where id='00000000-0000-0000-0000-000000000602'$q$,'23514','Phase cannot be reparented away from its history');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000202"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=4,'Admin can read own organization');
insert into public.clients(organization_id,name) values ('00000000-0000-0000-0000-000000000101','Admin sample');
delete from public.clients where name='Admin sample';
select pg_temp.assert_true(true,'Admin can create and delete unreferenced clients');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000203"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=3,'Employee sees job, phase and visit assignments only');
select pg_temp.assert_true((select count(*) from public.clients)=1,'Employee only sees clients of assigned projects');
select pg_temp.assert_true((select count(*) from public.workers)=1,'Employee only sees own worker directory entry');
select pg_temp.assert_true((select count(*) from public.memberships)=1,'Employee cannot enumerate memberships');
select pg_temp.assert_true((select count(*) from public.notes)=1,'Employee cannot read unassigned notes');
select pg_temp.assert_true((select count(*) from public.tasks)=2,'Employee sees tasks of assigned projects');
select pg_temp.assert_true((select count(*) from public.phase_assignments)=1,'Employee reads assigned phase relationships');
select pg_temp.assert_true((select count(*) from public.visit_assignments)=1,'Employee reads assigned visit relationships');
select pg_temp.expect_error($q$insert into public.clients(organization_id,name) values ('00000000-0000-0000-0000-000000000101','Forbidden')$q$,'42501','Employee cannot create clients');
update public.clients set name='Forbidden';
select pg_temp.assert_true((select name from public.clients)='Assigned client','Employee update changes no rows');
select pg_temp.expect_error($q$select public.change_project_stage('00000000-0000-0000-0000-000000000401','cleanup',current_date,3)$q$,'42501','Employee cannot call write RPC');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000204"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=0,'Unassigned employee sees no jobs');
select pg_temp.assert_true((select count(*) from public.clients)=0,'Unassigned employee sees no clients');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000205"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=1,'Other company owner sees only other company');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000206"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=0,'Authenticated user without membership sees no jobs');
select pg_temp.assert_true((select count(*) from public.organizations)=0,'Authentication alone grants no company access');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000207"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=0,'Inactive membership grants no data access');

reset role;
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000203';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000203"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=0,'Revocation immediately removes assigned-job access');
set local role anon;
select pg_temp.expect_error('select * from public.clients','42501','Anonymous reads denied');
select pg_temp.expect_error($q$select public.is_org_admin('00000000-0000-0000-0000-000000000101')$q$,'42501','Anonymous helper execution denied');
reset role;
select pg_temp.expect_error('update public.events set message=''Tampered''','23514','Immutable events enforced even for trusted operator');
select pg_temp.expect_error('truncate public.events','23514','Event truncation denied');
insert into public.memberships values ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000201','admin',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000201"}',true);
select pg_temp.expect_error($q$update public.clients set organization_id='00000000-0000-0000-0000-000000000102' where id='00000000-0000-0000-0000-000000000301'$q$,'23514','Multi-org administrator cannot move record ownership');
reset role;
select pg_temp.assert_true((select count(*) from pg_tables where schemaname='public' and not rowsecurity)=0,'RLS enabled on every public table');
rollback;
