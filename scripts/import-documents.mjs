import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {validateDocument} from '../src/documents.js';
const names=['MAPA UNIFILAR.pdf','Mapa Rumo_ALL_2015-52X74cm.pdf','Mapa Rumo 2020.pdf','ESTAÇÕES 2015.pdf','09-TRECHOS.pdf','08-CORREDORES.pdf','07-BAIXA DENSIDADE.pdf','06-TON-EIXO.pdf','05-SUBS.pdf','04-VIAS.pdf','03-BITOLAS.pdf','02-MALHAS.pdf','01-OPERAÇÃO.pdf',"Gestão Geral de AMV's (1).xlsx"];
const directory=process.argv[2];if(!directory)throw Error('Informe o diretório dos documentos.');
const db=createClient('https://rgjdhajnbwmjoqceeypd.supabase.co','sb_publishable_maFGs9599a7NvR_iKwxFUA_bnDLwj03',{auth:{persistSession:false,autoRefreshToken:false}});
const ok=async p=>{const r=await p;if(r.error)throw r.error;return r.data};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await ok(db.auth.signInWithPassword({email:process.env.TEST_EMAIL,password:process.env.TEST_PASSWORD}));
try{
 for(const name of names){
  const local=path.join(directory,name),bytes=await readFile(local),info=await stat(local);
  const {ext,contentType}=validateDocument({name,size:info.size});
  if(ext==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');else assert.equal(bytes.subarray(0,2).toString(),'PK');
  const found=await ok(db.from('documents').select('*').eq('name',name));
  let record=found.find(d=>d.size_bytes===info.size);
  if(!record){
   const objectPath=`${randomUUID()}.${ext}`;
   await ok(db.storage.from('documents').upload(objectPath,bytes,{contentType}));
   try{record=await ok(db.from('documents').insert({name,path:objectPath,format:ext.toUpperCase(),size_bytes:info.size}).select().single())}
   catch(e){await db.storage.from('documents').remove([objectPath]);throw e}
  }
  const downloaded=await ok(db.storage.from('documents').download(record.path));
  assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())),hash(bytes),`Conteúdo diferente: ${name}`);
  console.log('VERIFICADO: '+name);
 }
 console.log('14 documentos importados e downloads conferidos por SHA-256.');
}finally{await db.auth.signOut()}
