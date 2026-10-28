"""Package only the HTML and its referenced local assets for GitHub Pages."""
from pathlib import Path
from urllib.parse import unquote
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '_site'
html = (ROOT / 'index.html').read_text(encoding='utf-8')
refs = set(re.findall(r'(?:src|href)=["\'](Base/[^"\']+)', html))
refs.update(re.findall(r'url\(["\']?(Base/[^)"\']+)', html))
files = [Path('index.html'), Path('cloud/config.js'), Path('cloud/engine.js'), Path('cloud/client.js')] + [Path(unquote(ref)) for ref in sorted(refs)]
for relative in files:
    source = ROOT / relative
    if not source.resolve().is_relative_to(ROOT) or not source.is_file():
        raise ValueError(f'Invalid or missing asset: {relative}')
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
for relative in files:
    target = OUTPUT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / relative, target)
(OUTPUT / '.nojekyll').touch()
print(f'Built {len(files)} files in _site (backup data excluded).')
