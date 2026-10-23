import importlib.util, os, pathlib, tempfile, unittest, subprocess, json
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('backup',pathlib.Path(__file__).parents[2]/'ops/backups/backup.py')
backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
@unittest.skipUnless(__import__('shutil').which('restic'),'restic required')
class RecoveryTest(unittest.TestCase):
    def test_encrypted_restore_and_unchanged_media_skip(self):
        previous=os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            env={k:'fixture' for k in ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY']}
            env.update(RESTIC_REPOSITORY=tmp+'/repo',RESTIC_PASSWORD='disposable-test-password')
            requests=[]
            def api(path,payload=None):
                if path=='bucket':return b'[{"id":"walkthroughs"}]'
                if path.startswith('object/list/'):return b'[{"name":"test.jpg","id":"1","updated_at":"v1","metadata":{"size":5}}]'
                requests.append(path);return b'photo'
            actual=backup.run
            def command(*args):
                if args[0].startswith('pg_dump'):
                    pathlib.Path(args[-1]).write_bytes(b'fixture-database');return b''
                return actual(*args)
            with patch.dict(os.environ,env),patch.object(backup,'api',side_effect=api),patch.object(backup,'run',side_effect=command):
                actual('restic','init')
                try:
                    backup.main();backup.main()
                finally:os.chdir(previous)
                self.assertEqual(len(requests),1)
                snapshots=json.loads(actual('restic','snapshots','--json'))
                self.assertEqual(len(snapshots),3)
                dest=pathlib.Path(tmp)/'recover'
                actual('restic','restore','latest','--target',str(dest))
                files=list(dest.rglob('inventory.json'));self.assertEqual(len(files),1)
                inventory=json.loads(files[0].read_text()); self.assertIn('walkthroughs/test.jpg',inventory)
                media_record=inventory['walkthroughs/test.jpg']
                media_dest=pathlib.Path(tmp)/'recover-media'
                actual('restic','restore',media_record['snapshot_id'],'--target',str(media_dest))
                self.assertEqual(next(media_dest.rglob(media_record['version']['file'])).read_bytes(),b'photo')
                with patch.dict(os.environ,{'RESTIC_PASSWORD':'wrong'}):
                    with self.assertRaises(RuntimeError):actual('restic','snapshots')
if __name__=='__main__':unittest.main()
