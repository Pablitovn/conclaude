import re, sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    txt = f.read()

m = re.search(r"_ROUTE_SOURCE\s*=\s*'(@router\..*)'", txt, re.DOTALL)
if not m:
    print("No _ROUTE_SOURCE found")
    sys.exit(1)
src = m.group(1)
clean = src.replace('\\"', '"')
for m2 in re.finditer(r'@router\.(get|post|websocket)\("([^"]+)"', clean):
    print(f'{m2.group(1).upper():10s} /{m2.group(2)}')
