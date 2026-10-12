import {writeFile} from 'node:fs/promises';

const endpoint='https://geo.infrasa.gov.br/server/rest/services/Hosted/Concess%C3%B5es_ferrovi%C3%A1rias_em_Opera%C3%A7%C3%A3o/FeatureServer/13/query';
const codes=['RMN','RMO','RMP','RMS','RMC'];
const url=new URL(endpoint);
url.search=new URLSearchParams({where:`vhr_ferrov IN (${codes.map(code=>`'${code}'`).join(',')})`,outFields:'objectid,vhr_ferrov',returnGeometry:'true',outSR:'4326',f:'geojson'});

function simplify(points,tolerance=.00025){
  if(points.length<=2)return points;
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]],limit=tolerance*tolerance;
  while(stack.length){
    const [first,last]=stack.pop(),a=points[first],b=points[last];
    let farthest=-1,distance=limit;
    for(let i=first+1;i<last;i++){
      const p=points[i],dx=b[0]-a[0],dy=b[1]-a[1];
      const t=dx||dy?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))):0;
      const d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
      if(d>distance){distance=d;farthest=i}
    }
    if(farthest>=0){keep.add(farthest);stack.push([first,farthest],[farthest,last])}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i].map(v=>Number(v.toFixed(6))));
}

const response=await fetch(url);
if(!response.ok)throw Error(`Infra S.A.: HTTP ${response.status}`);
const geojson=await response.json();
if(geojson.error||geojson.properties?.exceededTransferLimit)throw Error('Consulta incompleta à Infra S.A.');
const lines=geojson.features.map(feature=>{
  const code=feature.properties.vhr_ferrov;
  if(!codes.includes(code))throw Error(`Malha inesperada: ${code}`);
  const geometry=feature.geometry;
  const paths=(geometry.type==='MultiLineString'?geometry.coordinates:[geometry.coordinates]).map(path=>simplify(path)).filter(path=>path.length>=2);
  return {code,paths};
}).filter(line=>line.paths.length);
if(lines.length<500)throw Error(`Quantidade inesperada de trechos: ${lines.length}`);
await writeFile('dist/assets/rail-malhas.json',JSON.stringify({source:'Infra S.A. / ANTT, Declaração de Rede 2024',lines}));
console.log(`Imported ${lines.length} concession sections`);
