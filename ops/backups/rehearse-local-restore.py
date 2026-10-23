#!/usr/bin/env python3
# Restores only into a fresh disposable Unix-socket PostgreSQL cluster; never production.
import os,json,subprocess,tempfile,pathlib,time
c=json.load(open(str(pathlib.Path.home()/'.config/proverbs31-backups/config.json')));env=dict(os.environ,**c);bin='/opt/homebrew/opt/postgresql@17/bin/'
def run(args,env2=env,strict=True):
 r=subprocess.run(args,env=env2,capture_output=True)
 if strict and r.returncode:raise RuntimeError(pathlib.Path(args[0]).name+' failed ('+str(r.returncode)+')')
 return r
with tempfile.TemporaryDirectory(prefix='p31-actual-restore-') as d:
 os.chmod(d,0o700);root=pathlib.Path(d);cluster=root/'pg';started=False
 try:
  s=json.loads(run(['/opt/homebrew/bin/restic','snapshots','--json','--tag','p31-production']).stdout);latest=max(s,key=lambda x:x['time']);run(['/opt/homebrew/bin/restic','restore',latest['id'],'--target',d]);backup=root/'backup'
  local={k:v for k,v in os.environ.items() if not k.startswith('PG')};local.update(PGHOST=d,PGPORT='58923',PGUSER=os.environ['USER'],PGDATABASE='postgres')
  run([bin+'initdb','-D',str(cluster),'-A','trust','--no-locale'],local);run([bin+'pg_ctl','-D',str(cluster),'-l',str(root/'pg.log'),'-o',"-k '"+d+"' -p 58923 -c listen_addresses=''",'start'],local);started=True
  roles=(backup/'roles.sql').read_text();run([bin+'psql','-X','-f',str(backup/'roles.sql')],local,False)
  run([bin+'psql','-X','-v','ON_ERROR_STOP=1','-c','create schema auth; create schema storage; create schema private; create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;'],local)
  r=run([bin+'pg_restore','--no-owner','--schema=public','--schema=private','--schema=auth','--schema=storage','--dbname=postgres',str(backup/'database.dump')],local,False)
  errors=r.stderr.decode(errors='replace');print('Restore exit:',r.returncode,'errors:',errors.count('ERROR:'))
  # Save only technical error headers, never COPY data or private records.
  if r.returncode: raise RuntimeError('Archive restore did not complete cleanly')
  q="select json_build_object('customers',(select count(*) from public.customers),'bookings',(select count(*) from public.bookings),'auth_users',(select count(*) from auth.users),'owners',(select count(*) from private.owner_accounts),'private_bucket',(select not public from storage.buckets where id='walkthroughs'),'rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity));"
  print(run([bin+'psql','-X','-At','-c',q],local).stdout.decode())
  checks="select set_config('request.jwt.claims',json_build_object('sub',(select user_id from private.owner_accounts limit 1),'is_anonymous',false)::text,false); set role authenticated; select case when public.is_owner() then 'owner access verified' else 'FAIL' end; reset role; select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where id not in(select user_id from private.owner_accounts) limit 1),'is_anonymous',false)::text,false); set role authenticated; select case when not public.is_owner() and (select count(*) from public.customers)=0 and not has_table_privilege('authenticated','public.bookings','UPDATE') then 'customer isolation verified' else 'FAIL' end;"
  result=run([bin+'psql','-X','-At','-v','ON_ERROR_STOP=1','-c',checks],local).stdout.decode()
  if 'FAIL' in result or 'owner access verified' not in result or 'customer isolation verified' not in result: raise RuntimeError('Restored access verification failed')
  print('Restored owner access, customer isolation and write restrictions verified.')
 finally:
  if started:run([bin+'pg_ctl','-D',str(cluster),'-m','immediate','stop'],local,False)
