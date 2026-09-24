# Independent XML/CSV audit using Python and Decimal; private output stays in test-results.
from pathlib import Path
from collections import Counter
from decimal import Decimal
import zipfile,io,hashlib,xml.etree.ElementTree as ET,json,sys,subprocess,csv
root=Path(sys.argv[1] if len(sys.argv)>1 else 'Documentos Germano');
card=subprocess.check_output(['pdftotext','-layout',str(root/'cnpj.pdf'),'-'],text=True)
import re
master=re.search(r'\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}',card)[0];master=re.sub(r'\D','',master)
seen=set();keys={};months={};stats=Counter();issues=[];canceled=set();pdfs={}
def read(data,name,depth=0):
 ext=Path(name).suffix.lower();digest=hashlib.sha256(data).hexdigest()
 if digest in seen:stats['duplicateBytes']+=1;return
 seen.add(digest)
 if ext=='.zip':
  stats['uniqueArchives']+=1
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   for n in z.namelist():
    if not n.endswith('/') and Path(n).suffix.lower() in ['.xml','.zip','.pdf','.csv']:read(z.read(n),n,depth+1)
 elif ext=='.csv':
  lines=[line for line in data.decode('cp1252').splitlines() if not line.startswith('sep=')]
  for row in csv.DictReader(lines,delimiter=';'):
   if row.get('SITUACAO') in ['CANCELADA','DENEGADA','REJEITADA']:canceled.add(re.sub(r'\D','',row['CHAVE']))
 elif ext=='.pdf': pdfs[digest]=name
 elif ext=='.xml':
  stats['uniqueXMLBytes']+=1
  try:doc=ET.fromstring(data)
  except:issues.append({'file':name,'error':'invalid XML'});return
  for e in doc.iter():e.tag=e.tag.split('}')[-1]
  inf=doc.find('.//infNFe')
  if inf is None:
   stats['nonInvoiceXML']+=1
   if doc.findtext('.//tpEvento')=='110111':canceled.add(doc.findtext('.//chNFe'))
   return
  key=inf.get('Id','').removeprefix('NFe')
  if key in keys:stats['sameKeyDifferentBytes']+=1;return
  get=lambda q:inf.findtext(q,'')
  emit=get('emit/CNPJ');dest=get('dest/CNPJ');comp=(get('ide/dhEmi') or get('ide/dEmi'))[:7]
  direction='saida' if emit==master else 'entrada' if dest==master else 'outro'
  val=Decimal(get('total/ICMSTot/vNF') or 0)
  row={'comp':comp,'direction':direction,'value':str(val),'credito':get('emit/CRT')=='3','status':doc.findtext('.//protNFe/infProt/cStat',''),'tpNF':get('ide/tpNF'),'finNFe':get('ide/finNFe')}
  keys[key]=row
for p in root.rglob('*'):
 if p.is_file() and p.suffix.lower() in ['.zip','.xml','.pdf','.csv']:read(p.read_bytes(),str(p.relative_to(root)))
for key,r in keys.items():
 t=months.setdefault(r['comp'],{'saida':Decimal(0),'entrada':Decimal(0),'credito':Decimal(0),'counts':Counter(),'status':Counter(),'tpNF':Counter(),'finNFe':Counter()})
 t['counts'][r['direction']]+=1;t['status'][r['status']]+=1;t['tpNF'][r['tpNF']]+=1;t['finNFe'][r['finNFe']]+=1
 if key in canceled:stats['canceledInvoices']+=1;continue
 if r['tpNF']=='0' or r['finNFe'] not in ['1','2']:stats['reviewInvoices']+=1;continue
 if r['direction'] in ['saida','entrada']:
  t[r['direction']]+=Decimal(r['value'])
  if r['direction']=='entrada' and r['credito']:t['credito']+=Decimal(r['value'])
report={'stats':dict(stats),'uniqueInvoices':len(keys),'uniquePDFs':len(pdfs),'canceledKeys':sorted(canceled),'issues':issues,'months':months,'invoices':keys}
Path('test-results/real-documents/archive-audit.json').write_text(json.dumps(report,default=lambda x:float(x) if isinstance(x,Decimal) else dict(x),indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='invoices'},default=lambda x:float(x) if isinstance(x,Decimal) else dict(x)))
