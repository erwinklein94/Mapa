import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMalhaIndex,malhaForPoint} from '../src/malhas.js';

const load=name=>JSON.parse(readFileSync(new URL(`../dist/assets/${name}`,import.meta.url)));
const stations=load('rail-stations.json');
const index=createMalhaIndex(load('rail-malhas.json'));
assert.equal(stations.length,671);
assert.equal(new Set(stations.map(s=>s.code)).size,stations.length);
assert.equal(stations.reduce((count,s)=>count+s.records.length,0),818);
assert.equal(stations.filter(s=>s.lat!==null).length,617);
assert.ok(stations.every(s=>s.records.every(r=>r.page>=1&&r.page<=13&&r.sub)));
assert.ok(stations.every(s=>s.lat===null||Number.isFinite(s.lat)&&Number.isFinite(s.lng)&&Math.abs(s.lat)<=90&&Math.abs(s.lng)<=180));

const alto=stations.find(s=>s.code==='TAG');
assert.equal(alto.name,'ALTO ARAGUAIA');
assert.deepEqual(alto.records.map(r=>r.sub),['74','98']);
assert.equal(malhaForPoint(index,alto.lat,alto.lng),'RMN');
const colombia=stations.find(s=>s.code==='ZCA');
assert.equal(colombia.records[0].entry,'');
assert.equal(colombia.records[0].exit,'506,81');
console.log('PASS: 818 registros SIV, 671 siglas, 617 localizadas e SUBs/KMs preservados.');
