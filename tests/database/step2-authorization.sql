\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message; end if; raise notice 'PASS: %',message; end $$;
create function pg_temp.expect_error(command text,code text,message text) returns void language plpgsql as $$
begin begin execute command; exception when others then
 if sqlstate=code then raise notice 'PASS: %',message; return; end if;
 raise exception 'FAILED: % expected % got % (%)',message,code,sqlstate,sqlerrm;
 end; raise exception 'FAILED: % unexpectedly succeeded',message; end $$;
select pg_temp.assert_true((select role='worker' and active from public.memberships where user_id='00000000-0000-0000-0000-000000000203'),'Legacy employee migrates to active worker');
select pg_temp.assert_true((select role='worker' and not active from public.memberships where user_id='00000000-0000-0000-0000-000000000207'),'Revoked legacy membership remains revoked');
select pg_temp.assert_true((select count(*) from public.user_profiles)=7,'Existing accounts receive profiles');
select pg_temp.assert_true((select stage='prep' and version=7 and work_progress='prep' and schedule_status='scheduled' from public.projects where id='00000000-0000-0000-0000-000000000401'),'Migration preserves version/legacy stage and splits status');
select pg_temp.assert_true((select work_progress is null from public.projects where id='00000000-0000-0000-0000-000000000402'),'Ready job does not invent estimate work');
select pg_temp.assert_true((select count(*) from public.events where message='Legacy move' and work_date='2026-10-10' and not is_actual_work)=1,'Legacy move remains dated but is not performed work');
select pg_temp.assert_true((select count(*) from public.events where message='Legacy actual work' and work_date='2026-10-11' and is_actual_work)=1,'Legacy actual work date retained');
select pg_temp.assert_true((select count(*) from public.events)=5,'Upgrade creates no fictional events');
select pg_temp.assert_true((select count(*) from public.visits where end_date-start_date=2)=1,'Multi-day legacy visit preserved');
select pg_temp.assert_true((select count(*) from public.tasks where kind='dump')=2,'Repeated dump records preserved');
select pg_temp.assert_true((select count(*) from public.notes where body='Legacy note' and created_at='2026-10-10T12:00:00Z' and author_id is null)=1,'Legacy note timestamp retained without invented author');
select pg_temp.assert_true((select count(*) from public.photos where object_path='legacy-photo.jpg' and validation_status='pending' and author_id is null)=1,'Legacy photo retained pending verification without invented author');
select pg_temp.assert_true((select not public and file_size_limit=10485760 from storage.buckets where id='canopy-photos'),'Photo bucket is private with bounded upload size');
insert into storage.buckets(id,name) values('other-bucket','other-bucket');
insert into storage.objects(bucket_id,name) values('canopy-photos','private/sample.png'),('other-bucket','other/sample.png');
create policy adversarial_permissive on storage.objects for all to authenticated,anon using(true) with check(true);
create policy adversarial_bucket_policy on storage.buckets for all to authenticated,anon using(true) with check(true);
update public.memberships set role='crew_lead' where user_id='00000000-0000-0000-0000-000000000204';
insert into public.crews(id,organization_id,name) values
 ('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000101','Assigned crew'),
 ('00000000-0000-0000-0000-000000000802','00000000-0000-0000-0000-000000000101','Unrelated crew'),
 ('00000000-0000-0000-0000-000000000803','00000000-0000-0000-0000-000000000102','Other company crew');
insert into public.crew_memberships values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000501'),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000502');
insert into public.project_crew_assignments values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000801'),
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000802');
insert into public.task_assignments values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000501');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000203"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=1,'Worker cannot see unrelated crew/company projects');
select pg_temp.assert_true((select count(*) from public.clients)=0,'Worker cannot read raw private client rows');
select pg_temp.assert_true((select count(*) from public.field_jobs('00000000-0000-0000-0000-000000000101'))=1,'Worker can read safe job/client-name projection');
select pg_temp.assert_true((select count(*) from public.crews)=1,'Worker sees only own crew');
select pg_temp.assert_true((select count(*) from public.admin_team_members('00000000-0000-0000-0000-000000000101'))=0,'Worker cannot get administrative team emails');
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='canopy-photos')=0,'Restrictive boundary denies private bytes despite permissive policy');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values('canopy-photos','forged.png')$q$,'42501','Direct browser upload blocked until verified server pipeline');
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='other-bucket')=1,'Canopy policies do not alter unrelated bucket access');
select pg_temp.assert_true((select count(*) from public.user_profiles)=4,'Profile visibility limited to self/shared organization');
update public.user_profiles set display_name='My name' where user_id='00000000-0000-0000-0000-000000000203';
update public.user_profiles set display_name='Spoofed' where user_id='00000000-0000-0000-0000-000000000201';
select pg_temp.assert_true((select display_name from public.user_profiles where user_id='00000000-0000-0000-0000-000000000201')='','Worker cannot edit another profile');
select pg_temp.expect_error($q$update public.user_profiles set user_id='00000000-0000-0000-0000-000000000205'$q$,'42501','Profile identity cannot be forged');
select pg_temp.expect_error($q$insert into public.crews(organization_id,name) values('00000000-0000-0000-0000-000000000101','Unauthorized')$q$,'42501','Worker cannot administer crews');
select pg_temp.expect_error($q$select public.change_project_progress('00000000-0000-0000-0000-000000000401','tree',current_date,7)$q$,'42501','Worker cannot move Kanban progress');
select pg_temp.expect_error($q$select public.set_phase_completion('00000000-0000-0000-0000-000000000601',true,current_date,1)$q$,'42501','Worker cannot complete whole phase');
select public.record_phase_work('00000000-0000-0000-0000-000000000401','prep',current_date-1,'Worker actual work');
select pg_temp.assert_true((select count(*) from public.events where action='work_recorded' and actor_id=auth.uid() and is_actual_work)=1,'Authorized worker can record actual work with server actor');
select pg_temp.expect_error($q$select public.record_phase_work('00000000-0000-0000-0000-000000000402','prep',current_date,'Unrelated')$q$,'42501','Worker cannot update unrelated crew work');
select public.add_project_note('00000000-0000-0000-0000-000000000401','Worker note');
select pg_temp.assert_true((select count(*) from public.notes where author_id=auth.uid())=1,'Worker note author is server-derived');
select pg_temp.expect_error($q$insert into public.notes(organization_id,project_id,body,author_id) values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','Fake','00000000-0000-0000-0000-000000000201')$q$,'42501','Direct note author spoof denied');
select public.complete_task('00000000-0000-0000-0000-000000000701',true,current_date,1);
select pg_temp.expect_error($q$select public.complete_task('00000000-0000-0000-0000-000000000702',true,current_date,1)$q$,'42501','Worker cannot complete unassigned task');
select pg_temp.expect_error($q$update public.tasks set done=true$q$,'42501','Worker cannot bypass task RPC');
select pg_temp.expect_error($q$select public.admin_change_membership('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000203','owner',true)$q$,'42501','Service-only membership function cannot be called by browser');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000204"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=1,'Crew lead sees assigned crew jobs without direct worker assignment');
select public.change_project_progress('00000000-0000-0000-0000-000000000401','tree',current_date,7);
select pg_temp.assert_true((select count(*) from public.events where action='progress_changed' and not is_actual_work)=1,'Crew-lead card move is not actual work');
select public.set_phase_completion('00000000-0000-0000-0000-000000000601',true,current_date-1,1);
select public.set_phase_completion('00000000-0000-0000-0000-000000000601',false,current_date,2);
select pg_temp.assert_true((select count(*) from public.events where action='phase_completed' and is_actual_work)=1,'Completion is a dated fact');
select pg_temp.assert_true((select count(*) from public.events where action='phase_reopened' and not is_actual_work)=1,'Reopen is not performed work');
select pg_temp.expect_error($q$select public.change_project_schedule('00000000-0000-0000-0000-000000000401','cancelled',current_date,8)$q$,'42501','Crew lead cannot schedule/cancel job');
select pg_temp.expect_error($q$select public.change_project_progress('00000000-0000-0000-0000-000000000402','tree',current_date,1)$q$,'42501','Crew lead cannot update another crew job');
select pg_temp.expect_error($q$insert into public.project_crew_assignments values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000801')$q$,'42501','Crew lead cannot self-assign unrelated job');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000201"}',true);
select public.change_project_schedule('00000000-0000-0000-0000-000000000401','postponed',current_date,8);
select pg_temp.assert_true((select schedule_status='postponed' and work_progress='tree' and stage='prep' from public.projects where id='00000000-0000-0000-0000-000000000401'),'Schedule change preserves work progress and legacy evidence');
select pg_temp.expect_error($q$select public.change_project_progress('00000000-0000-0000-0000-000000000401','cleanup',current_date,7)$q$,'40001','Stale project change denied');
select pg_temp.expect_error($q$update public.organizations set timezone='Unknown/Timezone'$q$,'22023','Invalid timezone rejected');
select pg_temp.expect_error($q$insert into public.project_crew_assignments values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000803')$q$,'23503','Cross-company crew assignment rejected');
select pg_temp.expect_error($q$update public.project_crew_assignments set project_id='00000000-0000-0000-0000-000000000402' where project_id='00000000-0000-0000-0000-000000000401'$q$,'23514','Crew assignment cannot be reparented silently');
select pg_temp.expect_error($q$update public.crew_memberships set crew_id='00000000-0000-0000-0000-000000000802' where worker_id='00000000-0000-0000-0000-000000000501'$q$,'23514','Crew membership cannot be moved silently');
select pg_temp.expect_error('delete from public.events','42501','New history remains append-only');
update storage.buckets set public=true where id='canopy-photos';
select pg_temp.assert_true((select not public from storage.buckets where id='canopy-photos'),'Even owner cannot make bucket public through permissive policy');
delete from storage.buckets where id='canopy-photos';
select pg_temp.assert_true((select count(*) from storage.buckets where id='canopy-photos')=1,'Browser cannot delete protected bucket');
select pg_temp.expect_error($q$insert into storage.buckets(id,name,public) values('canopy-photos','canopy-photos',true)$q$,'42501','Browser cannot recreate protected bucket with public settings');
reset role;
set local role service_role;
select pg_temp.expect_error($q$select public.admin_change_membership('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201','worker',true)$q$,'42501','Admin cannot demote owner');
select pg_temp.expect_error($q$select public.admin_change_membership('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000203','admin',true)$q$,'42501','Admin cannot grant administrative role');
select pg_temp.expect_error($q$select public.admin_change_membership('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201','worker',true)$q$,'23514','Last active owner cannot be demoted');
select pg_temp.expect_error($q$select public.prepare_organization_invitation('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000101','outsider@example.test','worker',gen_random_uuid())$q$,'42501','Worker cannot prepare invitation through service boundary');
select (public.prepare_organization_invitation('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','outsider@example.test','worker','00000000-0000-0000-0000-000000000901')).id as invite_id \gset
select public.finish_organization_invitation('00000000-0000-0000-0000-000000000201',:'invite_id','00000000-0000-0000-0000-000000000205',true);
select pg_temp.assert_true((select count(*) from public.memberships where user_id='00000000-0000-0000-0000-000000000205')=0,'Invitation delivery alone grants no membership');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000203"}',true);
select pg_temp.expect_error(format('select public.accept_organization_invitation(%L)',:'invite_id'),'42501','Wrong recipient cannot accept invite');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000205"}',true);
select public.accept_organization_invitation(:'invite_id');
select public.accept_organization_invitation(:'invite_id');
select pg_temp.assert_true((select count(*) from public.memberships where user_id=auth.uid())=1,'Verified invitation acceptance is idempotent');
select pg_temp.assert_true((select count(*) from public.projects)=0,'New worker has no access without job/crew assignment');
reset role;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000208','unverified@example.test',null),
 ('00000000-0000-0000-0000-000000000209','expired@example.test',now()),
 ('00000000-0000-0000-0000-000000000210','revoked@example.test',now());
set local role service_role;
select pg_temp.expect_error($q$select public.prepare_organization_invitation('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000101','expired@example.test','admin',gen_random_uuid())$q$,'42501','Admin cannot invite another admin');
select pg_temp.expect_error($q$select public.prepare_organization_invitation('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','expired@example.test','owner',gen_random_uuid())$q$,'42501','Invitations cannot directly grant owner');
select (public.prepare_organization_invitation('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','unverified@example.test','worker','00000000-0000-0000-0000-000000000902')).id as unverified_id \gset
select pg_temp.assert_true(public.claim_invitation_delivery('00000000-0000-0000-0000-000000000201',:'unverified_id'),'First delivery claims invitation');
select pg_temp.assert_true(not public.claim_invitation_delivery('00000000-0000-0000-0000-000000000201',:'unverified_id'),'Concurrent/replayed delivery cannot claim twice');
select public.finish_organization_invitation('00000000-0000-0000-0000-000000000201',:'unverified_id','00000000-0000-0000-0000-000000000208',true);
select (public.prepare_organization_invitation('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','expired@example.test','worker','00000000-0000-0000-0000-000000000903')).id as expired_id \gset
select public.finish_organization_invitation('00000000-0000-0000-0000-000000000201',:'expired_id','00000000-0000-0000-0000-000000000209',true);
update public.organization_invitations set expires_at=now()-interval '1 day' where id=:'expired_id';
select (public.prepare_organization_invitation('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000101','revoked@example.test','worker','00000000-0000-0000-0000-000000000904')).id as revoked_id \gset
select public.finish_organization_invitation('00000000-0000-0000-0000-000000000202',:'revoked_id','00000000-0000-0000-0000-000000000210',true);
select public.admin_change_membership('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000202','admin',false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000208"}',true);
select pg_temp.expect_error(format('select public.accept_organization_invitation(%L)',:'unverified_id'),'42501','Unconfirmed email cannot activate membership');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000209"}',true);
select pg_temp.expect_error(format('select public.accept_organization_invitation(%L)',:'expired_id'),'42501','Expired invitation cannot be accepted');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000210"}',true);
select pg_temp.expect_error(format('select public.accept_organization_invitation(%L)',:'revoked_id'),'42501','Invitation cannot be accepted after inviter loses access');
reset role;
select public.admin_change_membership('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000203','worker',false);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000203"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=0,'Revocation removes direct and crew access immediately');
select pg_temp.assert_true(public.can_read_project('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000401') is false,'Revoked permission result is false, never NULL');
select pg_temp.expect_error($q$select public.record_phase_work('00000000-0000-0000-0000-000000000401','prep',current_date,'Revoked write')$q$,'42501','Revoked worker cannot write actual work through RPC');
select pg_temp.expect_error($q$select public.add_project_note('00000000-0000-0000-0000-000000000401','Revoked note')$q$,'42501','Revoked worker cannot add note through RPC');
select pg_temp.expect_error($q$select public.complete_task('00000000-0000-0000-0000-000000000701',false,current_date,2)$q$,'42501','Revoked worker cannot complete assigned task');
reset role;
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000204';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000204"}',true);
select pg_temp.expect_error($q$select public.change_project_progress('00000000-0000-0000-0000-000000000401','cleanup',current_date,9)$q$,'42501','Revoked lead cannot update progress');
select pg_temp.expect_error($q$select public.set_phase_completion('00000000-0000-0000-0000-000000000601',true,current_date,3)$q$,'42501','Revoked lead cannot complete phase');
set local role anon;
select pg_temp.expect_error('select * from public.user_profiles','42501','Anonymous profile access denied');
select pg_temp.assert_true((select count(*) from storage.objects where bucket_id='canopy-photos')=0,'Anonymous storage access denied');
select pg_temp.expect_error($q$select * from public.field_jobs('00000000-0000-0000-0000-000000000101')$q$,'42501','Anonymous field projection denied');
reset role;
select pg_temp.expect_error('delete from public.account_audit','23514','Account audit is append-only');
-- Exercise independent phase/visit/crew-task access paths, not only whole-job assignment.
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000203';
insert into public.visits(id,organization_id,project_id,start_date,end_date) values
 ('00000000-0000-0000-0000-000000000704','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000402',current_date,current_date+1);
insert into public.visit_crew_assignments values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000704','00000000-0000-0000-0000-000000000801');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000203"}',true);
select pg_temp.assert_true((select count(*) from public.projects)=2,'Visit crew assignment grants access independently of project crew');
reset role;
delete from public.visit_crew_assignments where visit_id='00000000-0000-0000-0000-000000000704';
insert into public.job_phases(id,organization_id,project_id,phase) values
 ('00000000-0000-0000-0000-000000000604','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000402','tree');
insert into public.phase_assignments values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000604','00000000-0000-0000-0000-000000000501');
set local role authenticated;
select pg_temp.assert_true((select count(*) from public.projects)=2,'Direct optional phase assignment grants access independently of crew');
reset role;
delete from public.phase_assignments where phase_id='00000000-0000-0000-0000-000000000604';
insert into public.task_crew_assignments values
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000702','00000000-0000-0000-0000-000000000801');
set local role authenticated;
select public.complete_task('00000000-0000-0000-0000-000000000702',true,current_date,1);
select pg_temp.assert_true((select done from public.tasks where id='00000000-0000-0000-0000-000000000702'),'Worker can complete crew-assigned dump task');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000201"}',true);
update public.project_assignments set worker_id='00000000-0000-0000-0000-000000000502'
  where project_id='00000000-0000-0000-0000-000000000401';
select pg_temp.assert_true((select count(*) from public.project_assignments where worker_id='00000000-0000-0000-0000-000000000502')=1,'Owner can reassign a worker without changing assignment scope');
reset role;
select pg_temp.assert_true((select count(*) from pg_tables where schemaname='public' and not rowsecurity)=0,'All application tables have RLS');
rollback;
