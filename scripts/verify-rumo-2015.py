"""Verify text recovery, source provenance, related KM lines and original tiles."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageChops

root = Path(__file__).resolve().parent.parent
out = root / 'dist/assets/operation-2015'
catalog = json.loads((out / 'catalog.json').read_text(encoding='utf-8'))
source = out / 'source.pdf'
assert hashlib.sha256(source.read_bytes()).hexdigest() == catalog['sha256']
assert catalog['sourceDate'] == '26/06/2015' and catalog['historical']
assert catalog['id'] == 'rumo-2015' and catalog['assetBase'] == 'assets/operation-2015'
assert len(catalog['items']) == 1421 and len(catalog['subs']) == 80
assert len(catalog['details']) == 5
assert len(catalog['extraction']['fontCmapsRecovered']) == 4
assert catalog['comparison']['additionalCodes'] == ['TPD', 'TPO', 'ZSP']

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('import_rumo_2015', root / 'scripts/import-rumo-2015.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
decoded, _ = importer.extraction_document(source)
assert importer.extract_items(decoded[0]) == catalog['items'], 'Catalog differs from decoded source'

items = {item['id']: item for item in catalog['items']}
assert len(items) == 1421
assert all(i.startswith('rumo2015-') for i in items)
codes = {code for item in items.values() for code in item['codes']}
assert len(codes) == catalog['uniqueCodeCount'] == 664
assert any(i['text'] == 'PARANAGUÁ(LPG)km 0,100' for i in items.values())
tag = next(i for i in items.values() if i['text'] == 'ALTO ARAGUAIA(TAG)')
assert tag['contextText'] == 'ALTO ARAGUAIA(TAG)\n← TRO km 497,900\n↓ TMI km 497,500'
assert tag['kmReferences'] == ['497,900', '497,500']
assert any(i['text'] == '*MAPA EM REVISÃO' for i in items.values())
assert not any(any(ord(ch) < 32 for ch in i['text']) for i in items.values())
for item in items.values():
    assert 'lat' not in item and 'lng' not in item, 'Schematic positions are not geographic coordinates'
    for related_id in item.get('relatedIds', []):
        related = items[related_id]
        assert related['anchorCodes'] == item['codes']
        assert related['anchorId'] == item['id']
        assert related['contextText'] == item['contextText']

doc = pdfium.PdfDocument(source)
page = doc[0]
assert list(page.get_size()) == [catalog['width'], catalog['height']]
expected_tiles = set()
for z in range(catalog['maxNativeZoom'] + 1):
    width, height = [math.ceil(v * 2 ** z) for v in page.get_size()]
    for x in range(math.ceil(width / 512)):
        for y in range(math.ceil(height / 512)):
            expected_tiles.add(f'{z}/{x}/{y}.png')
actual_tiles = {p.relative_to(out / 'tiles').as_posix() for p in (out / 'tiles').rglob('*.png')}
assert actual_tiles == expected_tiles, 'Missing or unexpected drawing tiles'
# Compare two distant tiles against a fresh raster of the unmodified source.
bitmap = page.render(scale=1)
raster = bitmap.to_pil().convert('RGB')
for x, y in [(2, 0), (0, 6)]:
    expected = Image.new('RGB', (512, 512), 'white')
    expected.paste(raster.crop((x * 512, y * 512, min((x + 1) * 512, raster.width), min((y + 1) * 512, raster.height))))
    with Image.open(out / 'tiles' / '0' / str(x) / f'{y}.png') as actual:
        assert ImageChops.difference(expected, actual.convert('RGB')).getbbox() is None
print(f'Rumo/ALL 2015 verified: {len(items)} source objects, {len(codes)} codes, {len(expected_tiles)} original-image tiles.')
