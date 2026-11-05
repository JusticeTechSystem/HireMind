#!/usr/bin/env python3
"""Regenerates docs/api.md from the controller decorators. Swagger at /api/docs stays authoritative."""
import re, glob
rows = []
for f in sorted(glob.glob('apps/api/src/**/*.ts', recursive=True)):
    s = open(f).read()
    if '@Controller' not in s or f.endswith('.spec.ts'): continue
    for cm in re.finditer(r"@Controller\((?:'([^']*)')?\)([\s\S]*?)(?=\n@Controller|\Z)", s):
        prefix, body = cm.group(1) or '', cm.group(2); head = body.split('export class')[0]
        class_auth = 'UseGuards(AuthGuard' in head; cr = re.search(r"@Roles\(([^)]*)\)", head); croles = cr.group(1).replace("'", '') if cr else ''
        for line in body.split('\n'):
            m = re.search(r"@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?", line)
            if not m: continue
            path = '/'.join(x for x in ['/api/v1', prefix, m.group(2) or ''] if x).replace('//', '/')
            auth = class_auth or 'UseGuards(AuthGuard' in line; r = re.search(r"@Roles\(([^)]*)\)", line); rr = r.group(1).replace("'", '') if r else croles
            rows.append((m.group(1).upper(), path, 'public' if not auth else ('signed-in' + (f' + {rr}' if rr else ''))))
head = open('docs/api.md').read().split('| Method')[0] if True else ''
open('docs/api.md', 'w').write(head + "| Method | Path | Access |\n|---|---|---|\n" + "\n".join(f"| {a} | `{b}` | {c} |" for a, b, c in rows) + "\n")
print(len(rows), 'routes')
