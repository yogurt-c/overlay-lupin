/**
 * Bespoke art for every 전설/신화 species, so no legendary fish shares a silhouette with another fish.
 * Same space as drawFish: ~60 units wide, head at -x, tail at +x, sized to fit the 5:2 collection card.
 */
import { BLUE, GOLD, PAPER, RED, TAU, clipped, dot, eye, ribbon, shape, star, stroke } from './art-kit.js';
import type { Art, Pt } from './art-kit.js';

const D: Record<string, Art> = {};

// 천년잉어 — the ancient one: plated scales, frayed tail, white brow and a long beard. (Stardew "Legend", coelacanth)
D['fish-0-17'] = (c, ink) => {
  const tail = new Path2D(); tail.moveTo(22,-4); tail.lineTo(37,-16); tail.lineTo(34,-9); tail.lineTo(39,-5); tail.lineTo(34,-1); tail.lineTo(40,3); tail.lineTo(34,6); tail.lineTo(38,13); tail.lineTo(22,4); tail.closePath();
  shape(c, tail, ink);
  stroke(c, ink, .7, () => { for (const y of [-8,-3,2,7]) { c.moveTo(25,y*.4); c.lineTo(33,y*1.2); } });
  const fin = new Path2D(); fin.moveTo(-12,-15); fin.lineTo(-9,-22); fin.lineTo(-5,-17); fin.lineTo(-1,-23); fin.lineTo(3,-17); fin.lineTo(7,-22); fin.lineTo(11,-15); fin.lineTo(15,-19); fin.lineTo(17,-11); fin.closePath(); shape(c, fin, ink);
  const body = new Path2D(); body.moveTo(-29,2); body.bezierCurveTo(-27,-16,-6,-21,12,-13); body.bezierCurveTo(18,-10,22,-6,25,-3); body.lineTo(25,3); body.bezierCurveTo(18,9,12,15,0,16); body.bezierCurveTo(-15,17,-27,12,-29,2); body.closePath();
  shape(c, body, ink, '#f1e6cc');
  clipped(c, body, () => { c.strokeStyle = ink; c.lineWidth = .9; for (let col = 0; col < 5; col++) for (let row = -2; row <= 2; row++) { const x = -6 + col*7 + (row%2 ? 3.5 : 0), y = row*6; c.beginPath(); c.arc(x,y,4.6,Math.PI*.55,Math.PI*1.45); c.stroke(); } });
  stroke(c, ink, 1.2, () => { c.moveTo(-14,-11); c.quadraticCurveTo(-9,0,-14,12); });
  eye(c,-21,-3,ink,1.5);
  stroke(c, ink, 1.6, () => { c.moveTo(-26,-7); c.quadraticCurveTo(-21,-11,-15,-8); });
  stroke(c, ink, .8, () => { for (const x of [-24,-21,-18]) { c.moveTo(x,-9); c.lineTo(x-1,-12); } });
  stroke(c, ink, 1.1, () => { c.moveTo(-28,4); c.bezierCurveTo(-34,10,-27,15,-33,21); c.moveTo(-26,6); c.bezierCurveTo(-29,12,-21,15,-25,21); });
};

// 비취붕어 — carved jade: faceted outline, coin-hole carving, red tassel on a cord. (jade pendant, Stardew Glacierfish's crystal look)
D['fish-0-18'] = (c, ink) => {
  stroke(c, ink, 1, () => { c.moveTo(-2,-17); c.lineTo(-2,-23); c.moveTo(-5,-26); c.arc(-2,-25,2.5,Math.PI,Math.PI*3); });
  const pts = [[-28,0],[-19,-12],[-4,-17],[11,-13],[22,-5],[34,-14],[30,0],[34,14],[22,5],[11,13],[-4,17],[-19,12]];
  const body = new Path2D(); pts.forEach(([x,y],i) => i ? body.lineTo(x,y) : body.moveTo(x,y)); body.closePath();
  shape(c, body, ink, '#cfe4d0');
  stroke(c, ink, .8, () => { c.moveTo(-19,-12); c.lineTo(-13,0); c.lineTo(-19,12); c.moveTo(-28,0); c.lineTo(-13,0); c.moveTo(-4,-17); c.lineTo(-6,-9); c.moveTo(-4,17); c.lineTo(-6,9); c.moveTo(11,-13); c.lineTo(12,-7); c.moveTo(11,13); c.lineTo(12,7); c.moveTo(22,-5); c.lineTo(22,5); c.moveTo(22,0); c.lineTo(30,0); });
  c.beginPath(); c.arc(3,0,7,0,TAU); c.strokeStyle = ink; c.lineWidth = 1.2; c.stroke(); c.beginPath(); c.arc(3,0,5.6,0,TAU); c.lineWidth = .6; c.stroke();
  c.fillStyle = ink; c.fillRect(1,-2,4,4); c.fillStyle = '#cfe4d0'; c.fillRect(1.8,-1.2,2.4,2.4);
  c.beginPath(); c.arc(-21,-2,2,0,TAU); c.fillStyle = PAPER; c.fill(); c.lineWidth = 1; c.stroke(); dot(c,-21,-2,.8,ink);
  stroke(c, RED, 1.1, () => { c.moveTo(32,0); c.quadraticCurveTo(38,2,38,7); });
  dot(c,38,8,1.8,RED);
  stroke(c, RED, .8, () => { for (const dx of [-1.6,-.5,.6,1.7]) { c.moveTo(38+dx*.6,9); c.lineTo(38+dx*1.4,19); } });
};

// 폭포비룡어 — mid-leap up the Dragon Gate: arched body, wing-like pectorals, horn buds, spray. (등용문, Magikarp→Gyarados)
D['fish-1-17'] = (c, ink) => {
  c.scale(.84,.84); // fit the 5:2 collection card
  stroke(c, BLUE, 1, () => { c.moveTo(14,22); c.quadraticCurveTo(22,13,30,22); c.moveTo(24,22); c.quadraticCurveTo(32,12,40,21); });
  for (const [x,y,r] of [[18,12,1.2],[30,9,1],[36,14,1.3],[25,4,.9],[41,8,.8]]) dot(c,x,y,r,BLUE);
  c.save(); c.rotate(-.45);
  const wing2 = new Path2D(); wing2.moveTo(-2,4); wing2.bezierCurveTo(4,14,14,22,22,22); wing2.bezierCurveTo(16,17,14,12,12,8); wing2.closePath(); shape(c, wing2, ink);
  const tail = new Path2D(); tail.moveTo(18,-4); tail.lineTo(33,-15); tail.quadraticCurveTo(27,-3,28,0); tail.quadraticCurveTo(27,4,33,15); tail.lineTo(18,4); tail.closePath(); shape(c, tail, ink);
  const body = new Path2D(); body.moveTo(-27,0); body.bezierCurveTo(-19,-12,4,-11,19,-4); body.lineTo(19,4); body.bezierCurveTo(4,11,-19,12,-27,0); body.closePath(); shape(c, body, ink);
  stroke(c, ink, .6, () => { for (let x = -6; x < 16; x += 5) { c.moveTo(x,-7); c.quadraticCurveTo(x+3,0,x,7); } });
  const wing = new Path2D(); wing.moveTo(-8,-4); wing.bezierCurveTo(-5,-15,6,-22,17,-22); wing.bezierCurveTo(13,-19,12,-16,13,-13); wing.bezierCurveTo(9,-14,6,-11,6,-8); wing.bezierCurveTo(3,-9,0,-6,0,-4); wing.closePath(); shape(c, wing, ink);
  stroke(c, ink, .7, () => { c.moveTo(-3,-6); c.quadraticCurveTo(4,-14,14,-20); c.moveTo(1,-5); c.quadraticCurveTo(6,-10,11,-13); });
  stroke(c, ink, 1.3, () => { c.moveTo(-19,-7); c.lineTo(-21,-13); c.moveTo(-15,-8); c.lineTo(-16,-14); });
  eye(c,-20,-2,ink,1.4);
  stroke(c, ink, 1, () => { c.moveTo(-26,1); c.bezierCurveTo(-32,4,-30,9,-35,10); });
  c.restore();
};

// 해무장어 — sea-mist eel: a pale ribbon whose rear half dissolves into fog curls; a big hollow ghost eye. (Dredge's fog-born aberrations)
D['fish-2-17'] = (c, ink) => {
  const at = (t: number): Pt => [-30 + t*66, 8*Math.sin(t*4.6+.3)];
  c.save(); c.strokeStyle = ink; c.lineWidth = 1;
  [[.66,6,.7],[.76,5,.55],[.86,4,.42],[.95,3,.3]].forEach(([t,rad,a]) => { const [x,y] = at(t); c.globalAlpha = a; c.setLineDash([2.5,2]);
    c.beginPath(); c.arc(x,y,rad,.3,TAU-.6); c.stroke(); c.beginPath(); c.arc(x+rad*.35,y-rad*.2,rad*.5,1.2,TAU); c.stroke(); });
  c.setLineDash([]); c.restore();
  const r = ribbon(t => at(t*.68), t => t < .9 ? 6.5*(1-t*.5) : 6.5*.55*(1-(t-.9)*6));
  shape(c, r.path, ink, '#e6eef1');
  c.save(); c.clip(r.path); c.globalAlpha = .5; c.strokeStyle = ink; c.lineWidth = .6; c.setLineDash([1.5,2]); for (let i = 22; i < 40; i += 3) { const [x,y] = r.top[i], [bx,by] = r.bottom[i]; c.beginPath(); c.moveTo(x,y); c.lineTo(bx,by); c.stroke(); } c.restore();
  const top = r.top.slice(10, 30); const fin = new Path2D(); fin.moveTo(...top[0]); top.forEach(([x,y],i) => fin.lineTo(x, y - 2.5 - Math.sin(i/top.length*Math.PI)*3.5)); fin.lineTo(...top[top.length-1]);
  stroke(c, ink, .9, () => c.stroke(fin));
  dot(c,-24,-1,3.3,PAPER); c.beginPath(); c.arc(-24,-1,3.3,0,TAU); c.strokeStyle = ink; c.lineWidth = 1.1; c.stroke(); dot(c,-23.3,-.6,1.1,ink);
  stroke(c, ink, .8, () => { c.moveTo(-31,1); c.quadraticCurveTo(-36,-3,-37,-9); c.moveTo(-30,3); c.quadraticCurveTo(-36,6,-40,4); });
};

// 심연왕아귀 — abyssal king angler: gaping toothed maw, crown of spines, a glowing jewel lure. (Stardew Angler, deep-sea anglerfish)
D['fish-3-17'] = (c, ink) => {
  const tail = new Path2D(); tail.moveTo(20,-3); tail.lineTo(34,-11); tail.lineTo(31,0); tail.lineTo(34,11); tail.lineTo(20,3); tail.closePath(); shape(c, tail, ink);
  const body = new Path2D(); body.moveTo(-8,1); body.lineTo(-25,-5); body.bezierCurveTo(-23,-22,4,-24,13,-10); body.bezierCurveTo(17,-5,20,-3,22,-2); body.lineTo(22,2); body.bezierCurveTo(16,10,6,18,-8,17); body.bezierCurveTo(-18,16,-26,12,-31,7); body.closePath();
  shape(c, body, ink, '#e4dfd6');
  const mouth = new Path2D(); mouth.moveTo(-8,1); mouth.lineTo(-25,-5); mouth.lineTo(-31,7); mouth.closePath(); c.fillStyle = ink; c.fill(mouth);
  c.fillStyle = PAPER; for (let i = 0; i < 4; i++) { const t = .15 + i*.22, x = -8 + (-25+8)*t, y = 1 + (-5-1)*t; c.beginPath(); c.moveTo(x-1.4,y-.5); c.lineTo(x+1.4,y+.5); c.lineTo(x-.3,y+3.6); c.closePath(); c.fill(); }
  for (let i = 0; i < 4; i++) { const t = .2 + i*.22, x = -8 + (-31+8)*t, y = 1 + (7-1)*t; c.beginPath(); c.moveTo(x-1.4,y+.4); c.lineTo(x+1.4,y-.4); c.lineTo(x-.6,y-3.4); c.closePath(); c.fill(); }
  clipped(c, body, () => { for (const [x,y] of [[2,4],[8,-4],[12,6],[-2,10],[6,12],[14,-1],[-4,-12],[3,-14]]) dot(c,x,y,.7,ink); });
  const crown = new Path2D(); crown.moveTo(-14,-17); crown.lineTo(-13,-24); crown.lineTo(-9,-20); crown.lineTo(-6,-27); crown.lineTo(-3,-20); crown.lineTo(1,-24); crown.lineTo(1,-16); crown.closePath(); shape(c, crown, ink, '#f2d27c', 1.2);
  stroke(c, ink, 1.1, () => { c.moveTo(-15,-17); c.bezierCurveTo(-20,-28,-30,-27,-33,-19); });
  c.save(); c.globalAlpha = .35; dot(c,-33,-16,6,'#f2d27c'); c.restore();
  const gem = new Path2D(); gem.moveTo(-33,-20); gem.lineTo(-30,-16); gem.lineTo(-33,-12); gem.lineTo(-36,-16); gem.closePath(); shape(c, gem, ink, '#f2d27c', 1);
  eye(c,-12,-9,ink,1.6); stroke(c, ink, .8, () => c.arc(-12,-9,3.4,0,TAU));
};

// 심해유리어 — glass fish: dashed glass outline, skeleton and red heart showing, a clear dome over tube eyes. (barreleye, glass catfish)
D['fish-3-18'] = (c, ink) => {
  const tail = new Path2D(); tail.moveTo(20,-3); tail.lineTo(34,-13); tail.quadraticCurveTo(30,0,34,13); tail.lineTo(20,3); tail.closePath();
  const body = new Path2D(); body.moveTo(-28,1); body.bezierCurveTo(-24,-12,4,-12,21,-3); body.lineTo(21,3); body.bezierCurveTo(4,12,-22,13,-28,1); body.closePath();
  for (const p of [tail, body]) { c.fillStyle = 'rgba(210,232,240,.45)'; c.fill(p); c.setLineDash([3,2]); c.strokeStyle = ink; c.lineWidth = 1.2; c.stroke(p); c.setLineDash([]); }
  stroke(c, ink, .5, () => { for (const y of [-8,-4,0,4,8]) { c.moveTo(22,y*.35); c.lineTo(33,y*1.4); } });
  stroke(c, ink, 1.2, () => { c.moveTo(-14,1); c.bezierCurveTo(0,-1,12,0,30,0); });
  stroke(c, ink, .7, () => { for (let x = -8; x < 20; x += 3.5) { const k = 1 - Math.abs(x-4)/26; c.moveTo(x,0); c.quadraticCurveTo(x+2,-6*k,x+1,-9*k); c.moveTo(x,0); c.quadraticCurveTo(x+2,6*k,x+1,8*k); } });
  dot(c,-11,4,2,RED);
  stroke(c, ink, .9, () => { c.moveTo(-24,-1); c.lineTo(-16,-1); c.lineTo(-14,1); });
  const dome = new Path2D(); dome.arc(-18,-6,8,Math.PI*1.05,Math.PI*1.95); dome.closePath();
  c.fillStyle = 'rgba(210,232,240,.6)'; c.fill(dome); c.setLineDash([2,1.5]); c.strokeStyle = ink; c.lineWidth = 1; c.stroke(dome); c.setLineDash([]);
  for (const x of [-21,-15]) { c.beginPath(); c.roundRect(x-1.4,-11,2.8,5,1.3); c.fillStyle = '#4f8a5b'; c.fill(); c.lineWidth = .8; c.stroke(); dot(c,x,-10.2,.8,ink); }
  stroke(c, ink, .9, () => { c.moveTo(-28,2); c.lineTo(-25,3); });
};

// 별빛잉어 — starlight carp: a night-sky silhouette where stars trace a constellation. (constellation fish, Terraria starlit fish)
D['fish-4-17'] = (c, ink) => {
  const sky = '#26304a';
  const body = new Path2D(); body.moveTo(-28,0); body.bezierCurveTo(-22,-17,6,-17,20,-5); body.lineTo(34,-15); body.quadraticCurveTo(28,0,34,15); body.lineTo(20,5); body.bezierCurveTo(6,17,-22,17,-28,0); body.closePath();
  shape(c, body, ink, sky);
  const pts: Pt[] = [[-20,-4],[-10,-9],[2,-7],[12,-3],[20,0],[31,-11],[26,0],[31,11],[6,6],[-6,8]];
  c.strokeStyle = 'rgba(255,248,220,.75)'; c.lineWidth = .7; c.beginPath();
  for (const [a,b] of [[0,1],[1,2],[2,3],[3,4],[4,5],[4,6],[4,7],[3,8],[8,9],[9,0]]) { c.moveTo(...pts[a]); c.lineTo(...pts[b]); } c.stroke();
  pts.forEach(([x,y],i) => star(c,x,y,i%3 ? .9 : 1.4,'#fff4c8'));
  clipped(c, body, () => { for (const [x,y] of [[-14,4],[-2,-1],[8,-12],[15,9],[-17,-10],[-4,13],[24,-4]]) dot(c,x,y,.45,'#fff4c8'); });
  star(c,-30,-14,1.2,GOLD); star(c,38,-17,.9,GOLD);
};

// 달그림자어 — moon-shadow fish: a body curled into a crescent, its inner half in hatched shadow. (opah moonfish, lunar phases)
D['fish-4-18'] = (c, ink) => {
  c.translate(0,-2); c.scale(.86,.86); // fit the 5:2 collection card
  const body = new Path2D(); body.arc(0,0,21,Math.PI*.38,Math.PI*1.62); body.arc(10,-1,15.5,Math.PI*1.42,Math.PI*.58,true); body.closePath();
  shape(c, body, ink, '#eceaf2');
  clipped(c, body, () => { c.save(); c.beginPath(); c.arc(-4,0,15,0,TAU); c.clip(); c.strokeStyle = ink; c.lineWidth = .6; for (let x = -24; x < 20; x += 2.2) { c.beginPath(); c.moveTo(x,-22); c.lineTo(x+12,22); c.stroke(); } c.restore(); });
  const tail = new Path2D(); tail.moveTo(7,19); tail.lineTo(17,27); tail.lineTo(13,19); tail.lineTo(20,16); tail.closePath(); shape(c, tail, ink, '#eceaf2', 1.2);
  eye(c,8,-17,ink,1.3); stroke(c, ink, 1, () => { c.moveTo(13,-18); c.lineTo(15,-19); });
  stroke(c, ink, .8, () => { for (const a of [1.05,1.25,1.45,.75,.95]) { const x = Math.cos(a*Math.PI)*21, y = Math.sin(a*Math.PI)*21, ox = Math.cos(a*Math.PI)*27, oy = Math.sin(a*Math.PI)*27; c.moveTo(x,y); c.quadraticCurveTo((x+ox)/2+2,(y+oy)/2-2,ox,oy); } });
  c.save(); c.globalAlpha = .7; c.setLineDash([1.5,2.5]); stroke(c, ink, .8, () => c.arc(30,-6,6,0,TAU)); c.setLineDash([]); c.restore();
  dot(c,30,-6,4.5,'#f3e3a8');
};

// 시간의잉어 — carp of time: it swims ahead of its own fading afterimages, with a clock-dial eye and a spiral on its flank. (motion echo, 시간 잔상)
D['fish-5-17'] = (c, ink) => {
  const carp = (dx: number, dy: number): Path2D => { const p = new Path2D();
    p.moveTo(dx-26,dy); p.bezierCurveTo(dx-20,dy-15,dx+6,dy-15,dx+18,dy-3); p.quadraticCurveTo(dx+26,dy-14,dx+32,dy-12);
    p.quadraticCurveTo(dx+27,dy,dx+32,dy+12); p.quadraticCurveTo(dx+26,dy+14,dx+18,dy+3); p.bezierCurveTo(dx+6,dy+15,dx-20,dy+15,dx-26,dy); p.closePath(); return p; };
  c.save(); c.setLineDash([3,2.5]); c.strokeStyle = ink; c.lineWidth = 1;
  for (const [dx,dy,a] of [[14,-5,.25],[7,-2.5,.5]]) { c.globalAlpha = a; c.fillStyle = '#ece6f3'; c.fill(carp(dx,dy)); c.stroke(carp(dx,dy)); }
  c.restore();
  const body = carp(-3,0); shape(c, body, ink, '#ece6f3');
  stroke(c, ink, .7, () => { for (const y of [-7,-3.5,0,3.5,7]) { c.moveTo(17,y*.3); c.lineTo(26,y*1.3); } });
  stroke(c, ink, 1, () => { let a = 0, r = .6; c.moveTo(4,0); for (let k = 0; k < 40; k++) { a += .32; r += .2; c.lineTo(4+Math.cos(a)*r, Math.sin(a)*r*.8); } });
  stroke(c, ink, 1.1, () => { c.moveTo(-13,-9); c.quadraticCurveTo(-9,0,-13,9); });
  const ex = -20, ey = -3; dot(c,ex,ey,3.6,PAPER); c.beginPath(); c.arc(ex,ey,3.6,0,TAU); c.strokeStyle = GOLD; c.lineWidth = 1.2; c.stroke();
  stroke(c, ink, .5, () => { for (let k = 0; k < 8; k++) { const a = k*TAU/8; c.moveTo(ex+Math.cos(a)*2.6,ey+Math.sin(a)*2.6); c.lineTo(ex+Math.cos(a)*3.3,ey+Math.sin(a)*3.3); } });
  stroke(c, ink, .9, () => { c.moveTo(ex,ey); c.lineTo(ex,ey-2.2); c.moveTo(ex,ey); c.lineTo(ex+1.6,ey+.8); });
  const fin = new Path2D(); fin.moveTo(-10,-11); fin.quadraticCurveTo(-4,-21,8,-16); fin.quadraticCurveTo(3,-14,6,-11); fin.closePath(); shape(c, fin, ink, '#ece6f3', 1.2);
};

// 유성꼬리어 — meteor-tail fish: a small cratered rock-head fish dragging a long fanning comet tail. (comet / meteor fish)
D['fish-5-18'] = (c, ink) => {
  const flame = new Path2D(); flame.moveTo(-16,-10); flame.bezierCurveTo(4,-16,24,-20,42,-18); flame.bezierCurveTo(30,-10,36,-4,44,-2); flame.bezierCurveTo(34,2,32,8,42,15); flame.bezierCurveTo(22,16,4,14,-16,10); flame.closePath();
  shape(c, flame, ink, '#f8dc9c', 1.2);
  const inner = new Path2D(); inner.moveTo(-14,-6); inner.bezierCurveTo(4,-9,16,-10,30,-9); inner.bezierCurveTo(22,-4,24,0,32,2); inner.bezierCurveTo(22,4,20,7,28,9); inner.bezierCurveTo(14,9,2,8,-14,6); inner.closePath();
  c.fillStyle = '#f2a77a'; c.fill(inner);
  stroke(c, RED, .8, () => { c.moveTo(-8,-2); c.quadraticCurveTo(10,-5,24,-4); c.moveTo(-8,3); c.quadraticCurveTo(10,5,22,6); });
  for (const [x,y,r] of [[46,-12,1.2],[48,6,1],[40,-22,.8],[44,19,.9]]) dot(c,x,y,r,GOLD);
  const head = new Path2D(); head.moveTo(-30,2); head.bezierCurveTo(-30,-9,-22,-13,-14,-11); head.lineTo(-11,-6); head.lineTo(-7,-4); head.lineTo(-9,1); head.lineTo(-6,5); head.lineTo(-10,9); head.bezierCurveTo(-16,13,-28,12,-30,2); head.closePath();
  shape(c, head, ink, '#d9d2c4');
  stroke(c, ink, .8, () => { c.moveTo(-14,4); c.arc(-15,4,1.6,0,Math.PI*1.5); c.moveTo(-17,-6); c.arc(-18,-6,1.2,0,Math.PI*1.5); c.moveTo(-11,-1); c.arc(-12,-1,.9,0,Math.PI*1.5); });
  eye(c,-23,-2,ink,1.4);
  stroke(c, ink, 1, () => { c.moveTo(-30,4); c.lineTo(-27,4); });
  const fin = new Path2D(); fin.moveTo(-20,7); fin.lineTo(-23,15); fin.lineTo(-16,10); fin.closePath(); shape(c, fin, ink, '#d9d2c4', 1);
};

// 강의이무기 — river imugi: a legless serpent in an S-coil, ridged back, one horn, straining toward a pearl it has not won. (Korean 이무기)
D['fish-1-19'] = (c, ink) => {
  c.save(); c.globalAlpha = .5; c.setLineDash([2,2]); stroke(c, GOLD, .9, () => c.arc(-37,-17,6.5,0,TAU)); c.setLineDash([]); c.restore();
  c.beginPath(); c.arc(-37,-17,4,0,TAU); c.fillStyle = '#f5df9a'; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.1; c.stroke(); stroke(c, PAPER, 1, () => c.arc(-37,-17,2.6,Math.PI*1.05,Math.PI*1.55));
  const at = (t: number): Pt => [-24 + t*66, 10*Math.sin(t*TAU*1.05+.5) - 3*(1-t)];
  const r = ribbon(at, t => 7*(1-t*.75)+.8);
  for (let i = 4; i < 38; i += 3) { const [x,y] = r.top[i], [x2,y2] = r.top[i+2]; const sp = new Path2D(); sp.moveTo(x,y); sp.lineTo((x+x2)/2+1.5,(y+y2)/2-5.5); sp.lineTo(x2,y2); shape(c, sp, ink, PAPER, .9); }
  shape(c, r.path, ink, '#d5e5ee');
  stroke(c, ink, .6, () => { for (let i = 3; i < 39; i += 2) { const [x,y] = r.bottom[i], [tx,ty] = r.top[i]; c.moveTo(x,y); c.lineTo(x+(tx-x)*.35,y+(ty-y)*.35); } });
  const head = new Path2D(); head.moveTo(-18,-7); head.bezierCurveTo(-24,-11,-32,-8,-34,-3); head.lineTo(-27,-1); head.lineTo(-33,1); head.bezierCurveTo(-30,5,-22,4,-18,2); head.closePath(); shape(c, head, ink, '#d5e5ee');
  stroke(c, ink, 1.4, () => { c.moveTo(-23,-9); c.quadraticCurveTo(-22,-15,-17,-18); });
  eye(c,-25,-5,ink,1.2);
  stroke(c, ink, .9, () => { c.moveTo(-33,0); c.bezierCurveTo(-37,4,-33,8,-38,11); });
};

// 해룡잉어 — sea-dragon carp: a tube-snouted dragon head on a carp body sprouting leafy fronds. (leafy seadragon, 해룡)
D['fish-2-19'] = (c, ink) => {
  const sea = '#dfeacf';
  const leaf = (x: number, y: number, a: number, l: number): void => { c.save(); c.translate(x,y); c.rotate(a); stroke(c, ink, .9, () => { c.moveTo(0,0); c.lineTo(l*.3,0); }); const p = new Path2D(); p.moveTo(l*.3,0); p.bezierCurveTo(l*.45,-l*.45,l*.8,-l*.3,l,-l*.1); p.bezierCurveTo(l*.85,l*.05,l*.95,l*.25,l*.8,l*.32); p.bezierCurveTo(l*.6,l*.35,l*.45,l*.2,l*.3,0); shape(c, p, ink, sea, 1); stroke(c, ink, .5, () => { c.moveTo(1,0); c.lineTo(l*.85,0); }); c.restore(); };
  for (const [x,y,a,l] of [[-8,-10,-2.2,13],[4,-11,-1.95,15],[14,-7,-1.7,12],[-2,10,2.2,12],[10,9,1.9,13]]) leaf(x,y,a,l);
  const tail = new Path2D(); tail.moveTo(20,-3); tail.quadraticCurveTo(30,-16,38,-14); tail.quadraticCurveTo(31,-6,33,0); tail.quadraticCurveTo(31,6,38,14); tail.quadraticCurveTo(30,16,20,3); tail.closePath(); shape(c, tail, ink, sea);
  const body = new Path2D(); body.moveTo(-18,-4); body.bezierCurveTo(-10,-14,8,-14,21,-3); body.lineTo(21,3); body.bezierCurveTo(8,14,-10,14,-18,5); body.closePath(); shape(c, body, ink, sea);
  clipped(c, body, () => { c.strokeStyle = ink; c.lineWidth = .7; for (let x = -10; x < 22; x += 5) for (const y of [-6,0,6]) { c.beginPath(); c.arc(x+(y?2.5:0),y,3,Math.PI*.6,Math.PI*1.4); c.stroke(); } });
  const head = new Path2D(); head.moveTo(-16,-6); head.bezierCurveTo(-20,-10,-26,-7,-28,-4); head.lineTo(-40,-3); head.lineTo(-40,1); head.lineTo(-28,1); head.bezierCurveTo(-25,5,-20,6,-16,5); head.closePath(); shape(c, head, ink, sea);
  leaf(-22,-7,-2.3,7); eye(c,-21,-2,ink,1.3);
  stroke(c, ink, .9, () => { c.moveTo(-40,-1); c.bezierCurveTo(-44,4,-40,8,-45,12); });
};

// 심연의용어 — abyss leviathan: a dark armoured serpent-fish with a toothed maw, plated back and a row of glowing lights. (Leviathan, Subnautica/Dredge abyss)
D['fish-3-19'] = (c, ink) => {
  const dark = '#30353c', glow = '#8fe0ea';
  const at = (t: number): Pt => [-18 + t*50, 4*Math.sin(t*TAU*.8)];
  const r = ribbon(at, t => 9*(1-t)**.7+.5);
  for (let i = 2; i < 34; i += 4) { const [x,y] = r.top[i], [x2,y2] = r.top[i+3]; const sp = new Path2D(); sp.moveTo(x,y); sp.lineTo(x+1,y-5.5+i*.08); sp.lineTo(x2,y2); shape(c, sp, ink, '#5a6068', 1); }
  shape(c, r.path, ink, dark);
  const fin = new Path2D(); const [ex,ey] = at(1); fin.moveTo(ex-2,ey); fin.lineTo(ex+8,ey-8); fin.lineTo(ex+5,ey); fin.lineTo(ex+8,ey+8); fin.closePath(); shape(c, fin, ink, dark, 1.2);
  const head = new Path2D(); head.moveTo(-14,-9); head.bezierCurveTo(-22,-13,-32,-10,-38,-5); head.lineTo(-24,-1); head.lineTo(-37,5); head.bezierCurveTo(-30,11,-20,10,-14,8); head.closePath(); shape(c, head, ink, dark);
  c.fillStyle = PAPER; for (let i = 0; i < 4; i++) { const x = -36 + i*3.2, y = -4.6 + i*.95; c.beginPath(); c.moveTo(x,y); c.lineTo(x+2,y+.6); c.lineTo(x+.6,y+3.2); c.closePath(); c.fill(); }
  for (let i = 0; i < 4; i++) { const x = -35 + i*3, y = 4.4 - i*1.4; c.beginPath(); c.moveTo(x,y); c.lineTo(x+2,y-.6); c.lineTo(x+.8,y-3.2); c.closePath(); c.fill(); }
  for (let i = 4; i < 36; i += 4) { const [x,y] = at(i/40); c.save(); c.globalAlpha = .35; dot(c,x,y+1.5,2.6,glow); c.restore(); dot(c,x,y+1.5,1,glow); }
  dot(c,-24,-6,2.2,glow); dot(c,-24,-6,.9,ink);
};

// 구름비늘어 — Kun becoming Peng: a cloud-scalloped whale-fish lifting a great feathered wing, its tail curling into a cloud. (鯤鵬, 祥雲)
D['fish-4-19'] = (c, ink) => {
  c.translate(0,3); c.scale(.92,.92); // fit the 5:2 collection card
  const sky = '#eef2f6';
  const wing = new Path2D(); wing.moveTo(-10,-8); wing.bezierCurveTo(-10,-22,2,-30,22,-31);
  for (let i = 0; i < 5; i++) { const x = 22 - i*4, y = -31 + i*4.6; wing.quadraticCurveTo(x+4,y+2.4,x-1.5,y+4.6); }
  wing.lineTo(6,-8); wing.closePath(); shape(c, wing, ink, PAPER);
  stroke(c, ink, .6, () => { for (let i = 0; i < 5; i++) { c.moveTo(-6+i*2.4,-10); c.quadraticCurveTo(2+i*2.5,-20+i*2,20-i*4,-28.5+i*4.6); } });
  const body = new Path2D(); body.moveTo(-30,2);
  for (let i = 0; i < 6; i++) { const x = -26 + i*8, y = -10 - Math.sin((i+.5)/6*Math.PI)*5; body.quadraticCurveTo(x-2,y-6,x+4,y); }
  body.bezierCurveTo(26,-6,26,0,24,4); body.bezierCurveTo(14,13,-16,15,-30,2); body.closePath(); shape(c, body, ink, sky);
  stroke(c, ink, .8, () => { for (const [x,y] of [[-8,3],[6,1],[14,7]]) { c.moveTo(x+4,y); c.arc(x,y,4,0,Math.PI*1.5,false); c.arc(x+.5,y-1.5,1.8,Math.PI*1.5,Math.PI*.5,true); } });
  const curl = new Path2D(); curl.moveTo(23,0); curl.bezierCurveTo(32,-10,44,-4,40,4); curl.bezierCurveTo(37,10,30,6,33,1); curl.bezierCurveTo(35,-2,38,1,36,3); curl.moveTo(23,4); curl.bezierCurveTo(30,14,40,12,41,8);
  stroke(c, ink, 1.4, () => c.stroke(curl));
  eye(c,-20,-1,ink,1.4); stroke(c, ink, 1, () => { c.moveTo(-30,3); c.quadraticCurveTo(-26,6,-22,5); });
};

// 용잉어 — the dragon king: antlered dragon head with flowing mane and whiskers on a great-scaled carp body, a claw clutching the pearl. (등용문 완성, 용왕)
D['fish-5-19'] = (c, ink) => {
  c.translate(0,2); c.scale(.94,.94); // fit the 5:2 collection card
  const mane = new Path2D(); mane.moveTo(-14,-10);
  for (let i = 0; i < 6; i++) { const x = -14 + i*6; mane.quadraticCurveTo(x-1,-22+i*.8,x+6,-19+i*1.2); mane.quadraticCurveTo(x+3,-14,x+6,-12+i*.6); }
  mane.lineTo(20,-4); mane.closePath(); shape(c, mane, ink, '#f1c9b8', 1.1);
  const tail = new Path2D(); tail.moveTo(20,-3); tail.bezierCurveTo(28,-10,36,-18,42,-16); tail.quadraticCurveTo(34,-8,38,-3); tail.quadraticCurveTo(44,0,40,4); tail.quadraticCurveTo(36,10,42,17); tail.bezierCurveTo(34,17,26,10,20,4); tail.closePath(); shape(c, tail, ink, '#f1c9b8');
  stroke(c, ink, .6, () => { for (const y of [-12,-6,6,12]) { c.moveTo(24,y*.25); c.quadraticCurveTo(32,y*.6,38,y); } });
  const body = new Path2D(); body.moveTo(-16,-8); body.bezierCurveTo(-4,-14,12,-11,21,-3); body.lineTo(21,3); body.bezierCurveTo(12,12,-4,14,-16,8); body.closePath(); shape(c, body, ink, '#fbe3d6');
  clipped(c, body, () => { c.strokeStyle = ink; c.lineWidth = .8; for (let x = -12; x < 22; x += 6) for (const y of [-7,0,7]) { c.beginPath(); c.arc(x+(y?3:0),y,4,Math.PI*.55,Math.PI*1.45); c.stroke(); } });
  const head = new Path2D(); head.moveTo(-14,-9); head.bezierCurveTo(-20,-12,-27,-10,-30,-7); head.lineTo(-37,-6); head.quadraticCurveTo(-39,-3,-36,-1); head.lineTo(-29,-1); head.lineTo(-35,2); head.quadraticCurveTo(-30,7,-22,7); head.lineTo(-14,8); head.closePath(); shape(c, head, ink, '#fbe3d6');
  stroke(c, ink, 1.3, () => { c.moveTo(-20,-11); c.lineTo(-17,-20); c.moveTo(-18,-16); c.lineTo(-13,-19); c.moveTo(-17,-20); c.lineTo(-19,-24); c.moveTo(-24,-10); c.lineTo(-24,-18); c.moveTo(-24,-15); c.lineTo(-28,-18); });
  eye(c,-25,-5,ink,1.3); stroke(c, ink, 1.2, () => { c.moveTo(-28,-8); c.lineTo(-22,-8); });
  stroke(c, ink, 1, () => { c.moveTo(-36,-4); c.bezierCurveTo(-44,-10,-40,-16,-48,-18); c.moveTo(-35,1); c.bezierCurveTo(-42,6,-38,12,-46,14); });
  const arm = new Path2D(); arm.moveTo(-12,6); arm.quadraticCurveTo(-14,13,-20,13); arm.lineTo(-20,10); arm.quadraticCurveTo(-15,10,-15,6); arm.closePath(); shape(c, arm, ink, '#fbe3d6', 1.1);
  c.beginPath(); c.arc(-24,13,3.4,0,TAU); c.fillStyle = '#f5df9a'; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.1; c.stroke(); stroke(c, PAPER, 1, () => c.arc(-24,13,2.2,Math.PI*1.05,Math.PI*1.55));
  stroke(c, ink, 1.1, () => { c.moveTo(-20,10); c.lineTo(-23,9); c.moveTo(-20,13); c.lineTo(-22,16.5); c.moveTo(-19,12); c.lineTo(-27,15); });
};

export const LEGEND_ART: Readonly<Record<string, Art>> = D;
