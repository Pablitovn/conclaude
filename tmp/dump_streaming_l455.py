import re
with open('backend/routers/streaming.py') as f:
    txt = f.read()
m = re.search(r"_ROUTE_SOURCE\s*=\s*'(@router\..*)'", txt, re.DOTALL)
src = m.group(1)
# El string tiene \n literales, partimos por '\\n' literal (no el newline real)
parts = src.split('\\n')
print(f'Total lineas logicas: {len(parts)}')
for i in range(450, 465):
    if i < len(parts):
        print(f'{i+1}: {parts[i][:200]}')
