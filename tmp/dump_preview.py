import re
with open('backend/routers/mastering.py') as f:
    txt = f.read()
m = re.search(r"_ROUTE_SOURCE\s*=\s*'(@router\..*)'", txt, re.DOTALL)
src = m.group(1).replace('\\"', '"')
# Buscar el bloque del /preview
m2 = re.search(r'@router\.post\("/preview"[\s\S]*?(?=@router\.)', src)
if m2:
    print(m2.group(0)[:2000])
