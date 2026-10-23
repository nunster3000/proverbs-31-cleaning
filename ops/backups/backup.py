#!/usr/bin/env python3
"""Private runner only. Requires restic, PostgreSQL client, and injected secrets."""
import json, os, pathlib, subprocess, tempfile, urllib.request, urllib.parse, hashlib, shutil

def run(*args):
    # Do not echo subprocess errors: database URLs/object names can contain private data.
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Backup command failed: ' + args[0])
    return result.stdout

def api(path, payload=None):
    req = urllib.request.Request(os.environ['SUPABASE_URL'].rstrip('/') + '/storage/v1/' + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Authorization': 'Bearer ' + os.environ['SUPABASE_SERVICE_ROLE_KEY'],
                 'apikey': os.environ['SUPABASE_SERVICE_ROLE_KEY'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()

def objects(bucket, prefix=''):
    offset = 0
    while True:
        rows = json.loads(api('object/list/' + urllib.parse.quote(bucket, safe=''),
            {'prefix': prefix, 'limit': 100, 'offset': offset, 'sortBy': {'column': 'name', 'order': 'asc'}}))
        for row in rows:
            name = prefix + row['name']
            if row.get('id') is None:
                yield from objects(bucket, name + '/')
            else:
                yield name, row
        if len(rows) < 100:
            break
        offset += 100

def report_health(success):
    # Independent website monitor detects missing heartbeats even if this runner never starts.
    req = urllib.request.Request(os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1/rpc/service_backup_report',
        data=json.dumps({'p_success':success,'p_run':os.environ.get('GITHUB_RUN_ID','local-backup')}).encode(),
        headers={'Authorization':'Bearer '+os.environ['SUPABASE_SERVICE_ROLE_KEY'],
                 'apikey':os.environ['SUPABASE_SERVICE_ROLE_KEY'],'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        response.read()

def main():
    if os.environ.get('BACKUP_CONFIG'):
        configuration = json.loads(os.environ.pop('BACKUP_CONFIG'))
        allowed = {'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','MAX_SOURCE_DOWNLOAD_BYTES'}
        if set(configuration) - allowed or not all(isinstance(value,str) for value in configuration.values()):
            raise RuntimeError('Invalid backup configuration')
        os.environ.update(configuration)
    for key in ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD',
                'RESTIC_REPOSITORY','RESTIC_PASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY']:
        if not os.environ.get(key):
            raise RuntimeError('Missing configuration: ' + key)
    os.environ['PGSSLMODE'] = 'require'
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix='p31-backup-') as directory:
        root = pathlib.Path(directory)
        # Stable host/tag identify this job; snapshot absolute paths vary by runner.
        os.chdir(root)
        snapshots = json.loads(run('restic','snapshots','--json','--tag','p31-production'))
        if snapshots:
            latest = max(snapshots, key=lambda item: item['time'])
            restored = root / 'restored'
            run('restic','restore',latest['id'],'--target',str(restored))
            source = restored / 'backup'
            if not (source / 'inventory.json').exists():
                raise RuntimeError('Unexpected backup format')
            shutil.move(str(source), str(root / 'backup'))
            shutil.rmtree(restored)
        stage = root / 'backup'
        stage.mkdir(exist_ok=True)
        media = stage / 'media'
        media.mkdir(exist_ok=True)
        inventory_path = stage / 'inventory.json'
        old = json.loads(inventory_path.read_text()) if inventory_path.exists() else {}
        inventory = {}
        downloaded = 0
        limit = int(os.environ.get('MAX_SOURCE_DOWNLOAD_BYTES', str(1024**3)))
        for bucket in json.loads(api('bucket')):
            for name, row in objects(bucket['id']):
                identity = bucket['id'] + '/' + name
                filename = hashlib.sha256(identity.encode()).hexdigest()
                target = media / filename
                version = {'updated_at': row.get('updated_at'), 'metadata': row.get('metadata'), 'file': filename}
                previous = old.get(identity, {})
                if previous.get('version') == version and previous.get('snapshot_id'):
                    inventory[identity] = previous
                    continue
                if previous.get('version') != version or not target.exists():
                    size = int((row.get('metadata') or {}).get('size', 0))
                    if downloaded + size > limit:
                        raise RuntimeError('Source download budget exceeded; review Supabase transfer usage')
                    content = api('object/authenticated/' + urllib.parse.quote(identity, safe='/'))
                    downloaded += len(content)
                    if downloaded > limit:
                        raise RuntimeError('Source download budget exceeded')
                    target.write_bytes(content)
                digest = hashlib.sha256(target.read_bytes()).hexdigest()
                result = run('restic','backup',str(target),'--host','p31-backup','--tag','p31-media','--json')
                summaries = [json.loads(line) for line in result.splitlines() if line]
                snapshot = next(item['snapshot_id'] for item in summaries if item.get('message_type') == 'summary')
                inventory[identity] = {'version': version, 'sha256': digest, 'snapshot_id': snapshot}
                target.unlink()
        referenced = {item['version']['file'] for item in inventory.values()}
        for target in media.iterdir():
            if target.name not in referenced:
                target.unlink()
        inventory_path.write_text(json.dumps(inventory, sort_keys=True))
        # Full logical exports include auth/storage records; restore only into an isolated
        # compatible project following the recovery runbook, never blindly into production.
        run('pg_dump','--format=custom','--no-owner','--file',str(stage / 'database.dump'))
        run('pg_dumpall','--roles-only','--no-role-passwords','--file',str(stage / 'roles.sql'))
        (stage / 'format.json').write_text(json.dumps({'format': 2, 'media_objects': len(inventory)}))
        run('restic','backup','backup','--host','p31-backup','--tag','p31-production')
        run('restic','check')
        # Retention is deliberate; historical snapshots preserve deleted/changed files.
        # Pruning is separate and manual until Gabrielle approves retention.
        print('Encrypted backup and repository check succeeded. Media objects:',len(inventory))

if __name__ == '__main__':
    try:
        main()
        report_health(True)
    except Exception:
        try:
            report_health(False)
        except Exception:
            pass
        print('Backup failed. No success recorded. Review credentials, capacity and provider status securely.')
        raise SystemExit(1)
