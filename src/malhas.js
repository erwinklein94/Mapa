export const MALHAS=[
 {code:'RMN',name:'Malha Norte'},
 {code:'RMO',name:'Malha Oeste'},
 {code:'RMP',name:'Malha Paulista'},
 {code:'RMS',name:'Malha Sul'},
 {code:'RMC',name:'Malha Central'}
];

const CELL=.1;

export function createMalhaIndex(data){
 const grid=new Map();
 for(const line of data.lines){
  for(const path of line.paths){
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],segment={a,b,code:line.code};
    const minX=Math.floor(Math.min(a[0],b[0])/CELL),maxX=Math.floor(Math.max(a[0],b[0])/CELL);
    const minY=Math.floor(Math.min(a[1],b[1])/CELL),maxY=Math.floor(Math.max(a[1],b[1])/CELL);
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
     const key=`${x},${y}`;
     if(!grid.has(key))grid.set(key,[]);
     grid.get(key).push(segment);
    }
   }
  }
 }
 return grid;
}

function distanceKm(lat,lng,{a,b}){
 const scale=111.32*Math.cos(lat*Math.PI/180);
 const ax=(a[0]-lng)*scale,ay=(a[1]-lat)*111.32;
 const bx=(b[0]-lng)*scale,by=(b[1]-lat)*111.32;
 const dx=bx-ax,dy=by-ay;
 const t=dx||dy?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))):0;
 return Math.hypot(ax+t*dx,ay+t*dy);
}

// A concessão é atribuída apenas a objetos próximos ao traçado publicado.
// Pontos distantes permanecem sem malha, evitando associação por estado/cidade.
export function malhaForPoint(index,lat,lng,maxDistanceKm=2){
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return '';
 const x=Math.floor(lng/CELL),y=Math.floor(lat/CELL);
 let nearest=maxDistanceKm,code='';
 for(let i=x-1;i<=x+1;i++)for(let j=y-1;j<=y+1;j++){
  for(const segment of index.get(`${i},${j}`)||[]){
   const distance=distanceKm(lat,lng,segment);
   if(distance<nearest){nearest=distance;code=segment.code}
  }
 }
 return code;
}

export function malhaForLine(index,coordinates){
 const votes=new Map();
 for(let i=0;i<coordinates.length;i++){
  const [lng,lat]=coordinates[i],code=malhaForPoint(index,lat,lng);
  if(code)votes.set(code,(votes.get(code)||0)+1);
  if(i){
   const [prevLng,prevLat]=coordinates[i-1];
   const middle=malhaForPoint(index,(lat+prevLat)/2,(lng+prevLng)/2);
   if(middle)votes.set(middle,(votes.get(middle)||0)+1);
  }
 }
 return [...votes].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
}
