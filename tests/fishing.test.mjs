import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SAVE_VERSION, SPECIES, isFishingSave } from '../dist/shared/fishing.js';
import { FishingEngine, WIDTHS, pickSpecies, isRaining, RAIN_CHECK_TICKS } from '../dist/renderer/games/fishing/engine.js';
import { FishingMatch, validWorld } from '../dist/renderer/games/fishing/module.js';
import { LEGEND_ART } from '../dist/renderer/games/fishing/legend-art.js';
import { EPIC_ART } from '../dist/renderer/games/fishing/epic-art.js';
const { FishingStore } = createRequire(import.meta.url)('../dist/main/fishing-store.js');
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const fish = (id='catch-1') => ({id,speciesId:SPECIES[0].id,sizeMm:SPECIES[0].minMm,caughtAt:'2026-10-21T00:00:00.000Z',favorite:false,released:false});
const storeTest = fn => {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lupin-fishing-test-'));try{fn(new FishingStore(dir),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}};
test('all 120 permanent species share one fishing pool with planned rarity distribution',()=>{
  assert.equal(SPECIES.length,120);assert.equal(new Set(SPECIES.map(s=>s.id)).size,120);assert.equal(new Set(SPECIES.map(s=>s.name)).size,120);
  assert.deepEqual([0,1,2,3,4,5].map(r=>SPECIES.filter(s=>s.rarity===r).length),[36,30,24,15,10,5]);
  assert.ok(SPECIES.every(s=>s.minMm<s.maxMm));
  const random=rng(33);const ids=new Set();for(let n=0;n<100000;n++)ids.add(pickSpecies([],random,n%2===0).id);assert.equal(ids.size,120);
});
test('three 전설 and two 신화 bite only while it rains',()=>{
  const rain=SPECIES.filter(s=>s.rainOnly);assert.equal(rain.filter(s=>s.rarity===4).length,3);assert.equal(rain.filter(s=>s.rarity===5).length,2);assert.equal(rain.length,5);
  const random=rng(9);for(let n=0;n<100000;n++)assert.ok(!pickSpecies([],random,false).rainOnly);
});
test('the host rolls showers that everyone sees and casts during rain can hook rain-only fish',()=>{
  const e=new FishingEngine(()=>0,()=> 'id');e.ensure('me','me');
  for(let n=0;n<RAIN_CHECK_TICKS;n++)e.step();assert.ok(isRaining(e.world));assert.ok(validWorld(e.snapshot()));
  const until=e.world.rainUntil;while(e.world.tick<until)e.step();assert.ok(!isRaining(e.world));
  assert.equal(validWorld({...e.snapshot(),rainUntil:undefined}),false);
});
test('every 에픽/전설/신화 species has its own bespoke art and no other species does',()=>{
  assert.deepEqual(Object.keys(LEGEND_ART).sort(),SPECIES.filter(s=>s.rarity>=4).map(s=>s.id).sort());
  assert.deepEqual(Object.keys(EPIC_ART).sort(),SPECIES.filter(s=>s.rarity===3).map(s=>s.id).sort());
  const arts=[...Object.values(LEGEND_ART),...Object.values(EPIC_ART)];assert.equal(new Set(arts).size,arts.length);
});
test('real species keep real lengths and rarer tiers reach bigger fish',()=>{
  const by=n=>SPECIES.find(s=>s.name===n);
  assert.ok(by('미꾸라지').maxMm<=200,'no 40cm loach');assert.ok(by('송사리').maxMm<=40);assert.ok(by('참돔').maxMm>=900);
  const avgMax=[0,1,2,3,4,5].map(r=>{const l=SPECIES.filter(s=>s.rarity===r);return l.reduce((n,s)=>n+s.maxMm,0)/l.length;});
  avgMax.slice(1).forEach((m,i)=>assert.ok(m>avgMax[i],`tier ${i+1} outgrows tier ${i}`));
  assert.ok(SPECIES.every(s=>Number.isInteger(s.minMm)&&Number.isInteger(s.maxMm)&&s.minMm>0&&s.minMm<s.maxMm));
});
test('version 1 saves and exports are rescaled onto the new size ranges without losing anything',()=>storeTest((s,dir)=>{
  const loach=SPECIES.find(s=>s.name==='미꾸라지'),koi=SPECIES.find(s=>s.name==='잉어');
  // Old ranges: 미꾸라지 100–311mm, 잉어 97–444mm. 311 was the old record loach; 97 the smallest carp.
  const v1={version:1,profileId:'old',catches:[{...fish('a'),speciesId:loach.id,sizeMm:311,favorite:true},{...fish('b'),speciesId:koi.id,sizeMm:97,released:true}]};
  const file=path.join(dir,'fishing-collection.json');fs.writeFileSync(file,JSON.stringify(v1));
  const d=s.load();assert.equal(d.version,SAVE_VERSION);assert.equal(d.profileId,'old');
  assert.deepEqual(d.catches.map(c=>[c.id,c.sizeMm,c.favorite,c.released]),[['a',loach.maxMm,true,false],['b',koi.minMm,false,true]]);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).version,SAVE_VERSION,'migration is persisted');
  assert.deepEqual(JSON.parse(fs.readFileSync(file+'.bak','utf8')),v1,'the original stays as the backup');
  s.merge({...v1,catches:[{...fish('c'),speciesId:loach.id,sizeMm:100}]});assert.equal(s.read().catches.find(c=>c.id==='c').sizeMm,loach.minMm,'old exports import too');
}));
test('seats fill alternating spots first, stay fixed on leaving and reuse empty spots up to six players',()=>{
  const e=new FishingEngine(rng(1));for(let i=0;i<6;i++)e.ensure('p'+i,'player');assert.equal(e.ensure('overflow','no'),undefined);
  assert.deepEqual(e.world.players.map(p=>p.seat),[0,2,4,1,3,5]);
  e.remove('p2');e.ensure('new','new');assert.equal(e.world.players.find(p=>p.id==='new').seat,4);assert.equal(e.world.players.find(p=>p.id==='p5').seat,5);
});
test('commands survive retransmission, do not skip sequence gaps, and cancel cannot erase a caught result',()=>{
  const e=new FishingEngine(rng(3),()=> 'stable-id');const p=e.ensure('me','me');
  e.input('me',false,[{seq:2,kind:'cancel'}]);assert.equal(p.ack,0);
  e.input('me',false,[{seq:1,kind:'cast'}]);const caughtId=p.fish.id;
  e.input('me',false,[{seq:1,kind:'cast'}]);assert.equal(p.fish.id,caughtId);assert.equal(p.ack,1);
  p.phase='result';e.input('me',false,[{seq:2,kind:'cancel'}]);assert.equal(p.phase,'result');
  e.input('me',false,[{seq:3,kind:'saved',catchId:'wrong'}]);assert.equal(p.phase,'result');
  e.input('me',false,[{seq:4,kind:'saved',catchId:caughtId}]);assert.equal(p.phase,'idle');
});
test('all species can be caught with the same one-button controller',()=>{
  for(const s of SPECIES){
    const e=new FishingEngine(rng(5));const p=e.ensure('me','me');p.phase='fight';p.fish={...fish(),speciesId:s.id,sizeMm:s.maxMm};p.seed=21;
    for(let i=0;i<1500&&p.phase==='fight';i++){e.input('me',p.pos<p.target,[]);e.step();}
    assert.equal(p.phase,'result',`${s.name} should be catchable`);assert.equal(p.progress,100);
  }
  assert.ok(WIDTHS.every((w,i)=>i===0||w<WIDTHS[i-1]));
});
test('missing an input stream cancels only that player, successful result waits for save acknowledgement',()=>{
  const e=new FishingEngine();const a=e.ensure('a','a'),b=e.ensure('b','b');
  e.input('a',false,[{seq:1,kind:'cast'}]);b.phase='result';b.fish=fish();
  for(let n=0;n<100;n++)e.step();assert.equal(a.phase,'idle');assert.equal(b.phase,'result');assert.ok(validWorld(e.snapshot()));
});
test('host accepts only roster members and clients ignore stale or malformed snapshots',()=>{
  const h=new FishingMatch(true,'host','host'),c=new FishingMatch(false,'peer','peer');h.setMembers([{id:'peer',name:'peer'}]);
  h.applyOpponentPacket({kind:'fishing-input',from:'intruder',name:'x',held:false,commands:[{seq:1,kind:'cast'}]});
  h.applyOpponentPacket({kind:'fishing-input',from:'peer',name:'peer',held:false,commands:[{seq:1,kind:'cast'}]});h.step({});
  const packet=h.buildOutgoingPacket();assert.equal(packet.world.players.length,2);assert.equal(packet.world.players[1].phase,'casting');
  c.applyOpponentPacket(packet);assert.equal(c.hud().status,h.hud().status);
  assert.equal(validWorld({...packet.world,players:[{...packet.world.players[0],fish:{bad:true}}]}),false);
  c.applyOpponentPacket({kind:'fishing-world',world:{tick:99999,players:null}});assert.equal(c.hud().status,h.hud().status);
});
test('save persists across restart, duplicate delivery cannot resurrect released fish, favorite protects release',()=>storeTest((s,dir)=>{
  const profile=s.load().profileId;s.act({kind:'catch',fish:fish()});s.act({kind:'catch',fish:fish()});assert.equal(s.read().catches.length,1);
  s.act({kind:'favorite',id:'catch-1'});assert.throws(()=>s.act({kind:'release',id:'catch-1'}));s.act({kind:'favorite',id:'catch-1'});s.act({kind:'release',id:'catch-1'});
  s.act({kind:'catch',fish:fish()});const d=new FishingStore(dir).load();assert.equal(d.profileId,profile);assert.equal(d.catches.length,1);assert.ok(d.catches[0].released);assert.ok(isFishingSave(d));
}));
test('import merges tombstones, retains pre-import backup, rejects invalid content',()=>storeTest(s=>{
  s.act({kind:'catch',fish:fish()});const old=structuredClone(s.read());s.act({kind:'release',id:'catch-1'});s.merge(old);assert.ok(s.read().catches[0].released);
  const next={...old,catches:[fish('catch-2')]};s.merge(next);assert.equal(s.read().catches.length,2);
  assert.throws(()=>s.merge({...old,version:99}));assert.throws(()=>s.act({kind:'catch',fish:{...fish('bad'),sizeMm:0}}));
}));
test('corrupt primary recovers from backup; corrupt primary and backup never silently erase collection',()=>storeTest((s,dir)=>{
  s.act({kind:'catch',fish:fish()});s.act({kind:'catch',fish:fish('catch-2')});
  fs.writeFileSync(path.join(dir,'fishing-collection.json'),'bad');assert.equal(s.read().catches.length,1);
  fs.writeFileSync(path.join(dir,'fishing-collection.json.bak'),'bad');assert.throws(()=>s.load());
  s.merge({version:SAVE_VERSION,profileId:'restored',catches:[fish()]});assert.equal(s.read().catches.length,1);
}));

test('real room protocol sends mid-session rosters and retains neighboring seats after leave/rejoin',async()=>{
  const {GameNetwork}=await import('../dist/main/network.js');
  const nets=Array.from({length:7},()=>new GameNetwork());const [host,...guests]=nets;const matches=new Map();let roomId='';
  try{
    for(let i=0;i<nets.length;i++){
      const n=nets[i];n.replyPort=40000+i;n.broadcastRoomOpen=()=>{};
      n.sendDirect=(msg,target)=>{const to=nets.find(p=>p.replyPort===target.replyPort);if(to)to.handleMessage(Buffer.from(JSON.stringify(msg)),{address:'127.0.0.1',port:n.replyPort});};
      n.on('room-started',(isHost)=>{const m=new FishingMatch(isHost,n.myId,'player');matches.set(n.myId,m);if(isHost)m.setMembers([...n.hostedRoom.members.values()]);});
      n.on('room-roster',r=>{roomId=r.id;matches.get(n.myId)?.setMembers(r.members);});
      n.on('room-member-state',(from,payload)=>matches.get(n.myId)?.applyOpponentPacket({...payload,from}));
      n.on('room-world',payload=>matches.get(n.myId)?.applyOpponentPacket(payload));
      n.on('room-member-left',id=>matches.get(n.myId)?.removePeer(id));
    }
    host.createRoom('fishing',6);host.startRoom();const hm=matches.get(host.myId);
    const join=g=>(g.pendingJoinId=roomId,host.handleMessage(Buffer.from(JSON.stringify({t:'ROOM_JOIN',id:g.myId,name:'친구',roomId,replyPort:g.replyPort})),{address:'127.0.0.1',port:g.replyPort}));
    guests.forEach(join);assert.equal(hm.buildOutgoingPacket().world.players.length,6);
    const first=guests[0];first.sendRoomState({kind:'fishing-input',name:'친구',held:false,commands:[{seq:1,kind:'cast'}]});hm.step({});host.sendRoomState(hm.buildOutgoingPacket());
    assert.equal(hm.buildOutgoingPacket().world.players.find(p=>p.id===first.myId).phase,'casting');
    assert.equal(matches.get(first.myId).hud().status,hm.hud().status);
    const lastSeat=hm.buildOutgoingPacket().world.players.find(p=>p.id===guests[4].myId).seat;
    first.leaveRoom();join(guests[5]);assert.equal(hm.buildOutgoingPacket().world.players.find(p=>p.id===guests[5].myId).seat,2);
    assert.equal(hm.buildOutgoingPacket().world.players.find(p=>p.id===guests[4].myId).seat,lastSeat);
  }finally{for(const n of nets)n.stop();}
});
test('host leaving hands the playing room to the earliest member, who keeps it open even alone',async()=>{
  const {GameNetwork}=await import('../dist/main/network.js');
  const nets=Array.from({length:3},()=>new GameNetwork());const [host,heir,friend]=nets;const matches=new Map(),lost=[],started=[];let roomId='';
  try{
    for(let i=0;i<nets.length;i++){
      const n=nets[i];n.replyPort=41000+i;n.broadcastRoomOpen=()=>{};
      n.sendDirect=(msg,target)=>{const to=nets.find(p=>p.replyPort===target.replyPort&&!p.left);if(to)to.handleMessage(Buffer.from(JSON.stringify(msg)),{address:'127.0.0.1',port:n.replyPort});};
      n.on('room-started',(isHost)=>{started.push(n.myId);const m=new FishingMatch(isHost,n.myId,'player');matches.set(n.myId,m);if(isHost)m.setMembers([...n.hostedRoom.members.values()]);});
      n.on('room-roster',r=>{roomId=r.id;matches.get(n.myId)?.setMembers(r.members);});
      n.on('room-member-state',(from,payload)=>matches.get(n.myId)?.applyOpponentPacket({...payload,from}));
      n.on('room-world',payload=>matches.get(n.myId)?.applyOpponentPacket(payload));
      n.on('room-member-left',id=>matches.get(n.myId)?.removePeer(id));
      n.on('room-promoted',id=>matches.get(n.myId)?.promoteToHost(id));
      n.on('room-lost',()=>lost.push(n.myId));
    }
    host.createRoom('fishing',6);host.startRoom();const hm=matches.get(host.myId);
    const join=g=>(g.pendingJoinId=roomId,host.handleMessage(Buffer.from(JSON.stringify({t:'ROOM_JOIN',id:g.myId,name:'친구',roomId,replyPort:g.replyPort})),{address:'127.0.0.1',port:g.replyPort}));
    join(heir);join(friend);hm.step({});host.sendRoomState(hm.buildOutgoingPacket());
    const friendSeat=hm.buildOutgoingPacket().world.players.find(p=>p.id===friend.myId).seat;
    // A forged handoff from someone other than the host is ignored.
    friend.handleMessage(Buffer.from(JSON.stringify({t:'ROOM_HANDOFF',roomId,gameId:'fishing',capacity:6,formerHostId:host.myId,hostId:friend.myId,members:[]})),{address:'127.0.0.1',port:49999});
    assert.equal(friend.joinedRoom.hostId,host.myId);
    host.leaveRoom();host.left=true;
    assert.deepEqual(lost,[]);assert.equal(started.length,3,'nobody restarts the match');
    assert.equal(heir.hostedRoom.id,roomId);assert.equal(friend.joinedRoom.hostId,heir.myId);
    const hm2=matches.get(heir.myId);hm2.step({});
    const world=hm2.buildOutgoingPacket().world;
    assert.deepEqual(world.players.map(p=>p.id).sort(),[heir.myId,friend.myId].sort());
    assert.equal(world.players.find(p=>p.id===friend.myId).seat,friendSeat,'seats carry over');
    friend.sendRoomState({kind:'fishing-input',name:'친구',held:false,commands:[{seq:1,kind:'cast'}]});hm2.step({});
    assert.equal(hm2.buildOutgoingPacket().world.players.find(p=>p.id===friend.myId).phase,'casting','inputs reach the new host');
    friend.leaveRoom();friend.left=true;
    assert.equal(heir.hostedRoom.members.size,1);assert.deepEqual(lost,[],'the room stays open with one player');
    assert.equal(hm2.buildOutgoingPacket().world.players.length,1);
  }finally{for(const n of nets)n.stop();}
});
test('a roster still in flight after leaving does not pull the player back into the room',async()=>{
  const {GameNetwork}=await import('../dist/main/network.js');
  const nets=[new GameNetwork(),new GameNetwork(),new GameNetwork()];const [host,leaver,late]=nets;let starts=0;
  try{
    // The leaver's ROOM_LEAVE is lost, so the host still lists them when the next player arrives.
    nets.forEach((n,i)=>{n.replyPort=44000+i;n.broadcastRoomOpen=()=>{};n.sendDirect=(msg,target)=>{const to=nets.find(p=>p.replyPort===target.replyPort);if(to&&msg.t!=='ROOM_LEAVE')to.handleMessage(Buffer.from(JSON.stringify(msg)),{address:'127.0.0.1',port:n.replyPort});};});
    leaver.on('room-started',()=>starts++);
    host.createRoom('fishing',6);host.startRoom();const roomId=host.hostedRoom.id;
    const join=g=>(g.pendingJoinId=roomId,host.handleMessage(Buffer.from(JSON.stringify({t:'ROOM_JOIN',id:g.myId,name:'친구',roomId,replyPort:g.replyPort})),{address:'127.0.0.1',port:g.replyPort}));
    join(leaver);assert.equal(starts,1);
    leaver.leaveRoom();join(late);
    assert.equal(starts,1,'no second start');assert.equal(leaver.joinedRoom,null);
    // A roster for a room I am in, but that no longer lists me, is ignored as well.
    late.handleMessage(Buffer.from(JSON.stringify({t:'ROOM_ROSTER',roomId,name:'x',gameId:'fishing',hostId:host.myId,capacity:6,members:[{id:host.myId,name:'h'}],status:'playing'})),{address:'127.0.0.1',port:44000});
    assert.equal(late.joinedRoom.id,roomId);
  }finally{for(const n of nets)n.stop();}
});
test('rooms of games without handoff still close when the host leaves',async()=>{
  const {GameNetwork}=await import('../dist/main/network.js');
  const nets=[new GameNetwork(),new GameNetwork()];const [host,guest]=nets;const lost=[];
  try{
    nets.forEach((n,i)=>{n.replyPort=42000+i;n.broadcastRoomOpen=()=>{};n.sendDirect=(msg,target)=>{const to=nets.find(p=>p.replyPort===target.replyPort);if(to)to.handleMessage(Buffer.from(JSON.stringify(msg)),{address:'127.0.0.1',port:n.replyPort});};n.on('room-lost',r=>lost.push(r));});
    host.createRoom('cell',6);host.startRoom();
    guest.pendingJoinId=host.hostedRoom.id;
    host.handleMessage(Buffer.from(JSON.stringify({t:'ROOM_JOIN',id:guest.myId,name:'친구',roomId:host.hostedRoom.id,replyPort:guest.replyPort})),{address:'127.0.0.1',port:guest.replyPort});
    host.leaveRoom();assert.deepEqual(lost,['closed']);assert.equal(guest.hostedRoom,null);
  }finally{for(const n of nets)n.stop();}
});

test('10,000 saved fish remain readable and no import can duplicate catches',()=>storeTest(s=>{
  const catches=Array.from({length:10000},(_,i)=>fish('load-'+i));const data={version:SAVE_VERSION,profileId:'large',catches};
  s.merge(data);s.merge(data);assert.equal(s.read().catches.length,10000);assert.ok(isFishingSave(s.read()));
}));


test('casting completes before bite waiting; repeated cast cannot skip it and cancellation works',()=>{
  const e=new FishingEngine(rng(9));const p=e.ensure('me','me');
  e.input('me',false,[{seq:1,kind:'cast'}]);assert.equal(p.phase,'casting');assert.ok(validWorld(e.snapshot()));
  for(let n=0;n<20;n++){e.input('me',false,[]);e.step();}
  const elapsed=p.time;e.input('me',false,[{seq:2,kind:'cast'}]);assert.equal(p.time,elapsed);assert.equal(p.phase,'casting');
  for(let n=0;n<40;n++){e.input('me',false,[]);e.step();}
  assert.equal(p.phase,'waiting');assert.ok(p.time>=3&&p.time<=8);
  e.input('me',false,[{seq:3,kind:'cancel'},{seq:4,kind:'cast'}]);assert.equal(p.phase,'casting');
  e.input('me',false,[{seq:5,kind:'cancel'}]);assert.equal(p.phase,'idle');assert.equal(p.fish,undefined);
});
