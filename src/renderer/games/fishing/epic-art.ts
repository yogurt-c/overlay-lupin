/**
 * Bespoke art for every 에픽 species: the plain body family plus one signature motif and one accent colour,
 * a step below the full 전설/신화 treatment in legend-art.ts. Same space and card fit as drawFish.
 */
import { GOLD, PAPER, RED, TAU, clipped, dot, eye, finTri, forkTail, gill, lens, shape, star, stroke } from './art-kit.js';
import type { Art, Pt } from './art-kit.js';

const D: Record<string, Art> = {};

// 황금붕어 — golden crucian with a fancy four-lobed ryukin tail and coin glints. (금붕어 류킨)
D['fish-0-15'] = (c, ink) => {
  const gold = '#f3d27a';
  for (const [a,l] of [[-.55,1],[-.2,.85],[.2,.85],[.55,1]]) { c.save(); c.translate(17,0); c.rotate(a); const p = new Path2D(); p.moveTo(0,0); p.bezierCurveTo(8,-6*l,18*l,-5,20*l,0); p.bezierCurveTo(16*l,3,8,3,0,0); shape(c, p, ink, gold, 1.1); c.restore(); }
  finTri(c, ink, [[-8,-13],[0,-21],[8,-12]], gold);
  const body = lens(14, 19); shape(c, body, ink, gold);
  gill(c, ink, -12, 14); eye(c,-19,-3,ink,1.5);
  for (const [x,y,s] of [[-2,-5,1],[6,3,.8],[0,6,.6]]) star(c,x,y,s,PAPER);
  stroke(c, ink, .8, () => { c.moveTo(-27,1); c.lineTo(-24,1.5); });
};

// 연꽃메기 — lotus catfish: flat whiskered catfish head wearing a pink lotus, a lily-pad pectoral fin. (연꽃, 메기)
D['fish-0-16'] = (c, ink) => {
  const tail = forkTail(22, 8, .9); shape(c, tail, ink);
  const body = new Path2D(); body.moveTo(-28,2); body.bezierCurveTo(-28,-9,-14,-11,-2,-8); body.bezierCurveTo(10,-6,18,-4,24,-2); body.lineTo(24,2); body.bezierCurveTo(14,8,0,10,-14,9); body.bezierCurveTo(-24,9,-28,7,-28,2); body.closePath(); shape(c, body, ink, '#ece7da');
  const pad = new Path2D(); pad.moveTo(-8,5); pad.arc(-8,11,6,-Math.PI/2+.35,Math.PI*1.5-.35); pad.closePath(); shape(c, pad, ink, '#bcd9b0', 1.1);
  stroke(c, ink, .6, () => { for (const a of [.4,1.2,2,2.8]) { c.moveTo(-8,11); c.lineTo(-8+Math.cos(a)*5,11+Math.sin(a)*5); } });
  stroke(c, ink, 1.1, () => { c.moveTo(-27,1); c.bezierCurveTo(-34,-2,-36,4,-40,0); c.moveTo(-27,4); c.bezierCurveTo(-33,9,-37,7,-40,12); c.moveTo(-25,6); c.quadraticCurveTo(-27,11,-24,14); });
  eye(c,-20,-4,ink,1.3);
  const pink = '#f2b8c6';
  for (const [a,l] of [[-2.75,9],[-2.25,11.5],[-1.57,12.5],[-.89,11.5],[-.39,9]]) { c.save(); c.translate(-13,-8); c.rotate(a); const p = new Path2D(); p.moveTo(0,0); p.bezierCurveTo(l*.3,-4,l*.75,-3.2,l,0); p.bezierCurveTo(l*.75,3.2,l*.3,4,0,0); shape(c, p, ink, pink, 1); stroke(c, '#d9879b', .5, () => { c.moveTo(1.5,0); c.lineTo(l*.75,0); }); c.restore(); }
  dot(c,-13,-9,2,GOLD); for (const dx of [-1.6,0,1.6]) dot(c,-13+dx,-10.4,.5,ink);
};

// 연못수호어 — pond guardian: a dragon-horned carp carrying a heater shield on its flank. (수호, 방패)
D['fish-0-19'] = (c, ink) => {
  const tail = forkTail(20, 13); shape(c, tail, ink);
  finTri(c, ink, [[-9,-14],[-3,-20],[3,-15],[8,-19],[11,-12]]);
  const body = lens(14, 20); shape(c, body, ink, '#e3ebe6');
  const shield = new Path2D(); shield.moveTo(-3,-7); shield.lineTo(9,-7); shield.lineTo(9,0); shield.quadraticCurveTo(9,6,3,9); shield.quadraticCurveTo(-3,6,-3,0); shield.closePath(); shape(c, shield, ink, '#5f8f8a', 1.2);
  stroke(c, PAPER, 1, () => { c.moveTo(-.5,1); c.quadraticCurveTo(1.5,-1,3,1); c.quadraticCurveTo(4.5,3,6.5,1); });
  stroke(c, ink, 1.3, () => { c.moveTo(-18,-9); c.lineTo(-20,-16); c.lineTo(-17,-14); c.moveTo(-14,-10); c.lineTo(-14,-17); c.lineTo(-11,-14); });
  gill(c, ink, -11, 13); eye(c,-19,-3,ink,1.5);
};

// 홍련연어 — red-lotus salmon: spawning-red salmon with a hooked jaw and a tail of two red petals. (산란기 연어, 홍련)
D['fish-1-15'] = (c, ink) => {
  for (const dir of [-1,1]) { const p = new Path2D(); p.moveTo(19,dir*1); p.bezierCurveTo(24,dir*8,32,dir*13,36,dir*11); p.bezierCurveTo(35,dir*6,30,dir*2,19,0); shape(c, p, ink, '#e88d80', 1.2); stroke(c, ink, .5, () => { c.moveTo(21,dir*1.5); c.quadraticCurveTo(28,dir*7,34,dir*10); }); }
  finTri(c, ink, [[-6,-9],[1,-15],[6,-8]]);
  const body = new Path2D(); body.moveTo(-26,2); body.lineTo(-29,-1); body.bezierCurveTo(-22,-11,4,-11,20,-2); body.lineTo(20,2); body.bezierCurveTo(4,10,-18,10,-24,4); body.closePath(); shape(c, body, ink, '#f5c9bf');
  clipped(c, body, () => { c.fillStyle = '#e88d80'; c.fillRect(-20,0,42,12); });
  stroke(c, ink, 1.5, () => { c.moveTo(-29,-1); c.quadraticCurveTo(-30,3,-27,5); });
  stroke(c, ink, .9, () => { c.moveTo(-26,2); c.lineTo(-22,1); });
  gill(c, ink, -13, 9); eye(c,-19,-3,ink,1.3);
};

// 청옥송어 — sapphire trout: a slim trout whose spots are cut sapphires. (청옥)
D['fish-1-16'] = (c, ink) => {
  const tail = forkTail(20, 9, 1.05); shape(c, tail, ink);
  finTri(c, ink, [[-6,-9],[1,-15],[6,-8]]); finTri(c, ink, [[10,-6],[13,-10],[15,-5]]);
  const body = lens(9, 20); shape(c, body, ink, '#e6edf4');
  const gem = (x: number, y: number, s: number): void => { const p = new Path2D(); p.moveTo(x,y-s); p.lineTo(x+s*.8,y); p.lineTo(x,y+s); p.lineTo(x-s*.8,y); p.closePath(); shape(c, p, ink, '#5b8fd0', .8); stroke(c, PAPER, .6, () => { c.moveTo(x-s*.3,y-s*.3); c.lineTo(x,y-s*.65); }); };
  for (const [x,y,s] of [[-5,-3,2.2],[2,2,2.6],[9,-2,2.2],[15,1,1.8],[-1,-6.5,1.4]]) gem(x,y,s);
  gill(c, ink, -13, 9); eye(c,-19,-2,ink,1.3);
};

// 은실장어 — silver-thread eel: a slender eel whose fins unravel into long silver threads. (은실)
D['fish-1-18'] = (c, ink) => {
  const silver = '#aab4bb';
  const at = (t: number): Pt => [-28 + t*56, 6*Math.sin(t*5)];
  for (const [o,len,phase] of [[-1,1,0],[1,.9,1.2],[-1,.8,2.2]]) {
    c.save(); c.strokeStyle = silver; c.lineWidth = .9; c.beginPath();
    for (let i = 0; i <= 30; i++) { const t = .3 + i/30*.95*len, [x,y] = at(Math.min(t,1)); const ext = Math.max(0,t-1)*30; const yy = y + o*(3.5+i*.25) + Math.sin(i*.7+phase)*1.6; i ? c.lineTo(x+ext,yy) : c.moveTo(x,yy); }
    c.stroke(); c.restore();
  }
  const top: Pt[] = [], bottom: Pt[] = [];
  for (let i = 0; i <= 40; i++) { const t = i/40, [x,y] = at(t), w = 3.6*(1-t*.75)*Math.min(1,Math.sqrt(t*9)+.15); top.push([x,y-w]); bottom.push([x,y+w]); }
  const body = new Path2D(); top.forEach(([x,y],i) => i ? body.lineTo(x,y) : body.moveTo(x,y)); bottom.reverse().forEach(([x,y]) => body.lineTo(x,y)); body.closePath();
  shape(c, body, ink, '#eef1f3');
  stroke(c, silver, .7, () => { for (let i = 8; i < 38; i += 4) { const [x,y] = at(i/40); c.moveTo(x-1,y-1); c.lineTo(x+1,y+1); } });
  eye(c,-23,-1,ink,1.2); stroke(c, ink, .9, () => { c.moveTo(-28,0); c.lineTo(-25,1); });
};

// 달꼬리참치 — moon-tail tuna: torpedo tuna with finlets and a glowing crescent tail. (참치 초승달 꼬리)
D['fish-2-15'] = (c, ink) => {
  const moon = '#f3e3a8';
  const tail = new Path2D(); tail.moveTo(20,0); tail.bezierCurveTo(28,-8,32,-16,36,-19); tail.quadraticCurveTo(29,0,36,19); tail.bezierCurveTo(32,16,28,8,20,0); tail.closePath();
  c.save(); c.globalAlpha = .45; dot(c,31,0,13,moon); c.restore(); shape(c, tail, ink, moon);
  finTri(c, ink, [[-6,-10],[-1,-17],[3,-9]]);
  const body = new Path2D(); body.moveTo(-28,0); body.bezierCurveTo(-20,-13,6,-12,22,-2); body.lineTo(22,2); body.bezierCurveTo(6,12,-20,13,-28,0); body.closePath(); shape(c, body, ink, '#dfe6ee');
  clipped(c, body, () => { c.fillStyle = '#7f93ab'; c.beginPath(); c.moveTo(-30,-2); c.bezierCurveTo(-10,-4,8,-3,24,-1); c.lineTo(24,-14); c.lineTo(-30,-14); c.fill(); });
  stroke(c, ink, 1.5, () => { c.moveTo(-28,0); c.bezierCurveTo(-20,-13,6,-12,22,-2); });
  for (const dir of [-1,1]) for (let i = 0; i < 4; i++) { const x = 8 + i*3.4, y = dir*(8.4 - i*1.9); finTri(c, ink, [[x,y],[x+2.2,y+dir*2.6],[x+2.6,y-dir*.2]], GOLD); }
  gill(c, ink, -13, 10); eye(c,-20,-2,ink,1.4);
};

// 산호복어 — coral puffer: a round puffer with pink branching coral growing from its back. (산호)
D['fish-2-16'] = (c, ink) => {
  const coral = '#f0a3a0';
  const branch = (x: number, y: number, a: number, l: number, d: number): void => { if (d === 0) return; const ex = x + Math.cos(a)*l, ey = y + Math.sin(a)*l;
    c.strokeStyle = ink; c.lineWidth = 3.4; c.beginPath(); c.moveTo(x,y); c.lineTo(ex,ey); c.stroke(); c.strokeStyle = coral; c.lineWidth = 1.8; c.beginPath(); c.moveTo(x,y); c.lineTo(ex,ey); c.stroke();
    branch(ex,ey,a-.5,l*.7,d-1); branch(ex,ey,a+.45,l*.65,d-1); };
  branch(-5,-8,-1.75,9,3); branch(5,-7,-1.25,7.5,3);
  const tail = forkTail(14, 8, 1); shape(c, tail, ink);
  const body = new Path2D(); body.ellipse(-4,0,18,14,0,0,TAU); shape(c, body, ink, '#fbe6dd');
  stroke(c, ink, .9, () => { for (const [x,y] of [[-6,10],[2,9],[8,6],[-12,8]]) { c.moveTo(x,y); c.lineTo(x+.6,y+2.4); } });
  for (const [x,y] of [[-2,-4],[5,0],[0,4],[-8,2],[8,-6]]) dot(c,x,y,1,coral);
  eye(c,-15,-3,ink,1.6); stroke(c, ink, 1.1, () => { c.moveTo(-22,1); c.quadraticCurveTo(-20,3,-22,4); });
  finTri(c, ink, [[-6,1],[-1,6],[-1,0]], coral);
};

// 진주가자미 — pearl flounder: a flat, two-eyed-up flounder with a nacre rim and a pearl resting on its back. (가자미, 진주조개)
D['fish-2-18'] = (c, ink) => {
  const body = new Path2D(); body.moveTo(-26,2); body.bezierCurveTo(-24,-17,12,-19,22,-3); body.lineTo(32,-10); body.quadraticCurveTo(29,0,32,10); body.lineTo(22,3); body.bezierCurveTo(12,18,-24,17,-26,2); body.closePath();
  shape(c, body, ink, '#f2ece2');
  clipped(c, body, () => { c.strokeStyle = '#c9b8d8'; c.lineWidth = 2.6; c.stroke(body); c.strokeStyle = '#b7cfe2'; c.lineWidth = 1; c.setLineDash([2,2]); c.beginPath(); c.moveTo(-22,2); c.bezierCurveTo(-20,-12,10,-14,18,-3); c.moveTo(-22,3); c.bezierCurveTo(-20,13,10,14,18,3); c.stroke(); c.setLineDash([]); });
  stroke(c, ink, 1.5, () => c.stroke(body));
  stroke(c, ink, .5, () => { for (let x = -16; x < 16; x += 3) { c.moveTo(x,-12+Math.abs(x)*.12); c.lineTo(x+1,-15+Math.abs(x)*.2); c.moveTo(x,12-Math.abs(x)*.12); c.lineTo(x+1,15-Math.abs(x)*.2); } });
  eye(c,-17,-6,ink,1.2); eye(c,-13,-8,ink,1.2);
  c.save(); c.globalAlpha = .4; dot(c,4,-1,7,'#e6dcf0'); c.restore(); c.beginPath(); c.arc(4,-1,4.6,0,TAU); c.fillStyle = '#f6efe6'; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.1; c.stroke();
  stroke(c, '#d6c3e3', 1.4, () => c.arc(4,-1,3.2,Math.PI*.15,Math.PI*.85));
  stroke(c, '#b7cfe2', 1.2, () => c.arc(4,-1,3,Math.PI*.1,Math.PI*.6)); dot(c,2.6,-2.6,1.1,PAPER);
};

// 검은등불어 — black-back lantern fish: a dark back with a candle-flame dorsal fin lit like a lantern. (검은 등 + 등불)
D['fish-3-15'] = (c, ink) => {
  const tail = forkTail(20, 9); shape(c, tail, ink, '#3a3e44');
  c.save(); c.globalAlpha = .35; dot(c,1,-15,7,'#f6cf6a'); c.restore();
  const flame = new Path2D(); flame.moveTo(-3,-8); flame.bezierCurveTo(-5,-14,-1,-17,1,-23); flame.bezierCurveTo(3,-18,7,-15,5,-8); flame.closePath(); shape(c, flame, ink, '#f6cf6a', 1.1);
  const inner = new Path2D(); inner.moveTo(-.5,-9); inner.bezierCurveTo(-1.5,-12,0,-14,1,-17); inner.bezierCurveTo(2,-14,3.5,-12,2.5,-9); inner.closePath(); c.fillStyle = RED; c.fill(inner);
  const body = lens(9, 20); shape(c, body, ink, '#f1ede3');
  clipped(c, body, () => { c.fillStyle = '#3a3e44'; c.beginPath(); c.moveTo(-30,-1); c.bezierCurveTo(-12,-3,6,-2,24,0); c.lineTo(24,-14); c.lineTo(-30,-14); c.fill(); });
  stroke(c, ink, 1.5, () => c.stroke(body));
  for (const x of [-4,4,12]) dot(c,x,4,.9,'#f6cf6a');
  dot(c,-19,-2,2.3,PAPER); dot(c,-19,-2,1.3,ink);
};

// 붉은눈심해어 — red-eyed deep-sea fish: a small spiny ball dominated by one huge glowing red eye. (심해어 거대 눈)
D['fish-3-16'] = (c, ink) => {
  const tail = forkTail(12, 7, 1.1); shape(c, tail, ink, '#d8d3cc');
  const body = new Path2D(); body.ellipse(-3,1,16,12,0,0,TAU); shape(c, body, ink, '#e2ddd5');
  stroke(c, ink, 1, () => { for (let i = 0; i < 9; i++) { const a = Math.PI*(.95+i*.13); c.moveTo(-3+Math.cos(a)*16,1+Math.sin(a)*12); c.lineTo(-3+Math.cos(a)*20,1+Math.sin(a)*15.5); } });
  c.save(); c.globalAlpha = .3; dot(c,-9,-2,10,RED); c.restore();
  c.beginPath(); c.arc(-9,-2,7,0,TAU); c.fillStyle = PAPER; c.fill(); c.strokeStyle = ink; c.lineWidth = 1.4; c.stroke();
  dot(c,-9,-2,5,RED); dot(c,-10,-2.5,2.4,ink); dot(c,-11.5,-4.2,1.1,PAPER);
  stroke(c, ink, 1.1, () => { c.moveTo(-19,6); c.lineTo(-11,7); });
  c.fillStyle = PAPER; for (const x of [-18,-16,-14,-12.5]) { c.beginPath(); c.moveTo(x,6.2); c.lineTo(x+1,6.4); c.lineTo(x+.4,8.6); c.closePath(); c.fill(); }
};

// 월식아귀 — eclipse angler: a dusk-violet angler whose lure is an eclipsed sun with a gold corona. (월식)
D['fish-4-15'] = (c, ink) => {
  const tail = forkTail(18, 9); shape(c, tail, ink, '#d9d2e6');
  const body = new Path2D(); body.moveTo(-26,1); body.bezierCurveTo(-26,-14,0,-18,19,-3); body.lineTo(19,3); body.bezierCurveTo(4,15,-20,15,-26,4); body.closePath(); shape(c, body, ink, '#d9d2e6');
  stroke(c, ink, 1.2, () => { c.moveTo(-26,2); c.quadraticCurveTo(-18,6,-12,3); });
  c.fillStyle = PAPER; for (const x of [-24,-21,-18,-15]) { c.beginPath(); c.moveTo(x,3.4+(x+24)*.03); c.lineTo(x+1.2,3.6+(x+24)*.05); c.lineTo(x+.4,6.2); c.closePath(); c.fill(); }
  stroke(c, ink, 1.1, () => { c.moveTo(-12,-12); c.bezierCurveTo(-16,-24,-26,-26,-30,-20); });
  c.save(); stroke(c, GOLD, 1, () => { for (let k = 0; k < 10; k++) { const a = k*TAU/10; c.moveTo(-30+Math.cos(a)*5,-16+Math.sin(a)*5); c.lineTo(-30+Math.cos(a)*7,-16+Math.sin(a)*7); } }); c.restore();
  c.beginPath(); c.arc(-30,-16,4.4,0,TAU); c.fillStyle = '#f6cf6a'; c.fill(); c.strokeStyle = ink; c.lineWidth = 1; c.stroke();
  dot(c,-29,-16.6,3.6,'#2e2a3a');
  eye(c,-15,-5,ink,1.4); finTri(c, ink, [[-2,4],[4,10],[5,3]], '#d9d2e6');
};

// 꿈결송어 — dreaming trout: a pastel trout asleep mid-swim, blowing bubbles with tiny stars inside. (꿈, 잠)
D['fish-4-16'] = (c, ink) => {
  const lav = '#e2dcf2';
  const tail = forkTail(20, 9); shape(c, tail, ink, lav);
  finTri(c, ink, [[-6,-9],[1,-15],[6,-8]], lav);
  const body = lens(9, 20); shape(c, body, ink, '#f1eef8');
  clipped(c, body, () => { for (const [x,y,r] of [[-4,3,3],[5,-3,2.4],[12,3,2]]) { c.save(); c.globalAlpha = .55; dot(c,x,y,r,'#cfe0f2'); c.restore(); } });
  stroke(c, ink, 1.2, () => { c.moveTo(-21,-3); c.quadraticCurveTo(-19,-1,-17,-3); });
  stroke(c, ink, .7, () => { c.moveTo(-21,-3); c.lineTo(-22,-1.8); c.moveTo(-19,-1.7); c.lineTo(-19,-.3); });
  dot(c,-17,1,1.2,'rgba(232,120,110,.45)');
  for (const [x,y,r] of [[-31,-5,2.4],[-35,-12,3.2],[-33,-21,4]]) { c.beginPath(); c.arc(x,y,r,0,TAU); c.strokeStyle = ink; c.lineWidth = .8; c.stroke(); star(c,x,y,r*.3,GOLD); }
  gill(c, ink, -13, 9);
};

// 봉황지느러미어 — phoenix-fin fish: a slim fish with a plumed crest and three long phoenix tail plumes ending in eye-spots. (봉황, 공작 깃)
D['fish-5-15'] = (c, ink) => {
  const red = '#e5735a', gold = '#f3cf74';
  for (const [dy,len,curl] of [[-1,.85,-1],[0,.95,.4],[1,.8,1]]) {
    c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); c.moveTo(18,dy*1.5); c.bezierCurveTo(28,dy*6,36,dy*4+curl*6,44*len,dy*8+curl*4); c.stroke();
    const x = 44*len, y = dy*8+curl*4; c.beginPath(); c.ellipse(x,y,4,2.6,dy*.4,0,TAU); c.fillStyle = gold; c.fill(); c.stroke(); dot(c,x,y,1.2,red);
    c.strokeStyle = red; c.lineWidth = .6; c.beginPath(); for (let t = .3; t < .95; t += .12) { const bx = 18+(x-18)*t, by = dy*1.5+(y-dy*1.5)*t; c.moveTo(bx,by); c.lineTo(bx+1.5,by-2.4); c.moveTo(bx,by); c.lineTo(bx+1.5,by+2.4); } c.stroke();
  }
  const body = lens(8, 20); shape(c, body, ink, '#fbe7dc');
  clipped(c, body, () => { c.fillStyle = red; c.globalAlpha = .55; c.fillRect(-30,2,52,10); c.globalAlpha = 1; });
  stroke(c, ink, 1.5, () => c.stroke(body));
  for (const [a,l] of [[-2.35,10],[-1.95,13],[-1.55,11]]) { c.save(); c.translate(-16,-7); c.rotate(a); const p = new Path2D(); p.moveTo(0,0); p.quadraticCurveTo(l*.5,-2,l,0); p.quadraticCurveTo(l*.5,2,0,0); shape(c, p, ink, red, .9); c.restore(); }
  gill(c, ink, -12, 8); eye(c,-19,-2,ink,1.3);
};

// 무지개수염어 — rainbow-whisker fish: a round-bellied fish trailing six long whiskers, one per rainbow colour. (무지개)
D['fish-5-16'] = (c, ink) => {
  const tail = forkTail(14, 9); shape(c, tail, ink);
  const body = new Path2D(); body.ellipse(-4,0,18,13,0,0,TAU); shape(c, body, ink);
  const colors = ['#d9534a','#ea9a3c','#e9c94a','#5fa865','#4f86c6','#8a66b8'];
  colors.forEach((col,i) => { const oy = -2.5 + i*1; const ty = -15 + i*6.5; c.strokeStyle = ink; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-21,oy); c.bezierCurveTo(-28,oy+(ty-oy)*.2,-32,ty-3,-40,ty); c.stroke(); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); });
  stroke(c, ink, .9, () => { for (const [x,y] of [[-4,9],[3,8],[9,5]]) { c.moveTo(x,y); c.lineTo(x+.6,y+2.2); } });
  eye(c,-14,-4,ink,1.6); finTri(c, ink, [[-5,1],[1,6],[1,-1]]);
  finTri(c, ink, [[-6,-12],[0,-18],[6,-12]]);
};

export const EPIC_ART: Readonly<Record<string, Art>> = D;
