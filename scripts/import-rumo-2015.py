"""Index the historical Rumo/ALL drawing without replacing the 2023 source.

Usage: python scripts/import-rumo-2015.py PDF_PATH
Requires pypdf, pypdfium2 and Pillow. No coordinates are inferred from the drawing.

Several AutoCAD Identity-H fonts in this PDF have no ToUnicode table. For text
extraction only, reconstruct it from each embedded TrueType Unicode cmap. The
published source and rendered tiles always use the unmodified input PDF.
"""
import hashlib
import io
import json
import math
import re
import shutil
import struct
import sys
from collections import Counter
from pathlib import Path

import pypdf
import pypdfium2 as pdfium
from PIL import Image
from pypdf.generic import DecodedStreamObject, NameObject


def glyph_map(data):
    tables = {}
    for i in range(struct.unpack_from('>H', data, 4)[0]):
        tag, _, offset, length = struct.unpack_from('>4sIII', data, 12 + 16 * i)
        tables[tag] = data[offset:offset + length]
    table = tables[b'cmap']
    result = {}
    for i in range(struct.unpack_from('>H', table, 2)[0]):
        platform, encoding, offset = struct.unpack_from('>HHI', table, 4 + i * 8)
        if platform != 3 or encoding != 1:
            continue
        sub = table[offset:]
        fmt, _, _, seg_count = struct.unpack_from('>HHHH', sub, 0)
        assert fmt == 4, 'Review unexpected TrueType cmap format'
        count = seg_count // 2
        ends = struct.unpack_from('>' + str(count) + 'H', sub, 14)
        starts = struct.unpack_from('>' + str(count) + 'H', sub, 16 + count * 2)
        deltas = struct.unpack_from('>' + str(count) + 'h', sub, 16 + count * 4)
        ranges = struct.unpack_from('>' + str(count) + 'H', sub, 16 + count * 6)
        for j, (start, end, delta, rng) in enumerate(zip(starts, ends, deltas, ranges)):
            for cp in range(start, end + 1):
                if cp == 65535:
                    continue
                gid = (cp + delta) & 65535 if not rng else struct.unpack_from(
                    '>H', sub, 16 + count * 6 + 2 * j + rng + 2 * (cp - start))[0]
                if rng and gid:
                    gid = (gid + delta) & 65535
                if gid:
                    result.setdefault(gid, cp)
    assert result, 'Embedded font has no usable Unicode cmap'
    return result


def extraction_document(source):
    reader = pypdf.PdfReader(source)
    assert len(reader.pages) == 1, 'Review additional pages before importing'
    repaired = []
    for key, font in reader.pages[0]['/Resources']['/Font'].items():
        font = font.get_object()
        if font.get('/Encoding') != '/Identity-H' or '/ToUnicode' in font:
            continue
        child = font['/DescendantFonts'][0]
        assert child.get('/CIDToGIDMap', '/Identity') == '/Identity'
        mapping = glyph_map(child['/FontDescriptor']['/FontFile2'].get_data())
        lines = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
                 '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
                 '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def',
                 '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange']
        entries = list(mapping.items())
        for i in range(0, len(entries), 100):
            batch = entries[i:i + 100]
            lines.append(f'{len(batch)} beginbfchar')
            lines.extend(f'<{gid:04X}> <{cp:04X}>' for gid, cp in batch)
            lines.append('endbfchar')
        lines.extend(['endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end'])
        stream = DecodedStreamObject()
        stream.set_data('\n'.join(lines).encode())
        font[NameObject('/ToUnicode')] = stream
        repaired.append(str(key))
    writer = pypdf.PdfWriter()
    writer.add_page(reader.pages[0])
    buf = io.BytesIO()
    writer.write(buf)
    return pdfium.PdfDocument(buf.getvalue()), repaired


DETAILS = [
    {'id': 'detail-1', 'name': 'Detalhe 1 · Santos', 'box': [1167.2, 34.52, 1576.64, 401]},
    {'id': 'detail-2', 'name': 'Detalhe 2 · Iperó - Amador Bueno', 'box': [1576.64, 34.52, 2082.68, 401]},
    {'id': 'detail-3', 'name': 'Detalhe 3 · Campinas', 'box': [2082.68, 34.52, 2364.08, 401]},
    {'id': 'detail-4', 'name': 'Detalhe 4 · SUB 76 · Iperó - Rubião Junior', 'box': [19.16, 1648.76, 530.72, 1936.52]},
    {'id': 'detail-5', 'name': 'Detalhe 5 · SUB 78 · Bauru - Itirapina', 'box': [19.16, 1936.52, 530.72, 2331.32]},
]


def extract_items(page):
    width, height = page.get_size()
    textpage = page.get_textpage()
    items = []
    for obj in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_TEXT], textpage=textpage):
        text = obj.extract().strip()
        if not text:
            continue
        left, bottom, right, top = obj.get_bounds()
        box = [round(left, 3), round(height - top, 3), round(right, 3), round(height - bottom, 3)]
        codes = list(dict.fromkeys(re.findall(r'\b[A-Z]{3}\b', ' '.join(re.findall(r'\(([^)]+)\)', text)))))
        category = 'Localidades e KMs' if codes else 'Notas e referências'
        if re.fullmatch(r'\d{1,3}', text):
            category = 'SUB'
        elif any(c in text for c in '↑↓←→') or re.search(r'\b(?:FCA|MRS|PORTOFERR)\b', text):
            category = 'Conexões'
        elif re.search(r'\bkm\b', text, re.I) and not codes:
            category = 'Quilometragens'
        elif 'DETALHE' in text.upper():
            category = 'Detalhes'
        section = next((d['id'] for d in DETAILS if
                        d['box'][0] <= (box[0] + box[2]) / 2 <= d['box'][2] and
                        d['box'][1] <= (box[1] + box[3]) / 2 <= d['box'][3]), 'general')
        items.append({'id': f'rumo2015-{len(items) + 1:04d}', 'text': text, 'box': box,
                      'codes': codes, 'category': category, 'section': section})

    # AutoCAD emitted station headings and their KM/directional lines as separate
    # objects. Only attach immediately following lines with a small vertical gap
    # and horizontal overlap. Preserve every raw text object and its hit target.
    for i, item in enumerate(items):
        if not item['codes']:
            continue
        adjacent = []
        previous = item
        for other in items[i + 1:i + 5]:
            if other['codes'] or other['category'] not in ('Quilometragens', 'Conexões'):
                break
            a, b = previous['box'], other['box']
            if (other['section'] != item['section'] or not -0.5 <= b[1] - a[3] <= 4.5 or
                    min(a[2], b[2]) <= max(a[0], b[0])):
                break
            adjacent.append(other)
            previous = other
        if adjacent:
            item['contextText'] = '\n'.join([item['text']] + [a['text'] for a in adjacent])
            item['relatedIds'] = [a['id'] for a in adjacent]
            for other in adjacent:
                other['anchorCodes'] = item['codes']
                other['anchorId'] = item['id']
                other['contextText'] = item['contextText']
        context = item.get('contextText', item['text'])
        kms = re.findall(r'\bkm\s*([\d.,]+)', context, flags=re.I)
        if kms:
            item['kmReferences'] = kms
    return items


def main():
    root = Path(__file__).resolve().parent.parent
    source = Path(sys.argv[1])
    out = root / 'dist/assets/operation-2015'
    out.mkdir(parents=True, exist_ok=True)
    decoded, repaired = extraction_document(source)
    items = extract_items(decoded[0])
    original = pdfium.PdfDocument(source)
    page = original[0]
    width, height = page.get_size()
    subs = sorted({i['text'] for i in items if i['category'] == 'SUB'}, key=int)
    previous = json.loads((root / 'dist/assets/operation/catalog.json').read_text(encoding='utf-8'))
    old_codes = {c for item in previous['items'] for c in item['codes']}
    new_codes = {c for item in items for c in item['codes']}
    comparison = {'reference': 'Mapa de Operação Rumo · DEZ-2023',
                  'sharedCodes': len(old_codes & new_codes),
                  'additionalCodes': sorted(new_codes - old_codes),
                  'note': 'Diferenças históricas; não substituem os dados de dezembro de 2023.'}
    manifest = {
        'id': 'rumo-2015', 'assetBase': 'assets/operation-2015',
        'title': 'Mapa Rumo / ALL 2015', 'source': source.name,
        'sourceDate': '26/06/2015', 'sourceBase': 'SIV', 'historical': True,
        'sourceStatus': 'Mapa em revisão (conforme o documento original)',
        'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'width': width, 'height': height, 'tileSize': 512, 'maxNativeZoom': 2,
        'details': DETAILS, 'subs': subs, 'items': items,
        'counts': dict(Counter(i['category'] for i in items)),
        'uniqueCodeCount': len(new_codes), 'comparison': comparison,
        'extraction': {'fontCmapsRecovered': repaired,
                       'coordinatePolicy': 'Prancha esquemática sem coordenadas geográficas; associação por código de estação.'},
    }
    (out / 'catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    shutil.copyfile(source, out / 'source.pdf')
    print(f'Indexed {len(items)} objects, {len(new_codes)} station codes and {len(subs)} SUB labels', flush=True)
    for z in range(3):
        bitmap = page.render(scale=2 ** z)
        image = bitmap.to_pil().convert('RGB')
        if z == 0:
            preview = image.copy()
            preview.thumbnail((1200, 1700))
            preview.save(out / 'preview.webp', quality=92)
        for x in range(math.ceil(image.width / 512)):
            folder = out / 'tiles' / str(z) / str(x)
            folder.mkdir(parents=True, exist_ok=True)
            for y in range(math.ceil(image.height / 512)):
                tile = Image.new('RGB', (512, 512), 'white')
                tile.paste(image.crop((x * 512, y * 512, min((x + 1) * 512, image.width), min((y + 1) * 512, image.height))))
                tile.save(folder / f'{y}.png', optimize=True)
        print(f'Rendered original PDF at zoom {z}: {image.size}', flush=True)
        image.close()
        bitmap.close()


if __name__ == '__main__':
    main()
