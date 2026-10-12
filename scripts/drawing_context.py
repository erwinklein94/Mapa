"""Attach adjacent KM/direction lines to their station heading, retaining source objects.

Optional CLI enriches an already extracted catalog without changing its PDF or tiles.
"""
import json
import re
import sys
from pathlib import Path


def attach_station_context(items):
    for index, item in enumerate(items):
        if not item['codes']:
            continue
        adjacent = []
        previous = item
        for other in items[index + 1:index + 5]:
            if other['codes'] or other['category'] not in ('Quilometragens', 'Conexões'):
                break
            a, b = previous['box'], other['box']
            if (other['section'] != item['section'] or not -0.5 <= b[1] - a[3] <= 4.5 or
                    min(a[2], b[2]) <= max(a[0], b[0])):
                break
            adjacent.append(other)
            previous = other
        if adjacent:
            item['contextText'] = '\n'.join([item['text']] + [line['text'] for line in adjacent])
            item['relatedIds'] = [line['id'] for line in adjacent]
            for other in adjacent:
                other['anchorCodes'] = item['codes']
                other['anchorId'] = item['id']
                other['contextText'] = item['contextText']
        kms = re.findall(r'\bkm\s*([\d.,]+)', item.get('contextText', item['text']), re.I)
        if kms:
            item['kmReferences'] = kms
    return items


if __name__ == '__main__':
    path = Path(sys.argv[1])
    catalog = json.loads(path.read_text(encoding='utf-8'))
    attach_station_context(catalog['items'])
    path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Linked {sum(bool(i.get('anchorCodes')) for i in catalog['items'])} KM/direction labels to station headings.")
