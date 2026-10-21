import type { Species } from '../../../shared/fishing.js';
import { SPECIES_BY_ID } from '../../../shared/fishing.js';
import { beginSketchFrame, jitter, roughLimb, roughStroke } from '../../lib/sketch.js';
import type { Viewport } from '../types.js';
import { WIDTHS, CAST_SECONDS, EMOTE_TICKS } from './engine.js';
import type { FishingWorld, Fisher } from './engine.js';
const INK = '#14181a', BROWN = '#7a5433', HALO = 'rgba(255,255,255,.94)';
export const EMOTES = ['안녕','좋아요','하트','놀람','축하','아쉬움'];
function line(c: CanvasRenderingContext2D, x: number,y: number,a: number,b: number, color = INK, w = 1.2): void { roughStroke(c,x,y,a,b,w,color,HALO); }
function label(c: CanvasRenderingContext2D, text: string, x: number,y: number, size=9,color=INK): void {
  c.font = `${size}px Menlo, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = HALO; c.strokeText(text,x,y); c.fillStyle = color; c.fillText(text,x,y);
}
/** Data-driven silhouettes: body family, proportions, fins, tail, markings and fantasy appendages. */
export function drawFish(c: CanvasRenderingContext2D, s: Species, x: number,y: number, size: number, ink = INK): void {
  c.save(); c.translate(x,y); c.scale(size/60,size/60); c.lineJoin = c.lineCap = 'round';
  const f = s.feature, h = s.shape === 'eel' ? 5 : s.shape === 'slim' ? 9 : s.shape === 'flat' ? 17 : 14 + f%4;
  const body = new Path2D();
  if (s.shape === 'eel') {
    body.moveTo(-24,0); body.bezierCurveTo(-20,-18,8,13,23,-9); body.bezierCurveTo(36,-27,38,5,23,9); body.bezierCurveTo(5,23,-20,0,-24,7); body.closePath();
  } else {
    body.moveTo(-27,0); body.quadraticCurveTo(-10,-h*1.5,16,-h*.35);
    body.lineTo(29,-h*(.6+f%3*.12)); body.lineTo(26,0); body.lineTo(29,h*(.6+f%3*.12)); body.lineTo(16,h*.4);
    body.quadraticCurveTo(-10,h*1.5,-27,0); body.closePath();
  }
  c.strokeStyle=HALO; c.lineWidth=5; c.stroke(body); c.fillStyle='#fffefa'; c.fill(body); c.strokeStyle=ink; c.lineWidth=1.5; c.stroke(body);
  c.beginPath(); c.arc(-16,s.shape==='eel'?0:-2,1.3,0,Math.PI*2); c.fillStyle=ink; c.fill();
  c.beginPath(); c.moveTo(-8,-h*.45); c.quadraticCurveTo(-4,0,-8,h*.45); c.stroke();
  if (s.shape !== 'eel') {
    c.beginPath(); c.moveTo(-5,-h*.8); c.lineTo(f%2?4:-2,-h-5-s.artVariant); c.lineTo(12,-h*.6); c.stroke();
    c.beginPath(); c.moveTo(2,1); c.lineTo(7,5+f%4); c.lineTo(10,1); c.stroke();
  }
  // Species-specific marks remain visible without color.
  for (let i=0;i<1+f%4;i++) {
    const mx=-1+i*4;
    c.beginPath();
    if (f%3===0) { c.moveTo(mx,-h*.45); c.lineTo(mx-2,h*.4); c.stroke(); }
    else { c.arc(mx,(i%2?1:-1)*h*.3,.7+s.artVariant*.08,0,Math.PI*2); c.fill(); }
  }
  if (s.shape==='puffer') for (let i=0;i<5;i++) { const a=Math.PI*(.3+i*.33); c.beginPath(); c.moveTo(Math.cos(a)*16,Math.sin(a)*h); c.lineTo(Math.cos(a)*20,Math.sin(a)*(h+4)); c.stroke(); }
  if (s.shape==='angler') { c.beginPath(); c.moveTo(-7,-h); c.quadraticCurveTo(-7,-h-15,-21,-h-7); c.stroke(); c.beginPath(); c.arc(-21,-h-6,2,0,Math.PI*2); c.stroke(); }
  if (s.shape==='dragon') {
    c.beginPath(); c.moveTo(-12,-h*.6); c.lineTo(-13,-h-8); c.lineTo(-6,-h*.7);
    c.moveTo(-24,3); c.bezierCurveTo(-37,14,-22,20,-15,12); c.moveTo(-22,5); c.bezierCurveTo(-30,19,-16,26,-4,13); c.stroke();
  }
  if (s.fantasy) { c.beginPath(); const a=10,b=-h-7; c.moveTo(a,b-3); c.lineTo(a+1,b-1); c.lineTo(a+4,b); c.lineTo(a+1,b+1); c.lineTo(a,b+4); c.lineTo(a-1,b+1); c.lineTo(a-4,b); c.lineTo(a-1,b-1); c.closePath(); c.stroke(); }
  c.restore();
}
type Face = 'calm'|'focus'|'wow'|'strain'|'joy'|'sad';
/** The angler's face echoes the emote while it is not busy fighting a fish. */
const EMOTE_FACES: Face[] = ['joy','joy','joy','wow','joy','sad'];
/** One held keyframe, hip-space (+x toward the water). Poses snap between keys like the fencers instead of tweening. */
interface Pose { lean: number; crouch: number; rod: number; bend: number; grip: [number,number]; face: Face; arc?: boolean }
const HAT = '#ecdcbf', ROD = 30, FLOAT_DX = 28, WATER_Y = 165, RED = '#c4473a', BLUSH = 'rgba(232,120,110,.5)';
const IDLE: Pose = { lean:0, crouch:0, rod:-.72, bend:1, grip:[7,-8], face:'calm' };
/** Anticipation crouch → wind-up over the shoulder → snap with a swing trail → whip → settle. */
const CAST_KEYS: [number,Pose][] = [
  [.12, { lean:1, crouch:2, rod:-.95, bend:0, grip:[6,-7], face:'focus' }],
  [.38, { lean:-3, crouch:-1, rod:-2.4, bend:-2, grip:[0,-17], face:'focus' }],
  [.5, { lean:5, crouch:1, rod:-.12, bend:3, grip:[11,-10], face:'wow', arc:true }],
  [.62, { lean:3, crouch:0, rod:-.5, bend:-3, grip:[9,-9], face:'calm' }],
  [1.01, { lean:1, crouch:0, rod:-.62, bend:1, grip:[8,-8], face:'calm' }]
];
const SNAP_AT = .38, LAND_AT = .8;
function poseOf(p: Fisher, tick: number): Pose {
  const beat = Math.floor(tick/5)%2;
  switch (p.phase) {
    case 'casting': { const t = p.time/CAST_SECONDS; return (CAST_KEYS.find(([end]) => t < end) ?? CAST_KEYS[CAST_KEYS.length-1])[1]; }
    case 'waiting': return { ...IDLE, rod:-.62 };
    case 'bite': return beat ? { lean:1, crouch:1, rod:-.5, bend:6, grip:[8,-8], face:'wow' } : { lean:0, crouch:0, rod:-.62, bend:3, grip:[8,-8], face:'wow' };
    case 'fight': {
      // Heaving back while held, giving line otherwise; the 4-tick shake keeps it jerky on purpose.
      const shake = Math.floor(tick/4)%2 ? 1 : -1;
      return p.held ? { lean:-4+shake, crouch:-1, rod:-1.25, bend:9, grip:[4,-13], face:'strain' } : { lean:-1+shake*.5, crouch:0, rod:-.95, bend:6, grip:[7,-10], face:'focus' };
    }
    case 'result': return { lean:-1, crouch:-2, rod:-1.05, bend:5, grip:[8,-15], face:'joy' };
    default: return IDLE;
  }
}
function rodGeometry(pose: Pose): { butt:[number,number]; mid:[number,number]; tip:[number,number] } {
  const dx = Math.cos(pose.rod), dy = Math.sin(pose.rod), nx = -dy, ny = dx, [gx,gy] = pose.grip;
  // A positive bend sags the tip toward the water, a negative one is the rod whipping back.
  return { butt:[gx-dx*7,gy-dy*7], mid:[gx+dx*ROD*.5+nx*pose.bend*.35,gy+dy*ROD*.5+ny*pose.bend*.35], tip:[gx+dx*ROD+nx*pose.bend,gy+dy*ROD+ny*pose.bend] };
}
function drawFace(c: CanvasRenderingContext2D, hx: number, hy: number, r: number, face: Face, ink: string, blink: boolean): void {
  const ex = [hx+r*.12, hx+r*.58], ey = hy+r*.05;
  c.fillStyle = BLUSH; for (const bx of [hx-r*.2, hx+r*.82]) { c.beginPath(); c.ellipse(bx,hy+r*.42,2,1.2,0,0,Math.PI*2); c.fill(); }
  c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 1.1;
  for (const x of ex) {
    c.beginPath();
    if (face === 'joy') { c.arc(x,ey+.8,1.6,Math.PI*1.1,Math.PI*1.9); c.stroke(); }
    else if (face === 'strain') { const d = x === ex[0] ? 1 : -1; c.moveTo(x-1.4*d,ey-1.3); c.lineTo(x+1.2*d,ey); c.lineTo(x-1.4*d,ey+1.3); c.stroke(); }
    else if (face === 'sad') { c.moveTo(x-1.4,ey-.2); c.lineTo(x+1.4,ey+.6); c.stroke(); }
    else if (blink && face === 'calm') { c.moveTo(x-1.3,ey); c.lineTo(x+1.3,ey); c.stroke(); }
    else { c.arc(x,ey,face === 'wow' ? 1.6 : 1.2,0,Math.PI*2); c.fill(); if (face === 'wow') { c.fillStyle = '#fffefa'; c.beginPath(); c.arc(x+.5,ey-.5,.5,0,Math.PI*2); c.fill(); c.fillStyle = ink; } }
  }
  const mx = hx+r*.38, my = hy+r*.5;
  c.beginPath();
  if (face === 'wow') c.arc(mx,my+.6,1.3,0,Math.PI*2);
  else if (face === 'joy') { c.arc(mx,my-.6,2.2,.15*Math.PI,.85*Math.PI); c.closePath(); c.fill(); }
  else if (face === 'sad') c.arc(mx,my+1.2,1.6,1.2*Math.PI,1.8*Math.PI);
  else if (face === 'strain') { c.moveTo(mx-2,my+.5); c.lineTo(mx-.7,my-.6); c.lineTo(mx+.7,my+.5); c.lineTo(mx+2,my-.6); }
  else c.arc(mx,my-1.4,1.6,.2*Math.PI,.8*Math.PI);
  c.stroke();
}
function drawHeadAndHat(c: CanvasRenderingContext2D, hx: number, hy: number, face: Face, ink: string, blink: boolean): void {
  const r = 9.5;
  c.beginPath(); c.arc(hx,hy,r+2,0,Math.PI*2); c.fillStyle = HALO; c.fill();
  c.beginPath(); c.arc(hx,hy,r,0,Math.PI*2); c.fillStyle = '#fffefa'; c.fill();
  for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(hx+jitter(1.1),hy+jitter(1.1),r,0,Math.PI*2); c.strokeStyle = ink; c.lineWidth = 2; c.stroke(); }
  drawFace(c,hx,hy,r,face,ink,blink);
  // Straw bucket hat tipped toward the water: a tall dome, red band and a brim that pokes out front.
  c.save(); c.translate(hx,hy-r*.62); c.rotate(.1);
  const crown = new Path2D(); crown.moveTo(-r*.8,.5); crown.bezierCurveTo(-r*.82,-r*1.25,r*.82,-r*1.25,r*.8,.5); crown.closePath();
  c.lineWidth = 4.5; c.strokeStyle = HALO; c.stroke(crown); c.fillStyle = HAT; c.fill(crown);
  c.beginPath(); c.rect(-r*.8,-r*.55,r*1.6,r*.3); c.fillStyle = RED; c.fill();
  c.lineWidth = 1.8; c.strokeStyle = ink; c.stroke(crown);
  roughStroke(c,-r*1.15,.6,r*1.4,-.2,2,ink,HALO);
  c.restore();
}
/** Chibi angler sitting on the dock edge, drawn in the fencers' thick-ink style. Hip sits at (x, 110). */
function person(c: CanvasRenderingContext2D,p: Fisher,x:number, tick:number, local:boolean, hideEmotes:boolean): void {
  const ink=local?INK:BROWN, y=110, emoting=!hideEmotes&&p.emojiUntil>tick, base=poseOf(p,tick);
  const pose=emoting&&!['bite','fight'].includes(p.phase)?{...base,face:EMOTE_FACES[p.emoji]??base.face}:base, {butt,mid,tip}=rodGeometry(pose);
  const dx=Math.cos(pose.rod), dy=Math.sin(pose.rod), shoulderX=pose.lean*.6+2, shoulderY=-9+pose.crouch*.6;
  c.save(); c.translate(x,y); c.lineCap=c.lineJoin='round';
  // Thighs rest on the planks and the shins dangle, kicking in a two-step beat rather than a smooth swing.
  const kick=['waiting','idle'].includes(p.phase)?(Math.floor((tick+p.seat*17)/22)%2?2.5:-1.5):0;
  roughLimb(c,-1,3,8,5,9+kick,16,2.5,ink,HALO); roughLimb(c,3,3,11,4.5,12-kick*.6,15,2.5,ink,HALO);
  const body=new Path2D(); body.ellipse(pose.lean*.5,-5+pose.crouch*.5,6.8,8.5,pose.lean*.05,0,Math.PI*2);
  c.lineWidth=5; c.strokeStyle=HALO; c.stroke(body); c.fillStyle='#fffefa'; c.fill(body); c.lineWidth=2.2; c.strokeStyle=ink; c.stroke(body);
  roughLimb(c,shoulderX,shoulderY,(shoulderX+butt[0])/2,(shoulderY+butt[1])/2+3,pose.grip[0]-dx*6,pose.grip[1]-dy*6,2.2,ink,HALO);
  if (pose.arc) {
    c.save(); c.globalAlpha=.22; c.strokeStyle=ink; c.lineWidth=3.2; c.beginPath(); c.arc(pose.grip[0],pose.grip[1],ROD*.92,-2.4,-.18); c.stroke();
    c.globalAlpha=.1; c.lineWidth=7; c.beginPath(); c.arc(pose.grip[0],pose.grip[1],ROD*.8,-2.3,-.25); c.stroke(); c.restore();
  }
  roughStroke(c,butt[0],butt[1],mid[0],mid[1],2,ink,HALO); roughStroke(c,mid[0],mid[1],tip[0],tip[1],1.2,ink,HALO);
  c.beginPath(); c.arc(pose.grip[0]-dx*3.5-dy*2.5,pose.grip[1]-dy*3.5+dx*2.5,1.9,0,Math.PI*2); c.fillStyle='#fffefa'; c.fill(); c.strokeStyle=ink; c.lineWidth=1.1; c.stroke();
  roughLimb(c,shoulderX,shoulderY,(shoulderX+pose.grip[0])/2+1,(shoulderY+pose.grip[1])/2+3,pose.grip[0],pose.grip[1],2.2,ink,HALO);
  const blink=tick%190<6;
  drawHeadAndHat(c,pose.lean*1.1+1,-21+pose.crouch,pose.face,ink,blink);
  c.restore();
  const tx=x+tip[0], ty=y+tip[1];
  if(p.phase==='casting') drawFlight(c,p.time/CAST_SECONDS,tx,ty,x,ink);
  else if(['waiting','bite','fight'].includes(p.phase)){
    const fight=p.phase==='fight', beat=Math.floor(tick/5)%2;
    const fx=x+FLOAT_DX+(fight?(p.target-.5)*12:0), fy=WATER_Y+(p.phase==='bite'?(beat?6:2):fight?4:Math.floor(tick/24+p.seat)%2);
    slackLine(c,tx,ty,fx,fy,fight?0:6,ink);
    c.beginPath(); c.ellipse(fx,WATER_Y+4,p.phase==='bite'&&beat?9:6,1.8,0,0,Math.PI*2); c.strokeStyle='#a8ada6'; c.lineWidth=.7; c.stroke();
    if(!fight) drawFloat(c,fx,fy,ink);
    if(p.phase==='bite') bubble(c,x+2,y-46-(beat?2:0),'!',ink);
  }
  if(p.phase==='result'){
    const s=p.fish&&SPECIES_BY_ID.get(p.fish.speciesId);
    if(s){ slackLine(c,tx,ty,tx+1,ty+9,0,ink); c.save(); c.translate(tx+1,ty+15); c.rotate(Math.floor(tick/8)%2?.25:-.15); drawFish(c,s,0,0,17,ink); c.restore(); }
    for(const [dx,dy,r] of [[-15,-38,3],[-21,-24,1.8],[24,-12,2.2]] as const) sparkle(c,x+dx,y+dy,r,BROWN);
  }
  label(c,local?'나':p.name.slice(0,5),x,142,7,ink);
  if(emoting) emoteBubble(c,p.emoji,x+9,y-50,EMOTE_TICKS-(p.emojiUntil-tick),ink);
  if(p.shown&&p.showUntil>tick) { const s=SPECIES_BY_ID.get(p.shown.speciesId); if(s){drawFish(c,s,x,y-57,24);label(c,`${(p.shown.sizeMm/10).toFixed(1)}cm`,x,y-74,7);} }
}
/** Line with a little slack so it reads as fishing line, not a ruler stroke. */
function slackLine(c: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, sag: number, ink: string): void {
  c.beginPath(); c.moveTo(ax,ay); c.quadraticCurveTo((ax+bx)/2+2,(ay+by)/2+sag,bx,by); c.strokeStyle=ink; c.lineWidth=.7; c.stroke();
}
function drawFloat(c: CanvasRenderingContext2D, x: number, y: number, ink: string): void {
  c.beginPath(); c.arc(x,y,3.4,0,Math.PI*2); c.fillStyle=HALO; c.fill();
  c.beginPath(); c.arc(x,y,2.5,Math.PI,0); c.fillStyle=RED; c.fill();
  c.beginPath(); c.arc(x,y,2.5,0,Math.PI); c.fillStyle='#fffefa'; c.fill();
  c.beginPath(); c.arc(x,y,2.5,0,Math.PI*2); c.strokeStyle=ink; c.lineWidth=.9; c.stroke();
  c.beginPath(); c.moveTo(x,y-2.5); c.lineTo(x,y-5); c.stroke();
}
/** Float leaves the tip on the snap, hops in a tight arc, and plops with a ring plus ink droplets. */
function drawFlight(c: CanvasRenderingContext2D, t: number, tx: number, ty: number, x: number, ink: string): void {
  const landX=x+FLOAT_DX;
  if (t < SNAP_AT) { slackLine(c,tx,ty,tx+1,ty+7,1,ink); drawFloat(c,tx+1,ty+7,ink); return; }
  const f=Math.min(1,(t-SNAP_AT)/(LAND_AT-SNAP_AT)), ease=1-(1-f)**2;
  const fx=tx+(landX-tx)*ease, fy=ty+(WATER_Y-ty)*f-30*Math.sin(Math.PI*f);
  slackLine(c,tx,ty,fx,fy,f*8,ink); drawFloat(c,fx,fy,ink);
  if (t < LAND_AT) return;
  const s=Math.floor((t-LAND_AT)/(1-LAND_AT)*3)/3; // three held splash frames
  c.save(); c.globalAlpha=1-s*.8; c.strokeStyle=ink; c.lineWidth=.8;
  c.beginPath(); c.ellipse(landX,WATER_Y+3,4+10*s,1.4+2*s,0,0,Math.PI*2); c.stroke();
  c.fillStyle=ink; for (const [dx,h] of [[-6,7],[-2,10],[3,9],[7,6]]) { c.beginPath(); c.arc(landX+dx*(1+s),WATER_Y-h*(1-s*.6)+s*5,1.1,0,Math.PI*2); c.fill(); }
  c.restore();
}
function bubble(c: CanvasRenderingContext2D, x: number, y: number, text: string, ink: string): void {
  c.beginPath(); c.roundRect(x-7,y-9,14,13,6); c.moveTo(x-2,y+4); c.lineTo(x,y+8); c.lineTo(x+2,y+4);
  c.fillStyle='#fffefa'; c.fill(); c.strokeStyle=ink; c.lineWidth=1.2; c.stroke(); label(c,text,x,y+1.5,11,RED);
}
const BLUE = '#3d74a8', GOLD = '#c08416', CONFETTI = [RED,BLUE,GOLD,'#4f8a5b'];
/** Hand-drawn emote glyphs on a ~16px box centred at the origin; `age` drives each one's little loop. */
export function drawEmoteIcon(c: CanvasRenderingContext2D, kind: number, age: number, ink = INK): void {
  c.save(); c.lineCap = c.lineJoin = 'round'; c.strokeStyle = ink; c.fillStyle = '#fffefa'; c.lineWidth = 1.3;
  const beat = Math.floor(age/8)%2;
  switch (kind) {
    case 0: { // waving hand, rocking on the wrist
      c.rotate(beat ? .3 : -.15); c.beginPath(); c.roundRect(-4.5,-2,9,8,3.5); c.fill(); c.stroke();
      for (const [fx,h] of [[-3,6],[-1,7.5],[1,7.5],[3,6]]) { c.beginPath(); c.moveTo(fx,-1); c.lineTo(fx,-1-h); c.stroke(); }
      c.beginPath(); c.moveTo(-4.5,2); c.lineTo(-7.5,-1.5); c.stroke();
      c.rotate(beat ? -.3 : .15); c.lineWidth = .9;
      for (const r of [9,11.5]) { c.beginPath(); c.arc(-1,-1,r,-2.5,-1.9); c.stroke(); c.beginPath(); c.arc(1,-1,r,-1.25,-.6); c.stroke(); }
      break;
    }
    case 1: { // thumbs up with a small hop
      c.translate(0,beat ? -1 : 0); c.beginPath(); c.roundRect(-5,-1,9,8,2.5); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-3,-1); c.lineTo(-2.5,-7.5); c.quadraticCurveTo(-.5,-8.5,.5,-6.5); c.lineTo(.5,-1); c.fill(); c.stroke();
      c.lineWidth = .9; for (const ly of [2,4.5]) { c.beginPath(); c.moveTo(4,ly); c.lineTo(1,ly); c.stroke(); }
      c.fillStyle = ink; c.fillRect(-7.5,-.5,2,8);
      break;
    }
    case 2: { // heart that beats twice and rests
      const s = [0,1].includes(Math.floor(age/7)%4) ? 1.15 : 1; c.scale(s,s);
      c.beginPath(); c.moveTo(0,6); c.bezierCurveTo(-9,0,-7,-8,0,-3.5); c.bezierCurveTo(7,-8,9,0,0,6); c.closePath();
      c.fillStyle = RED; c.fill(); c.stroke(); c.fillStyle = '#fffefa'; c.beginPath(); c.ellipse(-3.2,-2.4,1.3,.8,-.6,0,Math.PI*2); c.fill();
      break;
    }
    case 3: { // exclamation with a shock burst
      c.translate(beat ? .8 : -.8,0); c.fillStyle = RED; c.beginPath(); c.moveTo(-2,-7.5); c.lineTo(2,-7.5); c.lineTo(.9,2.5); c.lineTo(-.9,2.5); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(0,5.8,1.5,0,Math.PI*2); c.fill(); c.stroke();
      c.lineWidth = 1; for (const a of [-2.5,-.65]) { c.beginPath(); c.moveTo(Math.cos(a)*6,Math.sin(a)*6-1); c.lineTo(Math.cos(a)*9,Math.sin(a)*9-1); c.stroke(); }
      break;
    }
    case 4: { // party popper spraying confetti
      c.beginPath(); c.moveTo(-7,7); c.lineTo(-4,-2); c.lineTo(2,4); c.closePath(); c.fillStyle = GOLD; c.fill(); c.stroke();
      const spread = Math.min(1,age/14);
      CONFETTI.forEach((color,i) => { const a=-1.9+i*.55, r=4+spread*5+(beat&&i%2?1:0); c.fillStyle=color;
        c.save(); c.translate(-1+Math.cos(a)*r,1+Math.sin(a)*r); c.rotate(i+age*.1); c.fillRect(-1.3,-.7,2.6,1.4); c.restore(); });
      break;
    }
    default: { // drooping tear
      const drip = (age%40)/40; c.beginPath(); c.moveTo(0,-7); c.bezierCurveTo(5,0,5,6,0,6); c.bezierCurveTo(-5,6,-5,0,0,-7); c.closePath();
      c.fillStyle = BLUE; c.fill(); c.stroke(); c.fillStyle = '#fffefa'; c.beginPath(); c.ellipse(-1.5,1.5,1,1.6,0,0,Math.PI*2); c.fill();
      c.globalAlpha = 1-drip; c.fillStyle = BLUE; c.beginPath(); c.arc(5,1+drip*7,1,0,Math.PI*2); c.fill();
    }
  }
  c.restore();
}
/** Speech bubble that pops in with overshoot, idles, then floats up and fades over its last ticks. */
function emoteBubble(c: CanvasRenderingContext2D, kind: number, x: number, y: number, age: number, ink: string): void {
  const POP = 9, FADE = 18, left = EMOTE_TICKS-age;
  const s = age < POP ? [.3,.7,1.05,1.2,1.15,1.08,1.02,.99,1][age] : 1, fade = left < FADE ? left/FADE : 1;
  c.save(); c.translate(x,y-(1-fade)*6); c.scale(s,s); c.globalAlpha = fade;
  const r = 7; c.beginPath(); c.moveTo(0,-11);
  c.arcTo(11,-11,11,9,r); c.arcTo(11,9,-11,9,r); c.lineTo(-2,9); c.lineTo(-9,14); c.lineTo(-6,9); c.arcTo(-11,9,-11,-11,r); c.arcTo(-11,-11,11,-11,r); c.closePath();
  c.lineWidth = 4; c.strokeStyle = HALO; c.stroke(); c.fillStyle = '#fffefa'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = ink; c.stroke();
  c.translate(0,-1); c.scale(.92,.92); drawEmoteIcon(c,kind,age,ink);
  c.restore();
}
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string): void {
  c.beginPath(); c.moveTo(x,y-s*2); c.lineTo(x+s*.5,y-s*.5); c.lineTo(x+s*2,y); c.lineTo(x+s*.5,y+s*.5); c.lineTo(x,y+s*2); c.lineTo(x-s*.5,y+s*.5); c.lineTo(x-s*2,y); c.lineTo(x-s*.5,y-s*.5); c.closePath();
  c.fillStyle=ink; c.fill();
}
export function drawFishing(c:CanvasRenderingContext2D,view:Viewport,w:FishingWorld,myId:string,hideEmotes:boolean,previewPos?:number,solo=false):void {
  c.setTransform(view.pixelRatio,0,0,view.pixelRatio,0,0);c.clearRect(0,0,view.width,view.height);
  const scale=Math.min(view.width/320,view.height/280);c.save();c.translate((view.width-320*scale)/2,(view.height-280*scale)/2);c.scale(scale,scale);beginSketchFrame();
  line(c,17,114,301,114);line(c,17,118,301,118,INK,.7);
  for(const x of [23,110,205,295])line(c,x,118,x,128,INK,.8);
  for(let seat=0;seat<(solo?1:6);seat++){
    const x=solo?150:31+seat*46,p=solo?w.players.find(p=>p.id===myId):w.players.find(p=>p.seat===seat);
    if(p) person(c,p,x,w.tick,p.id===myId,hideEmotes&&p.id!==myId);
    else {label(c,'·',x,110,12,'#a8ada6');label(c,'빈자리',x,141,6,'#a8ada6');}
  }
  for(let i=0;i<7;i++)line(c,25+i*40,179+(i%2)*3,35+i*40,179+(i%2)*3,'#a8ada6',.45);
  const p=w.players.find(p=>p.id===myId);
  if(p?.phase==='fight'&&p.fish){
    const s=SPECIES_BY_ID.get(p.fish.speciesId)!;const left=40,width=240,y=201,windowW=WIDTHS[s.rarity]*width;
    line(c,left,y,left+width,y,INK,.8);
    const pos=previewPos??p.pos,inside=Math.abs(p.target-pos)<=WIDTHS[s.rarity]/2;
    c.fillStyle=inside?'rgba(122,84,51,.2)':'rgba(120,120,120,.12)';c.fillRect(left+pos*width-windowW/2,y-8,windowW,16);
    c.strokeStyle=INK;c.lineWidth=1;c.strokeRect(left+pos*width-windowW/2,y-8,windowW,16);
    c.fillStyle=INK;c.beginPath();c.arc(left+p.target*width,y,3,0,Math.PI*2);c.fill();
    line(c,40,220,280,220,'#a8ada6',1);line(c,40,220,40+p.progress*2.4,220,BROWN,2);
    label(c,`${Math.round(p.progress)}%`,160,190,8);
  }else label(c,p?.phase==='casting'?'찌를 던지는 중…':p?.phase==='waiting'?'찌를 바라보는 중…':p?.phase==='bite'?'입질! Space로 챔질':p?.phase==='result'?'잡았어요! 수집함에 저장 중…':p?.notice||'Space로 낚싯대를 던져 보세요',160,202,9);
  label(c,'Space 던지기·챔질 · 누르기/떼기로 당기기',150,250,8);
  label(c,'E 감정표현 · Esc 쉬기',150,265,8);
  c.restore();
}
