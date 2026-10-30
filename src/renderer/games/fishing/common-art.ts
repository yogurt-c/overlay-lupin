/** Small pen-and-paper fish. Visual anatomy is independent of the permanent save/size contract. */
import type { Species } from '../../../shared/fishing.js';
import { PAPER, TAU, backWash, clipped, dot, eye, finTri, flowingTail, forkTail, gill, lens, ribbon, shape, sparseScales, star, stroke } from './art-kit.js';

type Form = 'carp'|'minnow'|'loach'|'catfish'|'perch'|'flat'|'puffer'|'ribbon'|'needle'|'hatchet'|'angler'|'leaf';
type Mark = 'scales'|'stripe'|'spots'|'patch'|'bars'|'stars'|'plain';
type Profile = readonly [Form, number, Mark];
// One explicit silhouette and marking per species, in permanent catalog order (0–14).
const PROFILES: readonly (readonly Profile[])[] = [
  // 붕어, 송사리, 참붕어, 미꾸라지, 버들붕어, 납자루, 잉어, 메기, 동자개, 금붕어, 가물치, 비단잉어, 황어, 블루길, 배스
  [['carp',15,'scales'],['minnow',6,'plain'],['minnow',9,'stripe'],['loach',4,'spots'],['ribbon',12,'bars'],['leaf',13,'stripe'],['carp',13,'scales'],['catfish',10,'plain'],['catfish',9,'spots'],['ribbon',15,'plain'],['perch',9,'patch'],['carp',12,'patch'],['minnow',10,'stripe'],['perch',15,'bars'],['perch',11,'stripe']],
  // 피라미, 버들치, 모래무지, 돌고기, 갈겨니, 쉬리, 은어, 누치, 꺽지, 밀어, 미유기, 쏘가리, 뱀장어, 열목어, 산천어
  [['minnow',8,'stripe'],['minnow',7,'scales'],['minnow',9,'spots'],['minnow',10,'stripe'],['minnow',8,'bars'],['minnow',9,'stripe'],['minnow',8,'plain'],['carp',11,'scales'],['perch',11,'bars'],['perch',8,'spots'],['catfish',8,'plain'],['perch',12,'spots'],['loach',5,'plain'],['minnow',10,'spots'],['minnow',10,'bars']],
  // 멸치, 전갱이, 고등어, 학공치, 망둑어, 청어, 숭어, 쥐치, 볼락, 복섬, 놀래기, 참돔, 넙치, 감성돔, 돌돔
  [['needle',5,'stripe'],['minnow',10,'stripe'],['minnow',10,'bars'],['needle',5,'plain'],['perch',9,'spots'],['minnow',9,'scales'],['minnow',10,'stripe'],['leaf',15,'plain'],['perch',13,'spots'],['puffer',15,'spots'],['ribbon',10,'bars'],['carp',15,'spots'],['flat',14,'spots'],['carp',14,'scales'],['carp',15,'bars']],
  // Deep-water silhouettes: translucent lenses, threads, needles, feathers and broad jaws.
  [['minnow',10,'stars'],['carp',13,'spots'],['needle',5,'plain'],['needle',4,'stripe'],['ribbon',11,'plain'],['carp',12,'scales'],['perch',12,'stripe'],['perch',11,'bars'],['catfish',9,'plain'],['puffer',16,'plain'],['ribbon',10,'plain'],['angler',15,'spots'],['loach',8,'plain'],['loach',4,'stripe'],['hatchet',17,'plain']],
  // Dream fish: moon marks, ribbon tails, petal fins, lanterns and paper boats.
  [['minnow',6,'spots'],['carp',14,'patch'],['ribbon',14,'stars'],['minnow',8,'stripe'],['puffer',13,'plain'],['leaf',13,'plain'],['needle',6,'plain'],['ribbon',12,'stripe'],['carp',14,'patch'],['catfish',9,'spots'],['hatchet',12,'plain'],['carp',13,'patch'],['loach',5,'stripe'],['puffer',15,'stars'],['flat',14,'stars']],
  // Sky fish: clouds, stone, shoots, fluffy tails, fox tails and elemental markings.
  [['minnow',7,'plain'],['carp',13,'patch'],['carp',11,'scales'],['ribbon',11,'plain'],['leaf',13,'bars'],['catfish',11,'patch'],['ribbon',9,'plain'],['ribbon',10,'patch'],['puffer',15,'plain'],['carp',14,'stars'],['hatchet',14,'plain'],['perch',13,'scales'],['minnow',10,'bars'],['loach',5,'stripe'],['flat',14,'bars']]
];
const PALETTES = [
  ['#c0b27f','#eee5ca'], ['#97b49b','#e7eee0'], ['#86adbf','#e4eff1'],
  ['#9caec7','#e9edf5'], ['#b2a1cf','#f0eafa'], ['#a1bcb1','#eaf1e8']
];
const SPECIAL: Record<string, readonly [string,string]> = {
  'fish-0-4':['#bd998e','#f5e7dc'], 'fish-0-9':['#df9d69','#fff0d5'], 'fish-0-11':['#d98e7c',PAPER],
  'fish-1-5':['#cfad72','#f7eed7'], 'fish-1-11':['#b69b70','#f2e9d5'],
  'fish-2-2':['#719dad','#e5f0f3'], 'fish-2-7':['#a3b5a0','#edf1e4'], 'fish-2-11':['#d89c9d','#fae9e5'],
  'fish-4-2':['#d6b27c','#fff1dd'], 'fish-4-8':['#d9a5bc','#faedf1'],
  'fish-5-2':['#91b17c','#f0f4df'], 'fish-5-7':['#d4a078','#f6e9dc'], 'fish-5-12':['#d78c72','#f9e5da'],
  'fish-5-13':['#91bbcf','#eaf3fa'], 'fish-5-14':['#d0b86f','#f6f0d9']
};
function whiskers(c: CanvasRenderingContext2D, ink: string, x: number): void {
  stroke(c,ink,1.1,()=>{c.moveTo(x,1);c.quadraticCurveTo(x-7,-1,x-10,3);c.moveTo(x,3);c.quadraticCurveTo(x-7,8,x-8,12);c.moveTo(x+2,5);c.quadraticCurveTo(x-1,11,x+2,14);});
}

export function drawCommonFish(c: CanvasRenderingContext2D, s: Species, ink: string): void {
  const [form,h,mark] = PROFILES[s.artVariant][s.feature];
  const [accent,tint] = SPECIAL[s.id] ?? PALETTES[s.artVariant];
  const longTail = form==='ribbon' || s.id==='fish-0-11';
  let body: Path2D, ex=-19, ey=-3;
  if(form==='loach') {
    const r=ribbon(t=>[-28+t*60,Math.sin(t*5.5)*5],t=>h*(1-t*.8)+.6);
    body=new Path2D();body.moveTo(...r.top[1]);
    r.top.slice(2).forEach(([x,y])=>body.lineTo(x,y));
    r.bottom.slice(1).reverse().forEach(([x,y])=>body.lineTo(x,y));
    body.quadraticCurveTo(-33,-1,...r.top[1]);body.closePath();
    shape(c,body,ink,tint);backWash(c,body,accent,-1);
    // One continuous dorsal line, rather than a second unrelated fish-shaped loop.
    stroke(c,accent,1.5,()=>{r.top.slice(6,33).forEach(([x,y],i)=>i?c.lineTo(x,y-2):c.moveTo(x,y-2));});
    c.strokeStyle=ink;c.lineWidth=1.5;c.stroke(body);ex=-24;ey=0;
  } else {
    if(longTail) flowingTail(c,ink,18,h*.95,accent,19);
    else {const tail=forkTail(form==='puffer'?13:20,h,form==='needle'?1.5:.85);shape(c,tail,ink,accent,1.2);}
    if(form==='ribbon') {
      const fin=new Path2D();fin.moveTo(-10,-h*.7);fin.quadraticCurveTo(-7,-h-7,3,-h-6);fin.quadraticCurveTo(0,-h+1,14,-h*.45);fin.closePath();shape(c,fin,ink,accent,1.2);
      finTri(c,ink,[[-6,h*.7],[2,h+6],[13,h*.5]],accent);
    } else if(form==='perch') finTri(c,ink,[[-13,-h*.5],[-10,-h-5],[-6,-h],[-2,-h-6],[2,-h],[7,-h-3],[14,-h*.4]],accent);
    else if(form==='leaf') finTri(c,ink,[[-8,-h*.5],[-4,-h-9],[0,-h*.5]],accent);
    else if(!['puffer','flat','hatchet','loach','angler'].includes(form)) {
      const fin=new Path2D();fin.moveTo(-9,-h*.6);fin.quadraticCurveTo(-5,-h-7,1,-h-4);fin.quadraticCurveTo(6,-h-5,13,-h*.4);fin.closePath();shape(c,fin,ink,accent,1.2);
    }
    if(form==='puffer') {body=new Path2D();body.ellipse(-5,0,19,h,0,0,TAU);ex=-17;}
    else if(form==='catfish') {body=new Path2D('M -28 1 C -29 -12 -8 -13 21 -3 L 21 3 C 6 12 -19 15 -28 5 Z');ex=-21;ey=-4;}
    else if(form==='leaf') {body=new Path2D(`M -27 1 Q -19 -3 -7 -${h} Q 7 -${h+2} 21 -3 L 21 3 Q 5 ${h+3} -7 ${h} Q -19 4 -27 3 Z`);}
    else if(form==='hatchet') {body=new Path2D('M -26 -2 Q -16 -10 20 -3 L 20 3 Q 5 21 -10 17 Q -22 13 -26 -2 Z');ex=-19;ey=-2;}
    else if(form==='flat') {body=new Path2D();body.ellipse(-2,0,25,h,0,0,TAU);ex=-18;ey=-5;}
    else if(form==='angler') {body=new Path2D('M -27 2 C -28 -19 2 -19 20 -3 L 20 3 C 9 17 -20 18 -27 2 Z');ex=-18;ey=-6;}
    else body=lens(h,longTail?18:20,form==='needle'?-32:-27);
    shape(c,body,ink,tint);backWash(c,body,accent,-h*.35);
    c.strokeStyle=ink;c.lineWidth=1.5;c.stroke(body);
    if(form==='needle'&&s.id==='fish-2-3') stroke(c,ink,1,()=>{c.moveTo(-31,1);c.lineTo(-41,2);c.lineTo(-30,3);});
  }
  clipped(c,body,()=>{
    if(mark==='scales') sparseScales(c,ink,[[-6,-2],[2,0],[10,1],[-2,5]],2);
    if(mark==='spots') for(const [x,y] of [[-6,-2],[3,3],[10,-2],[14,4]]) dot(c,x,y,s.id==='fish-1-11'?1.9:1.1,accent);
    if(mark==='stripe') stroke(c,accent,2.2,()=>{c.moveTo(-12,1);c.quadraticCurveTo(2,-1,20,1);});
    if(mark==='bars') stroke(c,ink,.95,()=>{for(const x of [-5,2,9,16]){c.moveTo(x,-h*.65);c.quadraticCurveTo(x-3,-2,x+1,h*.45);}});
    if(mark==='patch') for(const [x,y] of [[-4,-5],[10,2]]) {const p=new Path2D();p.moveTo(x-4,y-4);p.bezierCurveTo(x+4,y-5,x+6,y-2,x+3,y+1);p.bezierCurveTo(x+5,y+6,x-3,y+6,x-4,y+1);p.closePath();c.fillStyle=accent;c.fill(p);}
    if(mark==='stars') for(const [x,y] of [[-3,-2],[8,3]]) star(c,x,y,1.2,accent);
  });
  if(!['loach','flat','puffer','catfish'].includes(form)) gill(c,ink,-13,h);
  if(!['loach','flat','hatchet'].includes(form)) {
    // An internal fin shares the body surface: a soft fold, without a white sticker halo.
    const fin=new Path2D('M -7 2 Q -3 4 2 2 Q 0 8 -4 7 Q -7 5 -7 2 Z');
    c.fillStyle=tint;c.fill(fin);c.strokeStyle=ink;c.lineWidth=.9;c.stroke(fin);
  }
  if(form==='catfish'||s.id==='fish-0-3') whiskers(c,ink,-28);
  if(form==='flat') {eye(c,-14,-9,ink,1.1);stroke(c,ink,.7,()=>{for(const x of [-12,-4,4,12]){const y=h*Math.sqrt(1-((x+2)/25)**2);c.moveTo(x,-y);c.lineTo(x+1,-y+3);c.moveTo(x,y);c.lineTo(x+1,y-3);}});}
  if(form==='puffer') stroke(c,ink,1,()=>{for(const a of [-2.3,-1.7,-1.1,-.5,.5,1.1,1.7]){c.moveTo(-5+Math.cos(a)*19,Math.sin(a)*h);c.lineTo(-5+Math.cos(a)*22,Math.sin(a)*(h+3));}});
  if(form==='angler') {stroke(c,ink,1.1,()=>{c.moveTo(-9,-12);c.bezierCurveTo(-13,-24,-26,-24,-28,-17);});dot(c,-28,-16,2.7,'#e7c76e');stroke(c,ink,1,()=>{c.moveTo(-27,2);c.quadraticCurveTo(-18,6,-12,3);});}
  if(s.name==='잠꾸러기어') stroke(c,ink,1.2,()=>{c.moveTo(ex-2,ey);c.quadraticCurveTo(ex,ey+3,ex+2,ey);});
  else eye(c,ex,ey,ink,form==='needle'?1.1:1.4);
  if(s.fantasy) {
    // Motifs attach to the fish rather than the same floating star on every species.
    if(/새싹|꽃잎|봉오리/.test(s.name)) {finTri(c,ink,[[-5,-h],[-12,-h-6],[-2,-h-3]],accent);finTri(c,ink,[[-2,-h],[4,-h-7],[5,-h-2]],accent);}
    else if(/달|초승/.test(s.name)) {dot(c,4,-2,3,'#e5c780');dot(c,5.5,-3,2.6,tint);}
    else if(/반딧불/.test(s.name)) for(const x of [-7,0,7]) dot(c,x,1,1.5,'#e1c366');
    else if(/종이배/.test(s.name)) finTri(c,ink,[[-8,-5],[-8,-17],[4,-5]],PAPER);
    else if(/종소리/.test(s.name)) dot(c,0,h,2,accent);
  }
}
