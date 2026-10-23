#!/usr/bin/env python3
"""Run locally in Terminal. Does not reset or display any password."""
import getpass, json, os, pathlib
path=pathlib.Path.home()/'.config/proverbs31-backups/config.json'
os.umask(0o077)
config=json.loads(path.read_text())
print('Supabase production backup setup. Password input is hidden.')
config.setdefault('PGHOST','aws-1-us-west-2.pooler.supabase.com')
config['PGPORT']='5432'
config['PGUSER']='postgres.mokhzraxcbrmzpvedhxz'
config['PGDATABASE']='postgres'
config['PGPASSWORD']=getpass.getpass('Existing Supabase database password: ')
if not config['PGHOST'].endswith('.pooler.supabase.com') or not config['PGPASSWORD']:
    raise SystemExit('Invalid/incomplete input. No changes saved.')
path.write_text(json.dumps(config));path.chmod(0o600)
print('Saved locally with owner-only permissions. No password printed.')
