#!/usr/bin/env python3
"""Run when preparing an overwrite package: python tools/build-assets.py [release].
No packages, credentials, Supabase changes or hosting configuration are needed.
"""
import base64, hashlib, json, pathlib, re, sys
from html.parser import HTMLParser
ROOT = pathlib.Path(__file__).resolve().parent.parent
release = sys.argv[1] if len(sys.argv)>1 else '288'
assert release.isdigit()
def digest(path): return hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
paths = sorted(p.name for p in ROOT.iterdir() if p.suffix in ('.js','.css') and p.name not in ('app-assets.js','service-worker.js'))
paths += sorted(str(p.relative_to(ROOT)) for p in (ROOT/'images').rglob('*') if p.is_file())
versions = {p:p+'?v='+digest(p) for p in paths}
runtime=(ROOT/'tools/app-assets-runtime.js').read_text().replace('__ASSET_MAP__',json.dumps(versions,separators=(',',':')))
(ROOT/'app-assets.js').write_text(runtime)
versions['app-assets.js']='app-assets.js?v='+digest('app-assets.js')
def replace_ref(match):
    before, path, after=match.groups()
    key=path.removeprefix('./').split('?')[0]
    return before+versions.get(key,path)+after
for page in ('index.html','reset-password.html','payapp-return.html'):
    text=(ROOT/page).read_text()
    text=re.sub(r'((?:src|href)=")([^"#]+)(")',replace_ref,text)
    if page=='index.html':
        text=re.sub(r'(<meta name="app-version" content=")[^"]+("\s*>)',lambda m:m[1]+release+m[2],text)
    (ROOT/page).write_text(text)
html=(ROOT/'index.html').read_text()
class InitialFiles(HTMLParser):
    def __init__(self): super().__init__(); self.paths=set()
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='script': target=a.get('src')
        elif tag=='link' and a.get('rel') in ('stylesheet','icon','apple-touch-icon','manifest'): target=a.get('href')
        elif tag=='img' and a.get('loading')!='lazy': target=a.get('src')
        else: return
        if target and not target.startswith(('https:', 'data:', 'blob:')): self.paths.add(target.split('?')[0])
parser=InitialFiles(); parser.feed(html)
eager=parser.paths
eager|={'index.html'}
paths+=['app-assets.js','index.html','privacy.html','reset-password.html','payapp-return.html','manifest.json']
entries=[]
for path in sorted(set(paths)):
    hash=digest(path)
    entries.append({'path':path,'url':path+'?v='+hash,'integrity':'sha256-'+base64.b64encode(bytes.fromhex(hash)).decode(),'eager':path in eager})
template=(ROOT/'tools/service-worker-template.js').read_text()
(ROOT/'service-worker.js').write_text(template.replace('__RELEASE__',release).replace('__WORKER_ASSETS__',json.dumps(entries,separators=(',',':'))))
summary={'release':release,'eager_files':sum(e['eager'] for e in entries),'eager_bytes':sum((ROOT/e['path']).stat().st_size for e in entries if e['eager'])}
print(json.dumps(summary))
