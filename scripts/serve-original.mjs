import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const packagedFile=new URL('../index.html',import.meta.url);
const sourceFile=new URL('../diagnostico-tributario-2027-app.html',import.meta.url);
export function originalServer(html=readFileSync(existsSync(sourceFile)?sourceFile:packagedFile)) {
  return createServer((req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'&&req.method!=='HEAD') {
      res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;
    }
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/api/health'||pathname==='/health') {
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:true,version:'html-original'}));return;
    }
    if(!['/','/index.html','/diagnostico-tributario-2027-app.html'].includes(pathname)) {
      res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Não encontrado');return;
    }
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length});
    res.end(req.method==='HEAD'?undefined:html);
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.PORT||5173);
  const host=process.env.HOST||'127.0.0.1';
  const server=originalServer();
  server.listen(port,host,()=>console.log(`HTML original disponível em http://${host}:${port}`));
  server.on('error',err=>{console.error(err.message);process.exitCode=1;});
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
