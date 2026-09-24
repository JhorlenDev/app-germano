import {mkdir,copyFile,chmod} from 'node:fs/promises';
const target=new URL('../dist-original/',import.meta.url);
await mkdir(new URL('scripts/',target),{recursive:true});
await copyFile(new URL('../diagnostico-tributario-2027-app.html',import.meta.url),new URL('index.html',target));
await copyFile(new URL('./serve-original.mjs',import.meta.url),new URL('scripts/serve-original.mjs',target));
await chmod(new URL('index.html',target),0o644);
await chmod(new URL('scripts/serve-original.mjs',target),0o644);
console.log('HTML original copiado sem alterações para dist-original/index.html');
