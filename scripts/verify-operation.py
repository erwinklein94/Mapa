"""Offline integrity checks. Usage: python scripts/verify-operation.py [SB_KML_PATH]."""
from pathlib import Path
from collections import Counter
import hashlib, json, math, re, sys
import xml.etree.ElementTree as ET
import pypdfium2 as pdfium
from PIL import Image

root=Path(__file__).resolve().parent.parent
assets=root/'dist/assets'
source=assets/'operation'
catalog=json.loads((source/'catalog.json').read_text(encoding='utf-8'))
assert hashlib.sha256((source/'source.pdf').read_bytes()).hexdigest()==catalog['sha256']
doc=pdfium.PdfDocument(source/'source.pdf')
assert len(doc)==1
page=doc[0]
textpage=page.get_textpage()
texts=[o.extract().strip() for o in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_TEXT],textpage=textpage)]
texts=[t for t in texts if t]
items=catalog['items']
assert texts==[i['text'] for i in items], 'Missing or changed PDF text'
assert len(items)==len({i['id'] for i in items})==1512
assert dict(Counter(i['category'] for i in items))==catalog['counts']
assert {i['text'] for i in items if i['category']=='SUB'}==set(catalog['subs'])
assert len(catalog['subs'])==91
sections={'general',*[d['id'] for d in catalog['details']]}
assert len(sections)==8
for i in items:
    x1,y1,x2,y2=i['box']
    assert 0<=x1<=x2<=catalog['width'] and 0<=y1<=y2<=catalog['height']
    assert i['section'] in sections
tile_count=0
for z in range(catalog['maxNativeZoom']+1):
    for x in range(math.ceil(catalog['width']*2**z/catalog['tileSize'])):
        for y in range(math.ceil(catalog['height']*2**z/catalog['tileSize'])):
            with Image.open(source/f'tiles/{z}/{x}/{y}.png') as image:
                assert image.size==(512,512)
                image.verify()
            tile_count+=1
assert tile_count==688
points=json.loads((assets/'rail-points.json').read_text(encoding='utf-8-sig'))
assert len(points)==len({p['id'] for p in points})==10444
assert all(-90<=p['lat']<=90 and -180<=p['lng']<=180 for p in points)
sb=json.loads((assets/'rail-sb.json').read_text(encoding='utf-8'))
assert len(sb)==len({s['id'] for s in sb})==2025
assert all(s['km_start'] and s['km_end'] and len(s['coordinates'])>=2 for s in sb)
assert all(-180<=lng<=180 and -90<=lat<=90 for s in sb for lng,lat in s['coordinates'])
if len(sys.argv)>1:
    ns={'k':'http://www.opengis.net/kml/2.2'}
    original=[]
    for pm in ET.parse(sys.argv[1]).findall('.//k:Placemark',ns):
        coords=pm.findtext('.//k:LineString/k:coordinates',namespaces=ns)
        if not coords: continue
        kms=re.findall(r'KM (?:In.cio|Fim):</b>\s*([^<]+)',pm.findtext('k:description',default='',namespaces=ns))
        original.append({'id':pm.findtext('k:name',namespaces=ns),'coordinates':[[float(v) for v in p.split(',')[:2]] for p in coords.split()],'km_start':kms[0],'km_end':kms[1]})
    assert original==sb, 'KML IDs, KMs or coordinates changed'
print(f'OK: original PDF hash, {len(items)} exact labels, 91 SUB, 7 details, {tile_count} tiles, {len(points)} points, {len(sb)} SB')
