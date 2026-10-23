import importlib.util, os, pathlib, tempfile, unittest, json
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('backup',pathlib.Path(__file__).parents[2]/'ops/backups/backup.py')
backup=importlib.util.module_from_spec(spec); spec.loader.exec_module(backup)
class BackupTests(unittest.TestCase):
    def test_nested_paginated_inventory(self):
        def api(path,payload):
            if payload['prefix']=='folder/': return b'[{"name":"photo.jpg","id":"a"}]'
            return b'[{"name":"folder","id":null}]'
        with patch.object(backup,'api',side_effect=api):
            self.assertEqual(list(backup.objects('private'))[0][0],'folder/photo.jpg')
    def test_fail_closed_without_credentials(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaisesRegex(RuntimeError,'Missing configuration'): backup.main()
    def test_command_failure_redacts_output(self):
        with patch.object(backup.subprocess,'run',return_value=backup.subprocess.CompletedProcess([],1,b'',b'private secret')):
            with self.assertRaisesRegex(RuntimeError,'^Backup command failed: pg_dump$'): backup.run('pg_dump')
if __name__=='__main__': unittest.main()
