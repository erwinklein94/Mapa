"""Extract the user's AMV workbook into an ignored JSON import file.

Positions are estimates from the existing KMZ mileposts, never surveyed coordinates.
"""
import glob
import json
import math
import os
import re
import sys
from pathlib import Path

import openpyxl

workbook_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(glob.glob(os.path.expanduser('~/Downloads/*AMV*'))[0])
rail_path = Path(__file__).resolve().parent.parent / 'dist/assets/rail-points.json'
output_path = Path(__file__).resolve().parent.parent / '.tmp/amv-import.json'

rail_points = json.loads(rail_path.read_text(encoding='utf-8-sig'))
corridor = []
for point in rail_points:
    try:
        km = float(str(point['source_km']).replace(',', '.')) / 1000
    except (ValueError, TypeError):
        continue
    # The worksheet names the ZEV–ZPG corridor in the São Paulo coastal region.
    # The KMZ contains the same kilometer numbers on unrelated branches.
    # Restrict interpolation to the named coastal anchors visible in this corridor.
    if point['yard'] in {'ZEV', 'ZEZ', 'ZXW', 'ZGP', 'ZPT', 'ZGM', 'ZPG'} and 64 <= km <= 128:
        corridor.append({**point, 'km': km})

def estimate(km):
    if km is None:
        return None, None, 'Sem KM na planilha nem no código do equipamento.'
    below = [p for p in corridor if p['km'] <= km]
    above = [p for p in corridor if p['km'] >= km]
    left = max(below, key=lambda p: p['km'], default=None)
    right = min(above, key=lambda p: p['km'], default=None)
    nearest = min(corridor, key=lambda p: abs(p['km'] - km), default=None)
    if nearest and abs(nearest['km'] - km) <= .1:
        return nearest['lat'], nearest['lng'], f'Posição aproximada pelo marco {nearest["name"]} do KMZ (até 100 m de diferença no KM).'
    if not left or not right or km - left['km'] > 2 or right['km'] - km > 2:
        return None, None, 'Não há marcos próximos suficientes no KMZ para estimar a posição.'
    if left['id'] == right['id'] or abs(right['km'] - left['km']) < 1e-9:
        return left['lat'], left['lng'], f'Posição estimada pelo marco {left["name"]} do KMZ.'
    ratio = (km - left['km']) / (right['km'] - left['km'])
    # Different lines can still carry adjacent KMs: reject long geographic jumps.
    distance_km = math.hypot((right['lat'] - left['lat']) * 111, (right['lng'] - left['lng']) * 102)
    if distance_km > max(3, (right['km'] - left['km']) * 3):
        return None, None, 'Marcos de KM próximos pertencem a trechos geograficamente distantes.'
    lat = left['lat'] + (right['lat'] - left['lat']) * ratio
    lng = left['lng'] + (right['lng'] - left['lng']) * ratio
    return lat, lng, f'Posição estimada entre {left["name"]} e {right["name"]} do KMZ.'

def clean(value):
    return str(value).strip() if value is not None and str(value).strip() else None

sheet = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True).active
result = []
for row_number, cells in enumerate(sheet.values, start=1):
    if row_number <= 2 or not clean(cells[0]):
        continue
    equipment = clean(cells[0])
    km = cells[4] if isinstance(cells[4], (int, float)) else None
    km_origin = 'planilha' if km is not None else None
    if km is None:
        match = re.search(r'/([0-9]{6})-', equipment)
        if match:
            km = int(match.group(1)) / 1000
            km_origin = 'código do equipamento'
    lat, lng, basis = estimate(km)
    result.append({
        'id': equipment,
        'source_row': row_number,
        'status': clean(cells[1]),
        'action': clean(cells[2]),
        'subdivision': clean(cells[3]),
        'km': km,
        'km_origin': km_origin,
        'type': clean(cells[5]),
        'leader': clean(cells[6]),
        'derivation': clean(cells[7]),
        'gauge': clean(cells[8]),
        'actuation': clean(cells[9]),
        'needle': clean(cells[10]),
        'rail_profile': clean(cells[11]),
        'opening': clean(cells[12]),
        'description': clean(cells[13]),
        'inspection_cycle': clean(cells[14]),
        'notes': clean(cells[15]),
        'lat': lat,
        'lng': lng,
        'position_quality': 'estimated' if lat is not None else 'unlocated',
        'position_basis': basis,
    })

assert len(result) == 76, f'Expected 76 AMVs, found {len(result)}'
assert len({row['id'] for row in result}) == 76, 'Equipment IDs must be unique'
assert sum(row['lat'] is not None for row in result) >= 60, 'Unexpected geolocation coverage'
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'total': len(result), 'estimated': sum(row['lat'] is not None for row in result), 'unlocated': sum(row['lat'] is None for row in result)}, ensure_ascii=False))
