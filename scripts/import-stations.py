"""Importa a tabela SIV de estações e associa siglas a coordenadas existentes.

Uso: python scripts/import-stations.py "ESTAÇÕES 2015.pdf"
Requer pypdfium2. Os pátios sem sigla no KMZ ou na base Infra S.A. ficam sem coordenadas.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pypdfium2


ROOT = Path(__file__).resolve().parents[1]
PDF = Path(sys.argv[1])
ROW = re.compile(r"^([A-Z0-9]{3,4})\s+(.+?)\s+(\d+(?:,\d+)?)\s+(\d+(?:,\d+)?)\s+(\d+(?:,\d+)?)\s+(\d+)$")


def km_number(value):
    return float(value.replace(",", ".")) if value else None


pdf = pypdfium2.PdfDocument(str(PDF))
rows = []
for page_number, page in enumerate(pdf, 1):
    for text in page.get_textpage().get_text_range().splitlines():
        text = text.strip()
        match = ROW.fullmatch(text)
        if match:
            code, name, km, entry, exit_km, sub = match.groups()
        elif text == "ZCA COLOMBIA 506,5 506,81 72":
            # Nesta linha a célula de km ENTRADA está vazia no PDF.
            code, name, km, entry, exit_km, sub = "ZCA", "COLOMBIA", "506,5", "", "506,81", "72"
        elif re.match(r"^[A-Z0-9]{3,4} ", text):
            raise ValueError(f"Linha de estação não interpretada na página {page_number}: {text}")
        else:
            continue
        rows.append({"code": code, "name": name, "km": km, "entry": entry, "exit": exit_km, "sub": sub, "page": page_number})

if len(rows) != 818:
    raise ValueError(f"Esperadas 818 linhas; obtidas {len(rows)}")

base = json.loads((ROOT / "dist/assets/rail-points.json").read_text(encoding="utf-8-sig"))
malhas = json.loads((ROOT / "dist/assets/rail-malhas.json").read_text(encoding="utf-8"))
by_code = defaultdict(list)
for point in base:
    raw = km_number(point.get("source_km", ""))
    by_code[point["yard"]].append((point["lat"], point["lng"], raw))

anchors = defaultdict(list)
for point in malhas["stationAnchors"]:
    anchors[point["code"]].append((point["lat"], point["lng"]))

stations = {}
for row in rows:
    code = row["code"]
    station = stations.setdefault(code, {"code": code, "name": row["name"], "lat": None, "lng": None, "records": []})
    station["records"].append({key: row[key] for key in ("km", "entry", "exit", "sub", "page")})

for station in stations.values():
    code = station["code"]
    candidates = by_code.get(code, [])
    if candidates:
        target = km_number(station["records"][0]["km"])
        # O KMZ mistura valores em km e metros; compare as duas escalas.
        point = min(candidates, key=lambda item: min(abs(item[2] - target), abs(item[2] / 1000 - target)) if item[2] is not None and target is not None else float("inf"))
        station["lat"], station["lng"] = point[:2]
        station["locationSource"] = "KMZ"
    elif anchors.get(code):
        # Pontos terminais repetidos ficam próximos; a mediana evita desvios de um ramal.
        points = anchors[code]
        center_lat = sorted(p[0] for p in points)[len(points) // 2]
        center_lng = sorted(p[1] for p in points)[len(points) // 2]
        point = min(points, key=lambda p: (p[0] - center_lat) ** 2 + (p[1] - center_lng) ** 2)
        station["lat"], station["lng"] = point
        station["locationSource"] = "Infra S.A."

result = list(stations.values())
path = ROOT / "dist/assets/rail-stations.json"
path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
located = sum(item["lat"] is not None for item in result)
print(f"Imported {len(rows)} SIV records for {len(result)} stations; {located} located, {len(result) - located} without coordinates")
