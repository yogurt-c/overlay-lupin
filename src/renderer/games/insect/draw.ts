import { SPECIES_BY_ID } from '../../../shared/insect.js';
import type { Species } from '../../../shared/insect.js';
import type { Viewport } from '../types.js';
import { star } from './art.js';
import { beginSketchFrame, jitter, roughLimb, roughSegment, roughStroke } from '../../lib/sketch.js';
import { drawEmoteIcon } from '../fishing/draw.js';
import { bugMotion, bugPoint, personal, netPoint, CATCH_TICKS, HIT_STUN, MISS_STUN, NET_AHEAD, SWING_TICKS } from './engine.js';
import type { Bug, Collector, InsectWorld } from './engine.js';
import { WIDTH, HEIGHT, HABITATS, TREES, CAMP, behaviorOf, location } from './map.js';
export const SEAT_INK = ['#303637', '#7a6353', '#756278', '#62747e'];
export const RARITY_INK = ['#7d857b', '#4f8a5b', '#3d74a8', '#c08416'];
const INK = '#343b38', PAPER = '#fffefa', HALO = 'rgba(255,255,255,.88)', GOLD_MARK = '#d29a1a', GOLD_GLINT = '#f0c24a';
export function fieldSize(s: Species, mm: number): number { return [18,24,30][s.size] * (.9 + .2 * (mm - s.minMm) / (s.maxMm - s.minMm)); }
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, outline = '') {
  c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fillStyle=color; c.fill(); if(outline) { c.strokeStyle=outline;c.lineWidth=1.4;c.stroke(); }
}
function line(c: CanvasRenderingContext2D, points: number[][], color: string, width = 1) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i-1], [bx, by] = points[i];
    roughSegment(c, ax, ay, bx, by, width + 1.4, HALO, 1);
    roughSegment(c, ax, ay, bx, by, width, color, 1);
  }
}
function box(c: CanvasRenderingContext2D,x:number,y:number,w:number,h:number,fill=PAPER) {
  c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,4);c.fill();
}
function label(c:CanvasRenderingContext2D,s:string,x:number,y:number,size=11,color=INK,align:CanvasTextAlign='left') {
  c.font=`${size}px Menlo, sans-serif`;c.textAlign=align;c.strokeStyle=HALO;c.lineWidth=2;c.lineJoin='round';c.strokeText(s,x,y);c.fillStyle=color;c.fillText(s,x,y);
}
function tree(c:CanvasRenderingContext2D,x:number,y:number,ghost:boolean) {
  c.save();c.globalAlpha=ghost?.22:.65;
  line(c,[[x-8,y],[x-5,y-47],[x-14,y-66]],'#737d71',1.1);
  line(c,[[x+8,y],[x+4,y-48],[x+16,y-67]],'#737d71',1.1);
  line(c,[[x-5,y-42],[x-19,y-55]],'#8f9687',.7);
  // Sparse foliage contour; leave the desktop visible through the tree.
  c.beginPath();c.moveTo(x-17,y-38);
  c.bezierCurveTo(x-53,y-39,x-51,y-68,x-35,y-72);
  c.bezierCurveTo(x-45,y-101,x-13,y-116,x-2,y-100);
  c.bezierCurveTo(x+22,y-117,x+46,y-95,x+33,y-78);
  c.bezierCurveTo(x+62,y-56,x+33,y-33,x+15,y-39);
  c.strokeStyle=HALO;c.lineWidth=3.5;c.stroke();c.strokeStyle='#8e9b83';c.lineWidth=1;c.stroke();
  line(c,[[x-21,y-80],[x-14,y-84],[x-7,y-82]],'#adb4a4',.6);
  line(c,[[x+13,y-60],[x+19,y-65],[x+25,y-63]],'#adb4a4',.6);
  c.restore();
}
function flower(c:CanvasRenderingContext2D,x:number,y:number,seed:number) {
  line(c,[[x,y+4],[x,y-6]],'#9aa38e',.7);
  oval(c,x,y-7,3,2.6,seed%3?'#e4d6a2':'#ddc5b5','#aaa18b');
}
function terrain(c:CanvasRenderingContext2D) {
  c.save();
  // A continuous, gently winding footpath ties the four clearings together.
  const path=new Path2D();path.moveTo(CAMP.x,CAMP.y);path.bezierCurveTo(650,1110,760,1200,970,1160);path.bezierCurveTo(1150,1130,1320,1170,1410,1020);path.bezierCurveTo(1530,820,1310,690,1370,530);path.bezierCurveTo(1430,360,1250,260,1070,300);path.bezierCurveTo(850,350,790,500,630,480);path.bezierCurveTo(430,455,350,640,390,800);path.bezierCurveTo(420,950,350,1050,CAMP.x,CAMP.y);
  c.globalAlpha=.12;c.strokeStyle='#a99b7e';c.lineWidth=58;c.lineCap='round';c.stroke(path);
  c.globalAlpha=.36;c.strokeStyle=HALO;c.lineWidth=34;c.stroke(path);
  c.globalAlpha=.28;c.strokeStyle='#b2a68e';c.lineWidth=1.25;c.setLineDash([3,8]);c.stroke(path);c.setLineDash([]);

  // Irregular, open-ended habitat clearings keep the desktop visible underneath.
  const clearing=(x:number,y:number,rx:number,ry:number,color:string,seed:number)=>{
    c.beginPath();for(let i=0;i<=24;i++){const a=i/24*Math.PI*2,r=1+.055*Math.sin(i*2.37+seed)+.035*Math.cos(i*4.1+seed);const px=x+Math.cos(a)*rx*r,py=y+Math.sin(a)*ry*r;if(i===0)c.moveTo(px,py);else c.lineTo(px,py);}c.closePath();
    c.globalAlpha=.075;c.fillStyle=color;c.fill();c.globalAlpha=.2;c.strokeStyle=color;c.lineWidth=1.1;c.setLineDash([2,7]);c.stroke();c.setLineDash([]);
  };
  clearing(700,890,300,205,'#b9bf87',2);clearing(470,410,270,225,'#8da98b',4);clearing(1430,430,245,210,'#8db6aa',6);clearing(1360,1080,300,225,'#c3a77d',8);

  // The pond has a recognizable shoreline, a shallow edge, and curved ripples.
  c.beginPath();c.moveTo(1695,118);c.bezierCurveTo(1780,105,1845,205,1832,310);c.bezierCurveTo(1820,390,1870,450,1820,550);c.bezierCurveTo(1778,630,1675,650,1630,580);c.bezierCurveTo(1580,510,1622,430,1603,354);c.bezierCurveTo(1582,270,1615,155,1695,118);c.closePath();
  c.globalAlpha=.16;c.fillStyle='#b7ccca';c.fill();c.globalAlpha=.62;c.strokeStyle=HALO;c.lineWidth=12;c.stroke();c.globalAlpha=.44;c.strokeStyle='#83a4a2';c.lineWidth=2;c.stroke();
  for(let i=0;i<8;i++){const x=1660+(i*53%115),y=235+(i*71%310);c.beginPath();c.ellipse(x,y,18+(i%3)*6,5,Math.sin(i)*.18,0,Math.PI*2);c.strokeStyle='#90adaa';c.globalAlpha=.5;c.lineWidth=.9;c.stroke();}
  // Reed clusters mark the bank rather than filling the water with decoration.
  for(let i=0;i<24;i++){const a=.35+i*.113,x=1720+Math.cos(a)*165,y=440+Math.sin(a)*300,h=17+(i*11%18);line(c,[[x,y],[x-2,y-h*.68],[x-8,y-h]],'#778e78',.95);line(c,[[x,y],[x+2,y-h*.82],[x+8,y-h]],'#98a688',.8);}

  // Understory marks are grouped by habitat so the clearings read at a glance.
  for(let i=0;i<84;i++){const a=i*2.399,r=35+Math.sqrt(i)*23,x=700+Math.cos(a)*r,y=890+Math.sin(a)*r*.62;flower(c,x,y,i);}
  for(let i=0;i<42;i++){const a=i*2.4,r=35+Math.sqrt(i)*25,x=1360+Math.cos(a)*r,y=1080+Math.sin(a)*r*.65;const rot=(i%2?1:-1);c.save();c.translate(x,y);c.rotate(rot*.55+(i%5)*.1);oval(c,0,0,5,2.5,i%3?'#b5a181':'#998c72','#887d69');c.restore();}
  for(let i=0;i<40;i++){const x=180+(i*347%760),y=220+(i*191%520);line(c,[[x-4,y+2],[x,y-3],[x+4,y+1]],'#85947f',.75);}
  for(let i=0;i<18;i++){const x=370+i*19,y=300+(i*47%190);oval(c,x,y,2+(i%3),1.4,'#a5ae97');}
  // A tiny shelter landmark gives the path a clear point of origin.
  line(c,[[395,1162],[449,1162]],'#8e8271',1.8);line(c,[[401,1162],[401,1174]],'#8e8271',1);line(c,[[443,1162],[443,1174]],'#8e8271',1);
  oval(c,CAMP.x,CAMP.y+25,19,6,'rgba(195,157,100,.12)','#b19b7d');
  c.restore();
}
// The net pivots in the hand: φ sweeps from raised behind the head down to the ground ahead.
const GRIP_H = 18, NET_R = Math.hypot(NET_AHEAD, GRIP_H), NET_UP = 2.05, NET_DOWN = -Math.atan2(GRIP_H, NET_AHEAD), CARRY = .1, SHOULDER = 9;
const LIFT = 7, HOLD = 3, SLAM = 4, LANDED = LIFT + HOLD + SLAM;
const easeOut = (t: number) => 1 - (1 - t) ** 3, easeIn = (t: number) => t * t * t, unit = (t: number) => Math.max(0, Math.min(1, t));
/** Pose for one collector: `u` is the net's sweep (0 raised, 1 on the ground), `side` rests it over a shoulder, plus body squash and lean. */
function netPose(p: Collector, tick: number) {
  if (p.phase === 'swing') {
    const e = SWING_TICKS - p.t;
    // Animal-Crossing timing: a slow lift onto tiptoe, a held beat, then a fast slam that lands and stays.
    if (e < LIFT) return { u: CARRY * (1 - easeOut(e / LIFT)), side: SHOULDER * (1 - easeOut(e / LIFT)), crouch: -1.5 * e / LIFT, lean: -1.5, landed: -1 };
    if (e < LIFT + HOLD) return { u: Math.sin(tick * 1.3) * .01, side: 0, crouch: -1.5, lean: -1.5, landed: -1 };
    if (e < LANDED) return { u: easeIn((e - LIFT - HOLD) / SLAM), side: 0, crouch: 1, lean: 2.5, landed: -1 };
    const k = e - LANDED; return { u: 1, side: 0, crouch: 3 * Math.exp(-k * .35), lean: 2.5, landed: k };
  }
  if (p.phase === 'stun') {
    const k = MISS_STUN - p.t, rise = unit((k - 8) / (MISS_STUN - 8));
    return { u: 1 - (1 - CARRY) * easeOut(rise), side: SHOULDER * easeOut(rise), crouch: 1.5 * (1 - rise), lean: 2 * (1 - rise), landed: k + SWING_TICKS - LANDED };
  }
  if (p.phase === 'hit') {
    // Bonked: the body squashes, wobbles side to side and the net droops until the daze wears off.
    const k = HIT_STUN - p.t, decay = Math.exp(-k * .07);
    return { u: .6 + Math.sin(k * .5) * .08 * decay, side: SHOULDER * .5, crouch: 4 * decay + .8, lean: Math.sin(k * .9) * 3 * decay, landed: -1 };
  }
  if (p.phase === 'catch') {
    // Hold the net down a beat, then raise the catch proudly overhead.
    const k = CATCH_TICKS - p.t, raise = easeOut(unit((k - 10) / 12));
    return { u: 1 - raise * (1 - (NET_UP - Math.PI / 2) / (NET_UP - NET_DOWN)), side: 0, crouch: raise ? -1.5 - Math.abs(Math.sin(k * .3)) * raise : 2, lean: 0, landed: k + SWING_TICKS - LANDED, held: raise };
  }
  return { u: CARRY + (p.move || p.moveY ? Math.sin(tick * .22) * .025 : 0), side: SHOULDER, crouch: 0, lean: 0, landed: -1 };
}
function netAt(x: number, y: number, angle: number, u: number, side = 0) {
  const phi = NET_UP + (NET_DOWN - NET_UP) * u, ahead = NET_R * Math.cos(phi), h = GRIP_H + NET_R * Math.sin(phi);
  return { x: x + Math.cos(angle) * ahead - Math.sin(angle) * side, y: y + Math.sin(angle) * ahead + Math.cos(angle) * side * .5 - h, h, phi };
}
function hoop(c: CanvasRenderingContext2D, x: number, y: number, phi: number, color: string, squash: number, bug: boolean, tick: number) {
  const rx = 9.5 * squash, ry = 4.5 + 3.5 * Math.max(0, Math.sin(phi)), bag = phi > -.2 ? 7 * Math.max(0, Math.sin(phi + .4)) : 0;
  // A soft mesh bag hangs under the hoop once it leaves the ground.
  if (bag > 1) { c.beginPath(); c.moveTo(x - rx, y); c.quadraticCurveTo(x - 2, y + ry + bag * 1.6, x + rx, y); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill(); c.strokeStyle = 'rgba(132,121,105,.55)'; c.lineWidth = .8; c.stroke(); }
  if (bug) oval(c, x + Math.sin(tick * .9) * 2, y + (bag > 1 ? ry + bag * .6 : 0), 1.8, 1.8, '#171918');
  c.beginPath(); c.ellipse(x, y, rx + 1, ry + 1, 0, 0, Math.PI * 2); c.strokeStyle = HALO; c.lineWidth = 2.4; c.stroke();
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill(); c.strokeStyle = color; c.lineWidth = 1.2; c.stroke();
}
function face(c: CanvasRenderingContext2D, x: number, y: number, r: number, facing: number, view: number, color: string) {
  c.beginPath(); c.arc(x, y, r + 1.2, 0, Math.PI * 2); c.fillStyle = HALO; c.fill();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill();
  for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(x + jitter(.8), y + jitter(.8), r, 0, Math.PI * 2); c.strokeStyle = color; c.lineWidth = 1.6; c.stroke(); }
  if (view < -.6) return; // walking away: the back of the head has no face
  // Same face as the sword-fight figures: eyes drift toward where the collector looks.
  const side = Math.min(1, Math.abs(Math.cos(Math.atan2(view, facing)))), shift = facing * side * r * .2, eyes = [x + shift - r * .32 * (1 - side * .3), x + shift + r * .32 * (1 - side * .3)];
  c.fillStyle = color; for (const ex of eyes) { c.beginPath(); c.arc(ex, y - r * .05, 1.1, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(214,128,118,.28)'; for (const ex of eyes) { c.beginPath(); c.ellipse(ex + (ex < x + shift ? -1.6 : 1.6), y + r * .32, 1.6, 1, 0, 0, Math.PI * 2); c.fill(); }
  roughSegment(c, x + shift - 1.2, y + r * .4, x + shift + 1.2, y + r * .4, 1, color, 1);
}
function collector(c:CanvasRenderingContext2D,p:Collector,tick:number,local:boolean) {
  const {x,y}=p,color=SEAT_INK[p.seat],walking=(p.move||p.moveY)&&!p.paused&&(p.phase==='free'||p.phase==='result');
  const facing=Math.cos(p.angle)<-.2?-1:1,view=Math.sin(p.angle),stride=walking?Math.sin(tick*.24):0,bob=walking?Math.abs(stride)*1.3:Math.sin(tick*.05)*.4;
  const pose=netPose(p,tick),striking=p.phase!=='free'&&p.phase!=='result'&&p.phase!=='hit';
  const base={x,y},net=netAt(base.x,base.y,p.angle,pose.u,pose.side),lean=pose.lean*Math.cos(p.angle),leanY=pose.lean*Math.sin(p.angle)*.5;
  const hip=y-11+pose.crouch-bob,chest=y-21+pose.crouch*1.2-bob,head=y-30+pose.crouch*1.3-bob;
  oval(c,x,y+1,9,3,'rgba(20,24,26,.09)');
  // The net sits behind the body while it is raised behind the head or the collector faces away.
  const behind=view<-.3?pose.u>.15:pose.u<.15;
  const grip={x:x+Math.cos(p.angle)*4+lean,y:y-GRIP_H+pose.crouch+Math.sin(p.angle)*4-bob};
  const drawNet=()=>{
    const d=Math.hypot(net.x-grip.x,net.y-grip.y)||1,ux=(net.x-grip.x)/d,uy=(net.y-grip.y)/d;
    // A faint smear trails the slam so the fast arc still reads at 60fps.
    if(p.phase==='swing'&&pose.u>.05&&pose.u<1&&SWING_TICKS-p.t>=LIFT+HOLD){c.save();c.globalAlpha=.16;c.beginPath();for(let k=0;k<=8;k++){const q=netAt(base.x,base.y,p.angle,pose.u*k/8*.9);k?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);}c.strokeStyle=color;c.lineWidth=5;c.lineCap='round';c.stroke();c.restore();}
    line(c,[[grip.x-ux*5,grip.y-uy*5],[net.x-ux*9,net.y-uy*9]],'#847969',1.1);
    const squash=pose.landed>=0&&pose.landed<8?1+.16*Math.exp(-pose.landed*.5)*Math.cos(pose.landed*1.2):1;
    hoop(c,net.x,net.y,net.phi,color,squash,p.phase==='catch',tick);
  };
  if(behind)drawNet();
  // Chibi proportions borrowed from the sword-fight figures: a big round head on a short stick body.
  const step=4*Math.abs(Math.cos(p.angle)),spread=3+1.5*Math.abs(view);
  for(const s of [-1,1]){const fx=x+s*spread+(walking?s*stride*step*facing:0),fy=y-(walking?Math.max(0,s*stride)*2.2:0);roughLimb(c,x+s*1.2+lean*.4,hip,(x+fx)/2+s,(hip+fy)/2,fx,fy,1.7,color,HALO);}
  roughStroke(c,x+lean,chest+leanY,x,hip,2.1,color,HALO);
  const swingArm=walking?-stride*3*facing:0;
  roughLimb(c,x+lean,chest+leanY+1,(x+lean+grip.x)/2+1,chest+4,grip.x,grip.y,1.5,color,HALO);
  if(!striking)roughLimb(c,x+lean,chest+leanY+1,x-facing*4+swingArm,chest+5,x-facing*3+swingArm,chest+9,1.5,color,HALO);
  else roughLimb(c,x+lean,chest+leanY+1,(x+lean+grip.x)/2,chest+6,grip.x+(net.x-grip.x)*.18,grip.y+(net.y-grip.y)*.18,1.5,color,HALO);
  face(c,x+lean*1.2,head+leanY,8.5,facing,view,color);
  if(!behind)drawNet();
  const n=netPoint({...base,angle:p.angle});
  // Landing feedback: a ring of the reach and a few dust puffs where the hoop hits the grass.
  if(p.phase==='swing'&&pose.landed>=0){const k=pose.landed/(SWING_TICKS-LANDED);c.save();
    if(p.t<=3){c.beginPath();c.arc(n.x,n.y,46,0,Math.PI*2);c.setLineDash([2,5]);c.strokeStyle='#606b58';c.globalAlpha=.4;c.lineWidth=.7;c.stroke();c.setLineDash([]);}
    for(let i=0;i<5;i++){const a=Math.PI*(1.05+i*.22),r=8+k*14;c.globalAlpha=.32*(1-k);oval(c,n.x+Math.cos(a)*r*1.3,n.y+Math.sin(a)*r*.45+3,2.4*(1-k*.6),1.6*(1-k*.6),'#c5baa4');}
    c.restore();}
  if(p.phase==='hit'){const k=HIT_STUN-p.t,hx=x+lean*1.2,hy=head+leanY;c.save();
    // A short impact burst, then little stars circling the dazed head.
    if(k<8){c.globalAlpha=1-k/8;for(let i=0;i<6;i++){const a=i*Math.PI/3+.3,r0=11+k*.8;line(c,[[hx+Math.cos(a)*r0,hy+Math.sin(a)*r0],[hx+Math.cos(a)*(r0+5),hy+Math.sin(a)*(r0+5)]],color,1.2);}}
    c.globalAlpha=Math.min(1,p.t/10);for(let i=0;i<3;i++){const a=k*.18+i*Math.PI*2/3;star(c,hx+Math.cos(a)*11,hy-12+Math.sin(a)*3.5,1.8,'#c9a64a');}
    c.restore();}
  if(p.phase==='catch'&&pose.held&&pose.held>.9&&tick%24<16)star(c,net.x+11,net.y-8,2,'#82785e');
  if(local)line(c,[[x-5,y+6],[x+5,y+6]],color,1);
  else label(c,p.name.slice(0,6),x,y+16,9,color,'center');
  if(p.emojiUntil>tick){c.save();c.translate(x,y-62);c.scale(.75,.75);drawEmoteIcon(c,p.emoji,tick%120,color);c.restore();}
  const caught=p.showUntil>tick?p.shown:p.caughtUntil>tick?p.caught:undefined;
  if(caught){const s=SPECIES_BY_ID.get(caught.speciesId)!;oval(c,x,y-66,3,3,'#171918');label(c,s.name,x,y-78,9,color,'center');}
}
/** The escape offset as drawn, eased toward the authoritative one so a startled bug visibly flies off instead of teleporting. */
const shownBugs=new Map<number,{ox:number;oy:number;heading:number;seen:number}>();
function insect(c:CanvasRenderingContext2D,b:Bug,p:Collector,tick:number) {
  const state=personal(b,p.id);if(!state||state.escaped)return;
  const species=SPECIES_BY_ID.get(b.speciesId)!,q=bugPoint(b,p.id),m=bugMotion(b,tick),prev=bugMotion(b,tick-3),behavior=behaviorOf(species);
  // Replaying the shared path keeps the mark on its hit point; only the offset from it is smoothed.
  const ox=q.x-m.x,oy=q.y-m.y;let s=shownBugs.get(b.id);if(!s||Math.hypot(ox-s.ox,oy-s.oy)>260)s={ox,oy,heading:0,seen:tick};
  const fleeX=ox-s.ox,fleeY=oy-s.oy,flee=Math.hypot(fleeX,fleeY);
  s.ox+=fleeX*.18;s.oy+=fleeY*.18;s.seen=tick;
  const vx=m.x-prev.x+fleeX*.3,vy=m.y-prev.y+fleeY*.3;if(Math.hypot(vx,vy)>.4)s.heading=Math.atan2(vy,vx);
  shownBugs.set(b.id,s);
  // A wary bug trembles before it bolts; a fleeing one rises over its shadow.
  const twitch=state.alert>35?Math.sin(tick*1.9+b.seed)*state.alert/100*1.1:0;
  const lift=state.caught?0:m.lift+Math.min(24,flee*.45),x=m.x+s.ox+twitch,y=m.y+s.oy;
  c.save();if(state.caught)c.globalAlpha=.16;
  oval(c,x,y+1,3.2*(1-Math.min(.5,lift/50)),1.2,'rgba(23,25,24,.14)');
  const by=y-lift,flier=behavior==='flower'||behavior==='patrol';
  // 전설 and golden insects give themselves away a little: a slow breathing ring under the mark.
  const legend=species.rarity===3,special=(legend||b.golden)&&!state.caught;
  if(special){const pulse=.5+.5*Math.sin(tick*.07+b.seed);c.save();c.globalAlpha=.22+.38*pulse;
    c.beginPath();c.ellipse(x,by,7+pulse*2.5,5.5+pulse*2,0,0,Math.PI*2);c.strokeStyle=HALO;c.lineWidth=2.6;c.stroke();c.strokeStyle=legend?RARITY_INK[3]:GOLD_MARK;c.lineWidth=1.1;c.stroke();c.restore();}
  c.save();c.translate(x,by);c.rotate(s.heading);
  if(flier&&lift>2){
    // Butterflies beat slowly; a dragonfly's wings stay a faint blur.
    const flap=behavior==='patrol'?.7+.3*Math.abs(Math.sin(tick*2.1)):.25+.75*Math.abs(Math.sin(tick*.5+b.seed));
    c.fillStyle='rgba(126,134,124,.42)';for(const side of [-1,1]){c.beginPath();c.ellipse(-.5,side*(1.6+1.6*flap),1.4,1.2+1.8*flap,0,0,Math.PI*2);c.fill();}
  }
  // The fine white rim keeps the same black bug mark readable over dark windows.
  c.beginPath();c.ellipse(0,0,3.6,2.9,0,0,Math.PI*2);c.fillStyle=PAPER;c.fill();
  c.beginPath();c.ellipse(0,0,2.7,2,0,0,Math.PI*2);c.fillStyle=b.golden&&!state.caught?GOLD_MARK:'#171918';c.fill();
  c.restore();
  // Species stay unreadable in the field; a golden body glints and a 전설 sheds an occasional sparkle.
  if(special&&b.golden&&(tick+b.seed)%40<12)star(c,x+4,by-5,1.4+Math.sin((tick+b.seed)%40/12*Math.PI)*1.2,GOLD_GLINT);
  if(special&&legend&&(tick+b.seed*3)%70<10)star(c,x-5,by-6,1.6,RARITY_INK[3]);
  c.restore();
}
export interface FieldView { cameraX:number;cameraY:number;zoom:number;previewX?:number;previewY?:number;angle?:number;mapOpen:boolean;hideEmotes:boolean;solo:boolean;known:number;gold:number }
export function drawMap(c:CanvasRenderingContext2D,w:InsectWorld,id:string,x:number,y:number,width:number,height:number,full=false) {
  box(c,x,y,width,height,'#fffaf0ef');c.save();c.beginPath();c.rect(x+8,y+8,width-16,height-16);c.clip();
  const sx=(width-16)/WIDTH,sy=(height-16)/HEIGHT;c.translate(x+8,y+8);c.scale(sx,sy);
  c.fillStyle='#fffefa';c.fillRect(0,0,WIDTH,HEIGHT);terrain(c);
  for(const t of TREES){oval(c,t.x,t.y-75,39,25,'rgba(119,146,115,.14)','#8c9c84');line(c,[[t.x,t.y-40],[t.x,t.y]],'#887f6c',1.2);}
  c.restore();
  if(full)for(const h of HABITATS)label(c,h.name,x+8+h.x*sx,y+8+h.y*sy-18,13,INK,'center');
  for(const p of w.players){const px=x+8+p.x*sx,py=y+8+p.y*sy;oval(c,px,py,p.id===id?5:4,p.id===id?5:4,SEAT_INK[p.seat],PAPER);if(full)label(c,p.id===id?'나':p.name.slice(0,6),px,py+18,12,INK,'center');if(p.pingUntil>w.tick){const a=x+8+p.pingX*sx,b=y+8+p.pingY*sy;star(c,a,b,7,SEAT_INK[p.seat]);}}
}
export function drawInsectField(c:CanvasRenderingContext2D,v:Viewport,w:InsectWorld,id:string,o:FieldView):void {
  c.setTransform(v.pixelRatio,0,0,v.pixelRatio,0,0);c.clearRect(0,0,v.width,v.height);beginSketchFrame();
  const scale=Math.min(v.width/640,v.height/480);c.save();c.translate((v.width-640*scale)/2,(v.height-480*scale)/2);c.scale(scale,scale);
  const me=w.players.find(p=>p.id===id),p=me?{...me,x:o.previewX??me.x,y:o.previewY??me.y,angle:o.angle??me.angle}:undefined;
  c.save();c.beginPath();c.roundRect(0,34,640,410,16);c.clip();c.translate(320,240);c.scale(o.zoom,o.zoom);c.translate(-o.cameraX,-o.cameraY);
  terrain(c);
  if(p){
    const sprites:{y:number;draw:()=>void}[]=[];
    for(const t of TREES)sprites.push({y:t.y,draw:()=>tree(c,t.x,t.y,Math.abs(p.x-t.x)<70&&p.y<t.y&&p.y>t.y-130 || w.bugs.some(b=>{const q=bugPoint(b,id);return Math.abs(q.x-t.x)<55&&q.y<t.y&&q.y>t.y-110&&Math.hypot(q.x-p.x,q.y-p.y)<180;}))});
    for(const b of w.bugs){const q=bugPoint(b,id);if(Math.abs(q.x-o.cameraX)<400&&Math.abs(q.y-o.cameraY)<300)sprites.push({y:q.y,draw:()=>insect(c,b,p,w.tick)});}
    for(const other of w.players){const q=other.id===id?p:other;sprites.push({y:q.y,draw:()=>collector(c,o.hideEmotes&&q.id!==id?{...q,emojiUntil:0}:q,w.tick,q.id===id)});}
    sprites.sort((a,b)=>a.y-b.y).forEach(s=>s.draw());
    for(const [id,s] of shownBugs)if(w.tick-s.seen>120||s.seen>w.tick)shownBugs.delete(id);

    for(const q of w.players)if(q.pingUntil>w.tick){star(c,q.pingX,q.pingY-25,10,SEAT_INK[q.seat]);label(c,`${q.name.slice(0,6)}의 발견`,q.pingX,q.pingY-43,12,INK,'center');}
  }
  c.restore();
  if(p){
    const h=HABITATS[location(p.x,p.y)];
    label(c,`${h.name} · ${o.known}/30`,18,54,10,'#727c70');
    const notice=p.noticeUntil>w.tick?p.notice:p.phase==='result'?'저장 중…':'';
    if(notice)label(c,notice,320,423,11,INK,'center');
    for(const q of w.players)if(q.id!==id&&(Math.abs(q.x-o.cameraX)>280/o.zoom||Math.abs(q.y-o.cameraY)>165/o.zoom)){
      const a=Math.atan2(q.y-o.cameraY,q.x-o.cameraX),x=320+Math.cos(a)*275,y=235+Math.sin(a)*150;
      label(c,`${['→','↘','↓','↙','←','↖','↑','↗'][(Math.round(a/(Math.PI/4))+8)%8]} ${q.name.slice(0,3)}`,x,y,9,SEAT_INK[q.seat],'center');
    }
  }
  // Navigation stays available on M; no permanent map or opaque HUD plates.
  // Like the fishing pier, the shortcuts stay on screen; the walking hint gives way after the first few seconds.
  label(c,w.tick<480?'WASD 걷기 · Space 내려찍기 · M 지도 · C 수집함':'E 감정표현 · C 수집함 · M 지도',320,456,10,'#7b8377','center');
  if(o.mapOpen){box(c,26,48,588,386,'#fffaf0');label(c,'숲 지도',48,78,22);label(c,'클릭해서 친구에게 발견 위치 알리기 · M / Esc 닫기',48,101,12);drawMap(c,w,id,40,114,560,295,true);}
  c.restore();
}
