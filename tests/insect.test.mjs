import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SPECIES, ENVS, GOLDEN_CHANCE, SAVE_VERSION, isInsectSave } from '../dist/shared/insect.js';
import { InsectEngine, pickSpecies, inReach, personal, bugPoint, netPoint, NET_AHEAD, CATCH_TICKS, SWING_TICKS } from '../dist/renderer/games/insect/engine.js';
import { WorldSender, WorldReceiver } from '../dist/renderer/games/insect/wire.js';
import { movePoint, blocked, TREES, WIDTH, HEIGHT } from '../dist/renderer/games/insect/map.js';
import { validWorld } from '../dist/renderer/games/insect/module.js';
import { DRAWN_PLANS } from '../dist/renderer/games/insect/art.js';
const { InsectStore } = createRequire(import.meta.url)('../dist/main/insect-store.js');
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const catchOf = (id = 'bug-1', extra = {}) => ({ id, speciesId: SPECIES[0].id, sizeMm: SPECIES[0].minMm, golden: false, caughtAt: '2026-10-23T00:00:00.000Z', favorite: false, released: false, ...extra });
const storeTest = fn => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lupin-insect-test-')); try { fn(new InsectStore(dir), dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
function field() {
  const e = new InsectEngine(rng(7)), p = e.ensure('a', 'a');
  const b = e.world.bugs[0]; p.x = b.x; p.y = b.y + NET_AHEAD; p.angle = -Math.PI/2;
  return {e,p,b};
}
function swing(e,p,seq=1) { e.input(p.id,0,false,[{seq,kind:'swing',at:e.world.tick}],0,false); for(let t=0;t<SWING_TICKS;t++)e.step(); }
test('30 insects: 10 per habitat, each 4 일반 · 3 고급 · 2 희귀 · 1 전설, all real and drawable', () => {
  assert.equal(SPECIES.length, 30); assert.equal(new Set(SPECIES.map(s => s.id)).size, 30); assert.equal(new Set(SPECIES.map(s => s.name)).size, 30);
  for (const env of ENVS) assert.deepEqual([0, 1, 2, 3].map(r => SPECIES.filter(s => s.env === env && s.rarity === r).length), [4, 3, 2, 1]);
  assert.ok(!SPECIES.some(s => s.name === '지렁이'), 'earthworms are not insects');
  assert.deepEqual(SPECIES.filter(s => s.rarity === 3).map(s => s.name).sort(), ['붉은점모시나비', '소똥구리', '장수하늘소'].sort());
  assert.ok(SPECIES.every(s => Number.isInteger(s.minMm) && s.minMm > 0 && s.minMm < s.maxMm));
  assert.ok(SPECIES.every(s => DRAWN_PLANS.has(s.plan)));
});
test('each habitat rolls rarity 55/28/13/4 and favours species nobody has caught yet', () => {
  const random = rng(3), n = 200000;
  for (const env of ENVS) {
    const counts = [0, 0, 0, 0], ids = new Set();
    for (let i = 0; i < n; i++) { const s = pickSpecies(env, [], random); assert.equal(s.env, env); counts[s.rarity]++; ids.add(s.id); }
    assert.equal(ids.size, 10);
    [55, 28, 13, 4].forEach((w, r) => assert.ok(Math.abs(counts[r] / n * 100 - w) < 1, `${env} tier ${r}`));
  }
  // One unknown 일반 among three known ones carries weight 2 of 5 within the tier.
  const common = SPECIES.filter(s => s.env === 'air' && s.rarity === 0), known = common.slice(1).map(s => s.id);
  let fresh = 0; for (let i = 0; i < n; i++) if (pickSpecies('air', known, random).id === common[0].id) fresh++;
  assert.ok(Math.abs(fresh / n - .55 * 2 / 5) < .01);
});
test('2D movement, obstacle collision and pause', () => {
  const {e,p}=field(); p.x=900;p.y=900;const start={x:p.x,y:p.y};
  e.input('a',1,false,[],1);for(let t=0;t<30;t++)e.step();
  assert.ok(Math.abs(Math.hypot(p.x-start.x,p.y-start.y)-60)<.01);
  const x=p.x;e.input('a',1,true,[],0);for(let t=0;t<20;t++)e.step();assert.equal(p.x-x,15);
  e.input('a',1,true,[],1,true);const stop={x:p.x,y:p.y};for(let t=0;t<20;t++)e.step();assert.deepEqual({x:p.x,y:p.y},stop);
  assert.deepEqual(movePoint(36,100,-2,0),{x:36,y:100});
  const tree=TREES[0];assert.ok(blocked(tree.x,tree.y));assert.deepEqual(movePoint(tree.x-23,tree.y,2,0),{x:tree.x-23,y:tree.y});
  assert.ok(blocked(1720,450));
});
test('net geometry catches spatially after wind-up and waits for durable save acknowledgement', () => {
  const {e,p,b}=field();assert.ok(inReach(p,b));swing(e,p);assert.equal(p.phase,'catch');assert.ok(p.bug);
  for(let t=0;t<CATCH_TICKS;t++)e.step();assert.equal(p.phase,'result');const id=p.bug.id;
  e.input('a',0,false,[{seq:2,kind:'saved',catchId:'wrong'}]);assert.equal(p.phase,'result');
  e.input('a',0,false,[{seq:3,kind:'saved',catchId:id}]);assert.equal(p.phase,'free');assert.ok(p.known.includes(b.speciesId));
  e.input('a',0,false,[{seq:3,kind:'swing'}]);assert.equal(p.phase,'free','retransmission is idempotent');
  const miss=field();miss.p.angle=Math.PI/2;assert.equal(inReach(miss.p,miss.b),false);swing(miss.e,miss.p);assert.equal(miss.p.phase,'stun');
});
test('all four collectors can catch the same golden specimen without consuming another opportunity', () => {
  const e=new InsectEngine(rng(3));for(let i=0;i<4;i++)e.ensure('p'+i,'p'+i);
  assert.equal(e.ensure('overflow','overflow'),undefined);
  const b=e.world.bugs.at(-1);b.golden=true;e.world.bugs=[b];
  const ids=[];
  // Place everyone before any step so the host's lag-compensation history sees them at the bug.
  for(const p of e.world.players){p.x=b.x;p.y=b.y+NET_AHEAD;p.angle=-Math.PI/2;}
  for(const p of e.world.players){swing(e,p);assert.equal(p.phase,'catch');assert.equal(p.bug.golden,true);ids.push(p.bug.id);}
  assert.equal(new Set(ids).size,4);assert.equal(e.world.bugs.some(q=>q.id===b.id),false);
});
test('miss and alert are personal; first miss creates a retry and second escape does not affect peers', () => {
  const {e,p}=field();e.ensure('b','b');const b=e.world.bugs.at(-1);e.world.bugs=[b];b.tutorial=false;b.speciesId='bug-1-0';b.hx=b.x;b.hy=b.y;
  p.x=b.x;p.y=b.y+130;p.angle=-Math.PI/2;swing(e,p);
  const own=personal(b,'a'),other=personal(b,'b');assert.equal(own.misses,1);assert.ok(own.until>e.world.tick);assert.equal(other.misses,0);assert.equal(other.alert,0);
  for(let i=0;i<20;i++)e.step();const q=bugPoint(b,'a');p.x=q.x;p.y=q.y+130;swing(e,p,2);
  assert.equal(own.escaped,true);assert.equal(other.escaped,false);
});
test('population fills a world with four distinct behavior locations and remains bounded', () => {
  const e=new InsectEngine(rng(11));for(let i=0;i<4;i++)e.ensure('p'+i,'p');
  for(let t=0;t<300;t++)e.step();assert.equal(e.world.bugs.length,30);assert.ok(validWorld(e.snapshot()));
  assert.ok(e.world.bugs.some(b=>b.x>1000));assert.ok(e.world.bugs.some(b=>b.y<600));
  for(let t=0;t<10000;t++)e.step();assert.ok(e.world.bugs.length<=34);assert.ok(validWorld(e.snapshot()));
});
test('wire snapshots reassemble reordered pages, recover from loss, reject stale/malformed state and fit datagrams', () => {
  const e=new InsectEngine(rng(14));for(let i=0;i<4;i++)e.ensure('p'+i,'가나다라마바사아자차카타파하가나다라마바사아자차');
  for(let t=0;t<250;t++)e.step();
  const sender=new WorldSender(),receiver=new WorldReceiver();const first=sender.next(e.world),pages=[first];
  for(let i=1;i<first.total;i++)pages.push(sender.next(e.world));
  for(const page of pages)assert.ok(Buffer.byteLength(JSON.stringify({t:'ROOM_WORLD',roomId:'a'.repeat(36),payload:page}))<1400);
  let result;for(const page of pages.toReversed()){const got=receiver.accept(page);if(got)result=got;}assert.ok(validWorld(result));assert.equal(result.bugs.length,30);
  e.step();const second=sender.next(e.world);for(let i=1;i<second.total;i++)receiver.accept(sender.next(e.world));assert.equal(receiver.accept({...second,total:999}),undefined);
  assert.equal(receiver.accept(second).tick,e.world.tick,'missing first page can arrive last');
  assert.equal(validWorld({...result,players:[...result.players,result.players[0]]}),false);
  assert.equal(validWorld({...result,bugs:[{...result.bugs[0],x:NaN}]}),false);
  assert.equal(validWorld({...result,players:[{...result.players[0],phase:'result',bug:undefined}]}),false);
});
test('handoff preserves per-player catches and pending result IDs', async () => {
  const {InsectMatch}=await import('../dist/renderer/games/insect/module.js');const host=new InsectMatch(true,'a','a');host.setMembers([{id:'b',name:'b'}]);
  for(let i=0;i<20;i++)host.step({});const guest=new InsectMatch(false,'b','b');
  const first=host.buildOutgoingPacket();guest.applyOpponentPacket(first);for(let i=1;i<first.total;i++)guest.applyOpponentPacket(host.buildOutgoingPacket());
  const epoch=guest.world.epoch;guest.promoteToHost('a');assert.equal(guest.engine.world.epoch,epoch);assert.equal(guest.engine.world.players.length,1);assert.equal(guest.engine.world.players[0].id,'b');
  const before=guest.engine.world.tick;guest.applyOpponentPacket(first);assert.equal(guest.engine.world.tick,before);
});
test('old wire and non-roster commands cannot mutate simulation', async () => {
  const {InsectMatch}=await import('../dist/renderer/games/insect/module.js');const m=new InsectMatch(true,'a','a');const before=m.engine.snapshot();
  m.applyOpponentPacket({kind:'insect-input-v2',from:'intruder',name:'x',move:1,moveY:1,sneak:false,paused:false,commands:[]});
  m.applyOpponentPacket({kind:'insect-input',from:'a',name:'a',move:1,sneak:false,commands:[]});assert.deepEqual(m.engine.snapshot(),before);
});
test('the collection saves catches with their gold flag, favourites, releases and merges imports', () => storeTest((s, dir) => {
  assert.equal(s.load().version, SAVE_VERSION);
  s.act({ kind: 'catch', bug: catchOf('a', { golden: true }) }); s.act({ kind: 'catch', bug: catchOf('a') });
  assert.equal(s.read().catches.length, 1); assert.equal(s.read().catches[0].golden, true);
  assert.throws(() => s.act({ kind: 'catch', bug: catchOf('b', { sizeMm: 9999 }) }));
  s.act({ kind: 'favorite', id: 'a' }); assert.throws(() => s.act({ kind: 'release', id: 'a' }), /즐겨찾기/);
  s.act({ kind: 'favorite', id: 'a' }); s.act({ kind: 'release', id: 'a' }); assert.equal(s.read().catches[0].released, true);
  const merged = s.merge({ version: SAVE_VERSION, profileId: 'other', catches: [catchOf('a'), catchOf('c', { golden: true })] });
  assert.deepEqual(merged.catches.map(c => [c.id, c.released, c.golden]), [['a', true, true], ['c', false, true]]);
  assert.throws(() => s.merge({ version: 9, catches: [] }));
  fs.writeFileSync(path.join(dir, 'insect-collection.json'), '{broken');
  assert.ok(isInsectSave(s.read()), 'a corrupt file falls back to the last good backup');
}));

test('Space press slams once; Escape, blur and modal suppression cancel the strike', async () => {
  const {createInputSource}=await import('../dist/renderer/games/insect/input.js');
  const target=new EventTarget();target.document=Object.assign(new EventTarget(),{body:{dataset:{game:'insect'}},getElementById:()=>({hidden:true}),hidden:false});
  const input=createInputSource(target);
  const key=(type,code)=>{const e=new Event(type,{cancelable:true});Object.defineProperties(e,{code:{value:code},repeat:{value:false}});target.dispatchEvent(e);};
  // EventTarget isn't an HTMLElement; supply the DOM method used by the input guard.
  target.closest=()=>null;
  key('keydown','Space');assert.equal(input.read().swing,true);assert.equal(input.read().swing,false);key('keyup','Space');
  key('keydown','Space');key('keydown','Escape');key('keyup','Space');assert.equal(input.read().swing,false);
  key('keydown','Space');target.dispatchEvent(new Event('blur'));key('keyup','Space');assert.equal(input.read().swing,false);
  key('keydown','Space');assert.equal(input.read().swing,true);key('keyup','Space');
  key('keydown','Space');target.document.body.dataset.insectPaused='true';assert.equal(input.read().swing,false);key('keyup','Space');assert.equal(input.read().swing,false);
});

test('incompatible insect room revisions are filtered, while other games remain compatible', async () => {
  const {GameNetwork}=await import('../dist/main/network.js');const n=new GameNetwork();const r={address:'127.0.0.1',port:47474};
  const send=msg=>n.handleMessage(Buffer.from(JSON.stringify(msg)),r);
  const advert={t:'ROOM_OPEN',id:'a',name:'room',roomId:'room',gameId:'insect',capacity:4,memberCount:1,replyPort:5000};
  send(advert);assert.equal(n.openRooms.size,0);send({...advert,insectRevision:3});assert.equal(n.openRooms.size,1);
  n.hostedRoom={id:'ours',name:'ours',gameId:'insect',capacity:4,status:'lobby',members:new Map()};n.broadcastRosterToAll=()=>{};
  const join={t:'ROOM_JOIN',id:'b',name:'b',roomId:'ours',replyPort:5001};send(join);assert.equal(n.hostedRoom.members.size,0);send({...join,insectRevision:3});assert.equal(n.hostedRoom.members.size,1);
});
