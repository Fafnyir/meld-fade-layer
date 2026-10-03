"""Create a source ZIP. The native installer is built separately with Elgato CLI."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
dist.mkdir(exist_ok=True)
version = json.loads((root / 'package.json').read_text())['version']
target = dist / f'Meld-Fade-Layer-{version}-source.zip'
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        rel = file.relative_to(root)
        if not file.is_file() or any(p in {'dist', 'node_modules', '.git', '__pycache__', '.DS_Store'} for p in rel.parts):
            continue
        archive.write(file, Path('fade-layer') / rel)
    for installer in sorted(dist.glob('com.fafnyir.meldfade.streamDeckPlugin')):
        archive.write(installer, Path('fade-layer/dist') / installer.name)
checksums = []
for file in sorted(dist.iterdir()):
    if file.suffix in {'.zip', '.streamDeckPlugin'}:
        checksums.append(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}')
(dist / 'SHA256SUMS.txt').write_text('\n'.join(checksums)+'\n')
print(target)
