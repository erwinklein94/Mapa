// Records rendering and actions can be checked without the authenticated shell.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountOperationRecords,recordsForPoint} from '../src/operation.js';

class View {
 constructor(){this.html='';this.table='';this.elements=new Map();this.buttons=new Map()}
 get innerHTML(){return this.html}
 set innerHTML(value){this.html=value;this.table='';this.elements.clear();this.buttons.clear()}
 querySelector(selector){
  if(!selector.startsWith('#')||!(`${this.html}${this.table}`).includes(`id="${selector.slice(1)}"`))return null;
  if(!this.elements.has(selector)){
   const view=this;
   this.elements.set(selector,{set innerHTML(value){view.table=value},get innerHTML(){return view.table}});
  }
  return this.elements.get(selector);
 }
 querySelectorAll(selector){
  const attribute=selector.slice(1,-1);
  const key=attribute.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  return [...`${this.html}${this.table}`.matchAll(/<button\b([^>]*)>/g)].flatMap(([tag,attrs])=>{
   const found=new RegExp(`${attribute}="([^"]*)"`).exec(attrs);
   if(!found)return [];
   const identity=`${attribute}:${found[1]}:${tag}`;
   if(!this.buttons.has(identity)){
    const dataset=Object.fromEntries([...attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(([,name,value])=>[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),value]));
    this.buttons.set(identity,{dataset});
   }
   return [this.buttons.get(identity)];
  });
 }
}
const load=name=>JSON.parse(readFileSync(new URL(`../dist/assets/${name}.json`,import.meta.url),'utf8'));
const current={...load('operation/catalog'),id:'operation-2023',assetBase:'assets/operation'};
const historical=load('operation-2015/catalog');
const points=load('rail-points').map(p=>({...p,kind:'Ponto ferroviário',line_type:'Não classificada'}));
const pnPoints=load('rail-pns'),stations=load('rail-stations'),sbSegments=load('rail-sb');
const root=new View(),inspected=[],mapped=[],edited=[];
const options={root,catalog:current,catalogs:[current,historical],points,sbSegments,pnPoints,stations,onInspect:r=>inspected.push(r),onMap:r=>mapped.push(r),onPoint:p=>edited.push(p),onAdd:()=>{}};
const clickTab=tab=>root.querySelectorAll('[data-tab]').find(b=>b.dataset.tab===tab).onclick();
const input=(id,value)=>root.querySelector(`#${id}`).oninput({target:{value}});
const choose=(id,value)=>root.querySelector(`#${id}`).onchange({target:{value}});
mountOperationRecords(options);
assert.match(root.innerHTML,/Passagens de nível/);
assert.match(root.innerHTML,/Rumo \/ ALL/);
choose('catalog-source',historical.id);
root.querySelectorAll('[data-inspect]')[0].onclick();
assert.equal(inspected.at(-1).catalogId,historical.id,'source must accompany a PDF reference');
assert.equal(inspected.at(-1).type,'pdf');
root.querySelectorAll('[data-map]')[0].onclick();
assert.deepEqual(mapped.at(-1),inspected.at(-1),'map and modal must identify the same historical record');

const contextual=historical.items.find(i=>i.contextText&&i.contextText!==i.text&&i.codes.length&&i.category==='Localidades e KMs');
assert.ok(contextual,'historical catalog has preserved grouped label context');
input('catalog-search',contextual.codes[0]);
assert.ok(root.table.includes(contextual.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')));

clickTab('pn');
root.querySelectorAll('[data-inspect]')[0].onclick();
assert.deepEqual(inspected.at(-1),{type:'pn',id:pnPoints[0].id});
assert.match(root.table,/Passagem de nível/);
clickTab('stations');
root.querySelectorAll('[data-inspect]')[0].onclick();
assert.deepEqual(inspected.at(-1),{type:'station',id:stations[0].code,code:stations[0].code});
const unlocated=stations.find(s=>s.lat==null);
input('catalog-search',unlocated.code);
assert.match(root.table,/Sem localização verificada/);
input('catalog-search','');
let exported;
globalThis.document={createElement:()=>({click(){}})};
const previousCreate=URL.createObjectURL;
URL.createObjectURL=blob=>{exported=blob;return 'blob:test-records'};
URL.revokeObjectURL=()=>{};
root.querySelector('#catalog-export').onclick();
const csv=await exported.text();
assert.equal(csv.split('\r\n').length-1,stations.reduce((n,s)=>n+s.records.length,0),'CSV includes original SIV records from every results page');
assert.match(csv,/Fonte da localização/);
URL.createObjectURL=previousCreate;

clickTab('points');
root.querySelectorAll('[data-edit]')[0].onclick();
assert.equal(edited.at(-1).id,points[0].id);
root.querySelectorAll('[data-inspect]')[0].onclick();
assert.equal(inspected.at(-1).type,'point');
clickTab('subs');
choose('catalog-source',historical.id);
root.querySelectorAll('[data-map]')[0].onclick();
assert.equal(mapped.at(-1).catalogId,historical.id);
clickTab('sb');
root.querySelectorAll('[data-inspect]')[0].onclick();
assert.deepEqual(inspected.at(-1),{type:'sb',id:sbSegments[0].id});

mountOperationRecords({...options,focus:{type:'pdf',id:contextual.id,catalogId:historical.id}});
assert.match(root.innerHTML,/rumo-2015" selected/);
const refs=recordsForPoint([current,historical],{yard:contextual.codes[0]});
assert.ok(refs.some(r=>r.catalogId===historical.id));
assert.ok(refs.every(r=>r.catalogId&&r.sourceDate));
assert.deepEqual(recordsForPoint([current,historical],{yard:''}),[]);
console.log('Records verified: source-aware modal/map actions, historical context, PN, unlocated stations, all 818 SIV CSV rows, editing and source-aware focus.');
