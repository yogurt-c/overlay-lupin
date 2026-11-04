import { SPECIES, SPECIES_BY_ID, validCatch } from '../../../shared/insect.js';
import { WIDTH, HEIGHT } from './map.js';
import { syncBugs } from './engine.js';
import type { InsectWorld, Collector, Bug, Phase } from './engine.js';
const finite = (...v: unknown[]) => v.every(n => typeof n === 'number' && Number.isFinite(n));
export function validWorld(raw: unknown): raw is InsectWorld {
  if (!raw || typeof raw !== 'object') return false;
  const w = raw as InsectWorld;
  if (w.version !== 3 || !Number.isSafeInteger(w.tick) || w.tick < 0 || !Number.isSafeInteger(w.nextId) || w.nextId < 1 || typeof w.epoch !== 'string' || !/^[\w-]{1,60}$/.test(w.epoch)
    || !Array.isArray(w.players) || w.players.length > 4 || !Array.isArray(w.bugs) || w.bugs.length > 34) return false;
  if (new Set(w.players.map(p => p?.id)).size !== w.players.length || new Set(w.players.map(p => p?.seat)).size !== w.players.length || new Set(w.bugs.map(b=>b?.id)).size!==w.bugs.length) return false;
  return w.players.every(p => p && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 120 && typeof p.name === 'string' && p.name.length <= 24 && Number.isInteger(p.seat) && p.seat >= 0 && p.seat < 4
    && finite(p.x,p.y,p.angle,p.move,p.moveY,p.strikeX,p.strikeY,p.t,p.emoji,p.emojiUntil,p.showUntil,p.noticeUntil,p.ack,p.lastInput,p.caughtUntil,p.pingX,p.pingY,p.pingUntil,p.swingAt)
    && p.x>=0&&p.x<=WIDTH&&p.y>=0&&p.y<=HEIGHT&&Math.abs(p.move)<=1&&Math.abs(p.moveY)<=1&&Math.abs(p.angle)<=Math.PI+0.01
    && ['free','swing','stun','hit','catch','result'].includes(p.phase) && [p.sneak,p.paused].every(b=>typeof b==='boolean')
    && typeof p.notice==='string'&&p.notice.length<200&&[p.bug,p.caught,p.shown].every(b=>b===undefined||validCatch(b))
    && (!['catch','result'].includes(p.phase)||!!p.bug)&&Array.isArray(p.known)&&p.known.length<=30&&p.known.every(id=>SPECIES_BY_ID.has(id)))
    && w.bugs.every(b=>b&&Number.isSafeInteger(b.id)&&b.id>0&&b.id<w.nextId&&SPECIES_BY_ID.has(b.speciesId)&&finite(b.x,b.y,b.hx,b.hy,b.sizeMm,b.born,b.expires,b.seed)
      && b.x>=0&&b.x<=WIDTH&&b.y>=0&&b.y<=HEIGHT&&b.hx>=0&&b.hx<=WIDTH&&b.hy>=0&&b.hy<=HEIGHT
      && Number.isInteger(b.sizeMm)&&b.sizeMm>=SPECIES_BY_ID.get(b.speciesId)!.minMm&&b.sizeMm<=SPECIES_BY_ID.get(b.speciesId)!.maxMm
      && typeof b.golden==='boolean'&&typeof b.tutorial==='boolean'&&Array.isArray(b.personal)&&b.personal.length<=4&&new Set(b.personal.map(s=>s?.owner)).size===b.personal.length
      && b.personal.every(s=>s&&typeof s.owner==='string'&&s.owner.length<=120&&finite(s.alert,s.misses,s.dx,s.dy,s.until)&&s.alert>=0&&s.alert<=100&&s.misses>=0&&Math.abs(s.dx)<=WIDTH&&Math.abs(s.dy)<=HEIGHT&&typeof s.caught==='boolean'&&typeof s.escaped==='boolean'));
}
const PLAYER_KEYS = ['id','name','seat','x','y','angle','move','moveY','sneak','paused','strikeX','strikeY','phase','t','bug','emoji','emojiUntil','showUntil','shown','notice','noticeUntil','ack','lastInput','known','caught','caughtUntil','pingX','pingY','pingUntil','swingAt'] as const;
const round = (n:number) => Math.round(n*10)/10;
function encode(w:InsectWorld):string {
  return JSON.stringify([w.tick,w.nextId,w.epoch,w.players.map(p=>PLAYER_KEYS.map(k=>k==='known'?[]:typeof p[k]==='number'&&['x','y'].includes(k)?round(p[k] as number):p[k])),w.bugs.map(b=>{
    let owners=0,caught=0,escaped=0;const states:number[][]=[];
    b.personal.forEach(s=>{const i=w.players.findIndex(p=>p.id===s.owner);if(i<0)return;owners|=1<<i;if(s.caught)caught|=1<<i;if(s.escaped)escaped|=1<<i;if(s.alert||s.misses||s.dx||s.dy||s.until)states.push([i,round(s.alert),s.misses,round(s.dx),round(s.dy),s.until]);});
    return [b.id,SPECIES.findIndex(s=>s.id===b.speciesId),b.sizeMm,+b.golden,round(b.x),round(b.y),round(b.hx),round(b.hy),b.born,b.expires,b.seed,+b.tutorial,owners,caught,escaped,states];
  })]);
}
function decode(s:string):InsectWorld|undefined {
  try {
    const [tick,nextId,epoch,rows,bugs]=JSON.parse(s);
    if(!Array.isArray(rows)||rows.length>4||!Array.isArray(bugs)||bugs.length>34)return;
    const players:Collector[]=rows.map((r:unknown[])=>Object.fromEntries(PLAYER_KEYS.map((k,i)=>[k,r[i]===null?undefined:r[i]])) as unknown as Collector);
    const world:InsectWorld={version:3,tick,nextId,epoch,players,bugs:bugs.map((r:any[])=>({id:r[0],speciesId:SPECIES[r[1]]?.id,sizeMm:r[2],golden:!!r[3],x:r[4],y:r[5],hx:r[6],hy:r[7],born:r[8],expires:r[9],seed:r[10],tutorial:!!r[11],personal:players.flatMap((p,i)=>{
      if(!(r[12]&(1<<i)))return [];const d=r[15].find((a:number[])=>a[0]===i)??[i,0,0,0,0,0];return [{owner:p.id,alert:d[1],misses:d[2],dx:d[3],dy:d[4],until:d[5],caught:!!(r[13]&(1<<i)),escaped:!!(r[14]&(1<<i))}];
    })} as Bug))};
    return validWorld(world)?world:undefined;
  }catch{return;}
}
const PHASES:Phase[]=['free','swing','stun','hit','catch','result'];
/** Every collector's fast-changing state: [seat,x,y,angle,move,moveY,phase,t,sneak,paused,strikeX,strikeY,ack]. */
export type QuickRow=number[];
export type Quick=[tick:number,rows:QuickRow[]];
const round2=(n:number)=>Math.round(n*100)/100;
export function encodeQuick(w:InsectWorld):Quick {
  return [w.tick,w.players.map(p=>[p.seat,round(p.x),round(p.y),round2(p.angle),round2(p.move),round2(p.moveY),PHASES.indexOf(p.phase),p.t,+p.sneak,+p.paused,round(p.strikeX),round(p.strikeY),p.ack])];
}
/**
 * Lays the newest positions and timers over a (possibly older) full snapshot. A phase that needs
 * a caught bug only lands once the full snapshot carrying that bug has arrived.
 */
export function applyQuick(w:InsectWorld,raw:unknown):boolean {
  if(!Array.isArray(raw)||raw.length!==2||!Number.isSafeInteger(raw[0])||raw[0]<0||!Array.isArray(raw[1])||raw[1].length>4)return false;
  const [tick,rows]=raw as Quick;
  if(!rows.every(r=>Array.isArray(r)&&r.length===13&&finite(...r)))return false;
  for(const [seat,x,y,angle,move,moveY,phase,t,sneak,paused,strikeX,strikeY,ack] of rows){
    const p=w.players.find(p=>p.seat===seat);if(!p||!PHASES[phase]||x<0||x>WIDTH||y<0||y>HEIGHT||Math.abs(angle)>Math.PI+.01||Math.abs(move)>1||Math.abs(moveY)>1||!Number.isSafeInteger(ack))continue;
    Object.assign(p,{x,y,angle,move,moveY,t,sneak:!!sneak,paused:!!paused,strikeX,strikeY,ack:Math.max(p.ack,ack)});
    if(p.bug||!['catch','result'].includes(PHASES[phase]))p.phase=PHASES[phase];
  }
  w.tick=tick;syncBugs(w);return true;
}
export interface WorldChunk {kind:'insect-world-v3';tick:number;index:number;total:number;data:string;q?:Quick}
/** Slice budget in JSON-escaped bytes, leaving room for the quick block and the room envelope. */
const CHUNK_BYTES=820;
const escapedBytes=(ch:string)=>new TextEncoder().encode(JSON.stringify(ch)).length-2;
/**
 * A bounded, independently reassembled snapshot cycle, one slice per packet. Every packet also
 * carries the quick block, so motion stays at the send rate while the full world trickles in.
 * Each datagram stays below 1400 UTF-8 bytes.
 */
export class WorldSender {
  private chunks:string[]=[];private index=0;private tick=0;
  next(w:InsectWorld):WorldChunk {
    if(this.index>=this.chunks.length){const raw=encode(w);this.chunks=[];let chunk='',bytes=0;for(const ch of raw){const n=escapedBytes(ch);if(bytes+n>CHUNK_BYTES){this.chunks.push(chunk);chunk='';bytes=0;}chunk+=ch;bytes+=n;}if(chunk)this.chunks.push(chunk);this.index=0;this.tick=w.tick;}
    const index=this.index++;return {kind:'insect-world-v3',tick:this.tick,index,total:this.chunks.length,data:this.chunks[index],q:encodeQuick(w)};
  }
}
export class WorldReceiver {
  private batches=new Map<number,{total:number;parts:Map<number,string>}>();
  accept(raw:unknown):InsectWorld|undefined {
    const p=raw as WorldChunk;
    if(!p||p.kind!=='insect-world-v3'||!Number.isSafeInteger(p.tick)||p.tick<0||!Number.isInteger(p.total)||p.total<1||p.total>32||!Number.isInteger(p.index)||p.index<0||p.index>=p.total||typeof p.data!=='string'||p.data.length>1050)return;
    let b=this.batches.get(p.tick);if(!b){b={total:p.total,parts:new Map()};this.batches.set(p.tick,b);if(this.batches.size>3)this.batches.delete(this.batches.keys().next().value!);}
    if(b.total!==p.total)return;b.parts.set(p.index,p.data);if(b.parts.size!==b.total)return;
    this.batches.delete(p.tick);const world=decode(Array.from({length:b.total},(_,i)=>b!.parts.get(i)).join(''));
    return world?.tick===p.tick?world:undefined;
  }
}
