"""Build and package release files without local backups or credentials."""
from pathlib import Path
import subprocess
import sys
import zipfile
root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'scripts/build_site.py')],check=True)
assets=[p for p in (root/'_site').rglob('*') if p.is_file()]
extras=['README.md','.gitignore','.github/workflows/pages.yml','scripts/build_site.py','scripts/package_release.py','cloud/SETUP.md','cloud/schema.sql','tests/cloud-sync.cjs','tests/edge-sync.cjs','tests/remember-login.cjs','supabase/functions/pworks-sync/index.ts']
for name in ['J-WORKs','BC-WORKs']:
    for kind in ['site','GitHub-Pages']:
        with zipfile.ZipFile(root/f'{name}-{kind}.zip','w',zipfile.ZIP_DEFLATED) as z:
            for p in assets:z.write(p,p.relative_to(root/'_site').as_posix())
            if kind=='GitHub-Pages':
                for p in extras:z.write(root/p,p)
        with zipfile.ZipFile(root/f'{name}-{kind}.zip') as z:
            assert z.testzip() is None
            assert not any(n.endswith('.json') for n in z.namelist())
print('Release ZIPs verified; backup JSON excluded.')
