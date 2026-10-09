"""Preserve the operation drawing and index every PDF text object.

Usage: python scripts/import-operation.py PDF_PATH KML_PATH
Requires pypdfium2 and Pillow. No geographic positions or SUB memberships are inferred.
"""
import sys, json, re, hashlib, shutil, math
from pathlib import Path
from collections import Counter
import xml.etree.ElementTree as ET
import pypdfium2 as pdfium
from PIL import Image

root=Path(__file__).resolve().parent.parent
source=Path(sys.argv[1])
out=root/'dist/assets/operation'
out.mkdir(parents=True,exist_ok=True)
doc=pdfium.PdfDocument(source)
assert len(doc)==1, 'Review additional pages before importing'
page=doc[0]; width,height=page.get_size(); textpage=page.get_textpage()
details=[
 {'id':'detail-1','name':'Detalhe 1 · Santos','box':[568,3,854,306]},
 {'id':'detail-2','name':'Detalhe 2 · Iperó, Amador Bueno, Canguera e Salto','box':[854,3,1206,306]},
 {'id':'detail-3','name':'Detalhe 3 · Campinas','box':[1206,3,1400,306]},
 {'id':'detail-4','name':'Detalhe 4 · Araraquara','box':[1400,3,1788,306]},
 {'id':'detail-5','name':'Detalhe 5 · SUB 76 · Iperó–Rubião Junior','box':[568,1976,994,2274]},
 {'id':'detail-7','name':'Detalhe 7 · SUB 78 · Bauru–Itirapina','box':[568,2274,925,2548]},
 {'id':'detail-6','name':'Detalhe 6 · Anápolis','box':[568,2548,854,2846]},
]
items=[]
for obj in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_TEXT],textpage=textpage):
    text=obj.extract().strip()
    if not text: continue
    left,bottom,right,top=obj.get_bounds()
    box=[round(left,3),round(height-top,3),round(right,3),round(height-bottom,3)]
    codes=list(dict.fromkeys(re.findall(r'\b[A-Z]{3}\b', ' '.join(re.findall(r'\(([^)]+)\)',text)))))
    category='Localidades e KMs' if codes else 'Notas e referências'
    if re.fullmatch(r'\d{1,3}',text): category='SUB'
    elif any(c in text for c in '↑↓←→') or re.search(r'\b(?:FCA|MRS|PORTOFERR)\b',text): category='Conexões'
    elif re.search(r'\bkm\b',text,re.I) and not codes: category='Quilometragens'
    elif 'DETALHE' in text.upper(): category='Detalhes'
    section=next((d['id'] for d in details if d['box'][0]<=(box[0]+box[2])/2<=d['box'][2] and d['box'][1]<=(box[1]+box[3])/2<=d['box'][3]),'general')
    items.append({'id':f'pdf-{len(items)+1:04d}','text':text,'box':box,'codes':codes,'category':category,'section':section})
subs=sorted({i['text'] for i in items if i['category']=='SUB'},key=int)
manifest={'title':'Mapa de Operação Rumo','source':'MAPA_OPERAÇÃO.pdf','sourceDate':'DEZ-2023','sourceBase':'SIV','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'width':width,'height':height,'tileSize':512,'maxNativeZoom':2,'details':details,'subs':subs,'items':items,'counts':dict(Counter(i['category'] for i in items))}
(out/'catalog.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
shutil.copyfile(source,out/'source.pdf')
print(f'Indexed {len(items)} text objects; {len(subs)} distinct SUB labels',flush=True)

# A 4x raster gives the smallest source labels ~18 pixels of height at native zoom.
# Tiles preserve every path, color, arrow, symbol and note, including outlined glyphs.
for z in range(3):
    bitmap=page.render(scale=2**z)
    image=bitmap.to_pil().convert('RGB')
    if z==0:
        preview=image.copy(); preview.thumbnail((1200,1700)); preview.save(out/'preview.webp',quality=92)
    for x in range(math.ceil(image.width/512)):
        folder=out/'tiles'/str(z)/str(x); folder.mkdir(parents=True,exist_ok=True)
        for y in range(math.ceil(image.height/512)):
            tile=Image.new('RGB',(512,512),'white')
            tile.paste(image.crop((x*512,y*512,min((x+1)*512,image.width),min((y+1)*512,image.height))))
            tile.save(folder/f'{y}.png',optimize=True)
    print(f'Rendered zoom {z}: {image.size}',flush=True)
    image.close(); bitmap.close()

if len(sys.argv)>2:
    ns={'k':'http://www.opengis.net/kml/2.2'}
    tree=ET.parse(sys.argv[2]); sb=[]
    for pm in tree.findall('.//k:Placemark',ns):
        text=pm.findtext('k:description',default='',namespaces=ns)
        kms=re.findall(r'KM (?:In.cio|Fim):</b>\s*([^<]+)',text)
        coords=pm.findtext('.//k:LineString/k:coordinates',namespaces=ns)
        if not coords: continue
        sb.append({'id':pm.findtext('k:name',namespaces=ns),'coordinates':[[float(v) for v in p.split(',')[:2]] for p in coords.split()],'km_start':kms[0] if kms else '', 'km_end':kms[1] if len(kms)>1 else ''})
    (root/'dist/assets/rail-sb.json').write_text(json.dumps(sb,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'Imported all {len(sb)} SB segments',flush=True)
