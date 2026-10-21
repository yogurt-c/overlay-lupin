import { SPECIES_BY_ID, validCatch } from '../../../shared/fishing.js';
import type { FishingSave, FishCatch, FishingAction, FishingReply } from '../../../shared/fishing.js';
import type { GameMatch, GameModule, Viewport } from '../types.js';
import { FishingEngine, emptyWorld, WIDTHS } from './engine.js';
import type { Command, Fisher, FishingWorld } from './engine.js';
import { createInputSource } from './input.js';
import type { FishingInput } from './input.js';
import { drawFishing } from './draw.js';
import { FishingUi } from './ui.js';

export function validWorld(value: unknown): value is FishingWorld {
  if(!value||typeof value!=='object')return false;
  const w=value as FishingWorld;
  return Number.isSafeInteger(w.tick)&&w.tick>=0&&Array.isArray(w.players)&&w.players.length<=6&&
    new Set(w.players.map(p=>p?.id)).size===w.players.length&&new Set(w.players.map(p=>p?.seat)).size===w.players.length&&w.players.every(p=>
      p&&typeof p.id==='string'&&p.id.length<=120&&typeof p.name==='string'&&p.name.length<=24&&Number.isInteger(p.seat)&&p.seat>=0&&p.seat<6&&
      ['idle','casting','waiting','bite','fight','result'].includes(p.phase)&&[p.time,p.pos,p.target,p.progress,p.seed,p.emoji,p.emojiUntil,p.showUntil,p.ack,p.attempts,p.lastInput].every(Number.isFinite)&&
      p.pos>=0&&p.pos<=1&&p.target>=0&&p.target<=1&&p.progress>=0&&p.progress<=100&&typeof p.notice==='string'&&p.notice.length<200&&
      (!p.fish||validCatch(p.fish))&&(!p.shown||validCatch(p.shown))&&(!['casting','fight','result','bite','waiting'].includes(p.phase)||!!p.fish)&&
      Array.isArray(p.known)&&p.known.length<=120&&p.known.every(id=>SPECIES_BY_ID.has(id)));
}
export class FishingMatch implements GameMatch {
  private engine: FishingEngine | null; private world=emptyWorld(); private commands:Command[]=[];private seq=0;
  private held=false;private ui?:FishingUi;private save:FishingSave={version:1,profileId:'',catches:[]};
  private ready=false;private saving=false;private pending?:FishCatch;private savedId='';private disposed=false;private closed=false;private previewPos=.5;
  private known:string[]=[];private retryAt=0;private loadError='';
  constructor(private isHost:boolean,private myId:string,private myName:string,private solo=false){
    this.engine=isHost?new FishingEngine():null;this.engine?.ensure(myId,myName);
    if(typeof document!=='undefined'){
      this.ui=new FishingUi({cancel:()=>this.command('cancel'),open:()=>this.open(),emoji:value=>this.command('emoji',{value}),
        release:id=>void this.mutate({kind:'release',id}),favorite:id=>void this.mutate({kind:'favorite',id}),show:fish=>{this.command('show',{fish});this.ui?.message('물고기를 친구들에게 보여줬어요');},retry:()=>void this.persist(),export:()=>void this.transfer('export'),import:()=>void this.transfer('import'),continueSolo:()=>this.continueSolo()},this.solo);
      void this.load();
    }
  }
  private refreshKnown():void{this.known=[...new Set(this.save.catches.map(c=>c.speciesId))];}
  private async load():Promise<void>{
    try{const reply=await window.overlayLupin.fishingLoad();if(!reply.ok||!reply.data)throw new Error(reply.error||'수집함을 불러오지 못했어요');this.save=reply.data;this.refreshKnown();this.ready=true;this.ui?.update(this.save);}
    catch(e){this.loadError=String(e);this.ui?.message('수집함 로드 실패. 수집함의 가져오기로 복구하거나 다시 시작해 주세요. '+this.loadError);}
  }
  private async mutate(action:FishingAction):Promise<void>{
    try{const r=await window.overlayLupin.fishingAct(action);if(!r.ok||!r.data)throw new Error(r.error);this.save=r.data;this.refreshKnown();this.ui?.update(this.save);if(action.kind==='release')this.ui?.message('물고기를 물로 돌려보냈어요. 도감 기록은 남아 있어요.');}
    catch(e){this.ui?.message('저장 실패: '+String(e));}
  }
  private async transfer(kind:'export'|'import'):Promise<void>{
    try{const r: FishingReply=await (kind==='export'?window.overlayLupin.fishingExport():window.overlayLupin.fishingImport());if(r.cancelled){this.ui?.open();return;}if(!r.ok)throw new Error(r.error||'파일 처리 실패');if(r.data){this.save=r.data;this.refreshKnown();this.ready=true;this.ui?.update(this.save);}this.ui?.open();this.ui?.message(kind==='export'?'백업 파일을 내보냈어요':'수집 데이터를 합쳤어요');}
    catch(e){this.ui?.open();this.ui?.message(String(e));}
  }
  private async persist():Promise<void>{
    if(!this.pending||this.saving)return;this.saving=true;const fish=this.pending;
    try{
      const previous=this.save.catches.filter(c=>c.speciesId===fish.speciesId);const max=previous.reduce((n,c)=>Math.max(n,c.sizeMm),0);
      const r=await window.overlayLupin.fishingAct({kind:'catch',fish});if(!r.ok||!r.data)throw new Error(r.error||'저장 실패');
      this.save=r.data;this.refreshKnown();this.ready=true;this.savedId=fish.id;this.pending=undefined;this.command('saved',{catchId:fish.id});
      if(!this.disposed){this.ui?.update(this.save);if(this.closed)this.ui?.roomClosed();else this.ui?.caught(fish,previous.length===0?'새로운 물고기 발견! 수집함에 저장했어요.':fish.sizeMm>max?'개인 최대 크기 갱신! 수집함에 저장했어요.':'수집함에 저장했어요.');}
    }catch(e){if(!this.disposed)this.ui?.caught(fish,'아직 저장되지 않았어요. '+String(e),true);this.retryAt=Date.now()+5000;}
    finally{this.saving=false;}
  }
  private command(kind:Command['kind'],extra:Partial<Command>={}):void{
    if(this.disposed||this.closed||this.commands.length>=32||(this.solo&&kind==='show'))return;
    this.commands.push({...extra,kind,seq:++this.seq});
  }
  private me():Fisher|undefined{return (this.engine?.world??this.world).players.find(p=>p.id===this.myId);}
  private cast():void{if(this.ready&&!this.closed&&!this.ui?.opened&&!this.pending)this.command('cast');}
  private open():void{const phase=this.me()?.phase;if(this.pending){void this.persist();return;}if(phase&&['casting','waiting','bite','fight'].includes(phase))this.ui?.confirmOpen();else this.ui?.open();}
  setMembers(members:{id:string;name:string}[]):void{if(this.engine)for(const m of members)this.engine.ensure(m.id,m.name);}
  removePeer(id:string):void{this.engine?.remove(id);}
  step(raw:unknown):void{
    if(this.disposed)return;const i=raw as FishingInput|undefined;
    if(i?.cancel){this.held=false;if(this.ui?.opened&&!this.pending)this.ui.close();this.command('cancel');}
    if(i?.collection)this.open();if(i?.emotes)this.ui?.toggleEmotes();if(i&&i.emoji>=0&&this.ui?.emotesOpen){this.command('emoji',{value:i.emoji});this.ui.toggleEmotes();}
    if(i?.cast&&!this.ui?.resultSpace())this.cast();this.held=!this.ui?.opened&&!this.closed&&!!i?.held;
    const known=this.known;
    if(this.engine){const me=this.me();if(me)me.known=known;this.engine.input(this.myId,this.held,this.commands);this.engine.step();}
    const me=this.me();if(me){
      this.commands=this.commands.filter(c=>c.seq>me.ack);
      if(me.phase==='result'&&me.fish&&me.fish.id!==this.savedId&&!this.pending){this.pending={...me.fish};void this.persist();}
      if(!this.engine&&me.phase==='fight'&&me.fish){const width=WIDTHS[SPECIES_BY_ID.get(me.fish.speciesId)!.rarity];this.previewPos=Math.max(width/2,Math.min(1-width/2,this.previewPos+(this.held?1:-1)*.58/60));this.previewPos+=(me.pos-this.previewPos)*.12;}
      else this.previewPos=me.pos;
    }
    if(this.pending&&!this.saving&&this.retryAt&&Date.now()>this.retryAt){this.retryAt=0;void this.persist();}
  }
  render(ctx:CanvasRenderingContext2D,viewport:Viewport):void{drawFishing(ctx,viewport,this.engine?.world??this.world,this.myId,this.ui?.hideEmotes??false,this.engine?undefined:this.previewPos,this.solo);}
  hud(){const w=this.engine?.world??this.world;return{status:this.solo?'낚시':`낚시 · ${w.players.length}/6`,banner:'',bannerKind:''};}
  isOver():boolean{return false;}
  buildOutgoingPacket():unknown{
    if(this.engine)return {kind:'fishing-world',world:this.engine.snapshot()};
    return {kind:'fishing-input',name:this.myName,held:this.held,commands:this.commands,known:this.known};
  }
  applyOpponentPacket(raw:unknown):void{
    if(this.closed||!raw||typeof raw!=='object')return;
    const p=raw as {kind?:string;from?:string;name?:string;held?:boolean;commands?:Command[];known?:string[];world?:FishingWorld};
    if(this.engine){
      if(p.kind!=='fishing-input'||typeof p.from!=='string'||typeof p.name!=='string'||typeof p.held!=='boolean'||!Array.isArray(p.commands)||p.commands.length>32)return;
      // Only roster-authorized members may mutate the hosted simulation.
      const member=this.engine.world.players.find(m=>m.id===p.from);if(!member)return;
      if(Array.isArray(p.known)&&p.known.length<=120&&p.known.every(id=>SPECIES_BY_ID.has(id)))member.known=p.known;
      const commands=p.commands.filter(c=>c&&(!c.fish||validCatch(c.fish)));
      this.engine.input(p.from,p.held,commands);
    }else if(p.kind==='fishing-world'&&validWorld(p.world)&&p.world.tick>this.world.tick){this.world=structuredClone(p.world);}
  }
  roomClosed():void{
    // Finish persisting any received success even after the room goes away.
    const me=this.me();if(me?.phase==='result'&&me.fish&&me.fish.id!==this.savedId&&!this.pending){this.pending={...me.fish};void this.persist();}
    this.closed=true;this.held=false;this.ui?.roomClosed();
  }
  private continueSolo():void{if(this.pending){void this.persist();return;}this.ui?.close();this.closed=false;this.solo=true;this.ui?.setSolo(true);this.isHost=true;this.engine=new FishingEngine();this.engine.ensure(this.myId,this.myName);this.commands=[];this.seq=0;}
  canLeave():boolean{if(this.pending||this.saving){this.ui?.message('잡은 물고기를 저장하는 중입니다. 저장 완료 후 나가 주세요.');return false;}return true;}
  dispose():void{this.disposed=true;this.ui?.dispose();}
}
export const fishingModule:GameModule={id:'fishing',label:'낚시',hint:'Space 던지기·챔질 · 누르면 오른쪽, 떼면 왼쪽 · C 수집함 · E 감정표현 · 최대 6명 · 잡은 물고기는 이 기기에 영구 저장',matching:'room',roomCapacity:6,
  createMatch:(isHost,id,name)=>new FishingMatch(isHost,id,name),createSoloMatch:(id,name)=>new FishingMatch(true,id,name,true),createInputSource};
