import { RARITIES, SPECIES, SPECIES_BY_ID } from '../../../shared/fishing.js';
import type { FishingSave, FishCatch, Species } from '../../../shared/fishing.js';
import { drawEmoteIcon, drawFish, EMOTES, RARITY_INK } from './draw.js';
export interface FishingUiActions {
  cancel():void; open():void; emoji(value:number):void;
  release(id:string):void; favorite(id:string):void; show(fish:FishCatch):void; retry():void; export():void; import():void; continueSolo():void;
}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K] { const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n; }
function button(text:string,click:()=>void,className?:string):HTMLButtonElement {const n=el('button',text,className);n.type='button';n.onclick=click;return n;}
/** Space is mashed during the fight, so a fresh success popup ignores it briefly instead of vanishing unseen. */
const PAGE_SIZE=6, TOAST_MS=3500, RESULT_LOCK_MS=800;
const cm=(mm:number)=>`${(mm/10).toFixed(1)}cm`;
const specimenNo=(s:Species)=>`No.${String(SPECIES.indexOf(s)+1).padStart(3,'0')}`;
const CSS = `
#fishing-ui{--paper:#fffdf7;--paper-2:#f4eee2;--ink:#14181a;--muted:#6b6f68;--line:#ddd5c5;--accent:#7a5433;
  position:absolute;inset:30px 7px 7px;pointer-events:none;color:var(--ink);font:10px Menlo,Consolas,sans-serif;z-index:4}
#fishing-ui [hidden]{display:none!important}
#fishing-ui button,#fishing-ui select,#fishing-ui input{font:inherit;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:5px;padding:3px 5px;min-height:22px;max-width:100%;-webkit-app-region:no-drag;pointer-events:auto;box-sizing:border-box}
#fishing-ui button{cursor:pointer;transition:transform 120ms ease,box-shadow 120ms ease,background 120ms ease,border-color 120ms ease}
#fishing-ui button:hover{border-color:var(--accent);background:var(--paper-2)}
#fishing-ui button:active{transform:translateY(1px)}
#fishing-ui button:focus-visible,#fishing-ui select:focus-visible,#fishing-ui input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
#fishing-ui button:disabled{opacity:.4;cursor:default;transform:none}
#fishing-ui .fish-tools{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
/* Top right, inset past the shell's status dot so the two never touch. */
#fishing-ui .fish-top{position:absolute;top:-26px;right:12px}
#fishing-ui .fish-top button{border:1.3px solid var(--ink);border-radius:999px;padding:2px 9px;box-shadow:0 2px 0 var(--ink)}
#fishing-ui .fish-top button:hover{transform:translateY(-1px);box-shadow:0 3px 0 var(--ink);background:var(--paper)}
#fishing-ui .fish-top button:active{transform:translateY(2px);box-shadow:0 0 0 var(--ink)}

#fishing-ui .fish-panel{position:absolute;inset:0 2px 31px 0;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;padding:0 8px 4px;overflow:auto;scrollbar-width:thin;pointer-events:auto;-webkit-app-region:no-drag;
  background:repeating-linear-gradient(180deg,transparent 0 17px,rgba(61,116,168,.07) 17px 18px),var(--paper);border:1.5px solid var(--ink);border-radius:10px;box-shadow:2px 3px 0 var(--ink)}
#fishing-ui .fish-panel h3{font-size:12px;margin:0}
#fishing-ui .fish-panel p{line-height:1.45;margin:0;overflow-wrap:anywhere}

#fishing-ui .fish-head{position:sticky;top:0;z-index:1;display:flex;align-items:flex-end;gap:2px;margin:0 -8px;padding:4px 8px 0;background:var(--paper);border-bottom:1.5px solid var(--ink)}
#fishing-ui .fish-tab{border:1.5px solid transparent;border-bottom:none;border-radius:7px 7px 0 0;background:transparent;color:var(--muted);padding:3px 10px;margin-bottom:-1.5px;min-height:24px}
#fishing-ui .fish-tab:hover{background:var(--paper-2);border-color:transparent;color:var(--ink)}
#fishing-ui .fish-tab[aria-selected="true"]{border-color:var(--ink);background:var(--paper);color:var(--ink);font-weight:700}
#fishing-ui .fish-tab sup{font-size:7.5px;margin-left:2px;color:var(--accent)}
#fishing-ui .fish-close{margin:0 0 4px 4px;border-radius:50%;width:22px;padding:0;border-color:transparent;background:transparent;font-size:12px}
#fishing-ui .fish-close:hover{border-color:var(--ink);background:var(--paper)}

#fishing-ui .fish-stats{display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin:0 0 5px auto;font-size:8.5px;color:var(--muted)}
#fishing-ui .fish-meter{width:64px;height:5px;border:1px solid var(--ink);border-radius:999px;overflow:hidden;background:var(--paper)}
#fishing-ui .fish-meter i{display:block;height:100%;background:repeating-linear-gradient(-45deg,var(--accent) 0 3px,#9a7350 3px 6px)}

#fishing-ui .fish-filters{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:3px}
#fishing-ui .fish-filters input{width:100%;min-width:0;padding-left:16px;background:var(--paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='none' stroke='%236b6f68' stroke-width='1.5'%3E%3Ccircle cx='4.2' cy='4.2' r='3'/%3E%3Cpath d='M6.5 6.5 9 9'/%3E%3C/svg%3E") 4px 50% no-repeat}
#fishing-ui .fish-filters button[aria-pressed="true"]{border-color:var(--accent);background:#f3e6d3;color:var(--accent)}

#fishing-ui .fish-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
#fishing-ui .fish-card{--rc:#7d857b;position:relative;display:flex;flex-direction:column;align-items:stretch;gap:1px;min-width:0;padding:0 0 3px;border:1px solid var(--line);border-top:3px solid var(--rc);border-radius:6px;background:var(--paper);text-align:left;overflow:hidden}
#fishing-ui .fish-card:hover{transform:translateY(-1px);border-color:var(--rc);box-shadow:0 2px 0 var(--rc);background:var(--paper)}
#fishing-ui .fish-card canvas{display:block;width:100%;height:auto;aspect-ratio:5/2;background:color-mix(in srgb,var(--rc) 9%,transparent)}
#fishing-ui .fish-line{display:flex;align-items:baseline;gap:3px;padding:0 5px}
#fishing-ui .fish-line span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#fishing-ui .fish-name{font-weight:700;font-size:9.5px;min-width:0}
#fishing-ui .fish-meta{font-size:8px;color:var(--muted);margin-left:auto;flex:none}
#fishing-ui .fish-card .fish-star{position:absolute;top:1px;right:0;color:var(--accent)}
#fishing-ui .fish-card.fish-unknown{border-style:dashed;border-top-style:solid}
#fishing-ui .fish-card.fish-unknown .fish-name{color:var(--muted);font-weight:400}

#fishing-ui .fish-foot{display:flex;align-items:center;gap:3px;margin-top:auto;font-size:9px;color:var(--muted)}#fishing-ui .fish-foot button{min-height:20px}
#fishing-ui .fish-foot .fish-page{min-width:34px;text-align:center}
#fishing-ui .fish-link{border-color:transparent;background:transparent;color:var(--muted);text-decoration:underline;text-underline-offset:2px;padding:2px 3px}
#fishing-ui .fish-link:hover{border-color:transparent;background:transparent;color:var(--accent)}
#fishing-ui .fish-foot .fish-link:first-of-type{margin-left:auto}
#fishing-ui .fish-empty{padding:14px 0;text-align:center;color:var(--muted)}

#fishing-ui .fish-chip{display:inline-block;padding:1px 6px;border:1px solid currentColor;border-radius:999px;font-size:8.5px;font-weight:700;line-height:1.4;transform:rotate(-2deg)}
#fishing-ui .fish-detail{display:grid;grid-template-columns:112px minmax(0,1fr);gap:8px;align-items:start}
#fishing-ui .fish-plate{position:relative;border:1.5px solid var(--ink);border-radius:8px;background:color-mix(in srgb,var(--rc) 11%,var(--paper));box-shadow:2px 2px 0 var(--rc);overflow:hidden}
#fishing-ui .fish-plate canvas{display:block;width:100%;height:auto;aspect-ratio:16/10}
#fishing-ui .fish-plate small{position:absolute;right:5px;top:2px;font-size:8px;color:var(--muted)}
#fishing-ui .fish-info{display:flex;flex-direction:column;gap:4px;min-width:0}
#fishing-ui .fish-info .fish-desc{font-size:9px;color:#3c403b}
#fishing-ui .fish-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin:0}
#fishing-ui .fish-facts div{border:1px solid var(--line);border-radius:5px;padding:2px 4px;background:var(--paper)}
#fishing-ui .fish-facts dt{font-size:7.5px;color:var(--muted)}#fishing-ui .fish-facts dd{margin:0;font-weight:700;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#fishing-ui .fish-actions{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
#fishing-ui .fish-danger{color:#a3392d;border-color:#e2b4ab}#fishing-ui .fish-danger:hover{border-color:#a3392d;background:#fbeeeb}
#fishing-ui .fish-confirm{padding:6px;border:1px dashed #a3392d;border-radius:6px;background:#fdf4f1}

#fishing-ui .fish-panel.fish-result{inset:auto;top:50%;left:50%;transform:translate(-50%,-50%);width:212px;max-width:calc(100% - 24px);max-height:calc(100% - 24px);text-align:center;padding:9px;gap:3px;align-items:center;box-shadow:3px 4px 0 var(--ink)}
#fishing-ui .fish-result h3{font-size:12px}
#fishing-ui .fish-result p{font-size:9px;line-height:1.35}
#fishing-ui .fish-result canvas{width:150px;height:auto;aspect-ratio:16/9}
#fishing-ui .fish-result button{font-size:9px;margin:2px}
#fishing-ui .fish-result .fish-name{font-size:11px}
#fishing-ui .fish-locked{opacity:.35}#fishing-ui .fish-hint{transition:opacity 200ms ease}
#fishing-ui kbd{font:inherit;font-size:8.5px;padding:0 4px;border:1px solid var(--ink);border-radius:3px;box-shadow:0 1px 0 var(--ink);background:var(--paper)}

#fishing-ui .fish-toast{z-index:3;position:absolute;left:50%;bottom:36px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;width:max-content;max-width:calc(100% - 16px);box-sizing:border-box;padding:5px 5px 5px 9px;
  background:var(--ink);color:var(--paper);border-radius:7px;font-size:9.5px;line-height:1.4;pointer-events:auto;-webkit-app-region:no-drag;box-shadow:0 4px 10px -4px rgba(20,24,26,.6);animation:fish-pop 180ms cubic-bezier(.16,1,.3,1)}
#fishing-ui .fish-toast button{background:transparent;color:var(--paper);border-color:transparent;min-height:18px;padding:0 5px}
#fishing-ui .fish-toast button:hover{background:rgba(255,255,255,.12);border-color:transparent}
#fishing-ui .fish-emotes{--tx:-50%;position:absolute;bottom:34px;left:50%;transform:translateX(-50%);flex-wrap:nowrap;gap:2px;padding:3px;background:var(--paper);border:1.5px solid var(--ink);border-radius:999px;box-shadow:0 3px 0 var(--ink);pointer-events:auto;-webkit-app-region:no-drag;animation:fish-pop 180ms cubic-bezier(.16,1,.3,1)}
#fishing-ui .fish-emote{position:relative;width:30px;height:30px;min-height:0;padding:0;border:0;border-radius:50%;background:transparent;display:grid;place-items:center}
#fishing-ui .fish-emote:hover{background:var(--paper-2);transform:translateY(-2px) scale(1.12)}
#fishing-ui .fish-emote:active{transform:scale(.92)}
#fishing-ui .fish-emote canvas{width:24px;height:24px;pointer-events:none}
#fishing-ui .fish-emote kbd{position:absolute;right:1px;bottom:0;padding:0;border:0;box-shadow:none;background:none;font:bold 7px Menlo,sans-serif;color:var(--muted);line-height:1}
#fishing-ui .fish-mute{min-height:0;height:22px;margin:0 3px 0 2px;padding:0 7px;border-radius:999px;border-color:var(--line);color:var(--muted);font-size:8.5px;white-space:nowrap}
#fishing-ui .fish-mute[aria-pressed="true"]{color:var(--paper);background:var(--ink);border-color:var(--ink)}
#fishing-ui .fish-muted{color:var(--muted)}
@keyframes fish-pop{from{opacity:0;transform:translate(var(--tx,0),4px)}}
#fishing-ui .fish-toast{--tx:-50%}
@media (prefers-reduced-motion:reduce){#fishing-ui *{animation:none!important;transition:none!important}}
`;
export class FishingUi {
  root: HTMLDivElement; panel:HTMLDivElement; private toast:HTMLDivElement; private emotes:HTMLDivElement;
  private save:FishingSave={version:1,profileId:'',catches:[]}; private tab:'collection'|'catalog'='collection';
  private query='';private rarity=-1;private sort='recent';private favorites=false;private page=0;private selected?:string;private confirmRelease=false;
  private result?:FishCatch;private resultNote='';private resultError=false; private mute=false; private toastTimer?:ReturnType<typeof setTimeout>;private lockTimer?:ReturnType<typeof setTimeout>;private lockedUntil=0;
  constructor(private actions:FishingUiActions,private solo=false){
    if(!document.getElementById('fishing-style')){const style=el('style');style.id='fishing-style';style.textContent=CSS;document.head.append(style);}
    this.root=el('div');this.root.id='fishing-ui';
    const top=el('div',undefined,'fish-tools fish-top');
    top.append(button('수집함',()=>actions.open()));
    this.panel=el('div',undefined,'fish-panel');this.panel.hidden=true;
    this.toast=el('div',undefined,'fish-toast');this.toast.hidden=true;this.toast.setAttribute('role','status');
    this.emotes=el('div',undefined,'fish-tools fish-emotes');this.emotes.hidden=true;
    EMOTES.forEach((name,i)=>this.emotes.append(this.emoteButton(name,i)));
    const mute=button('남 숨김',()=>{this.mute=!this.mute;mute.setAttribute('aria-pressed',String(this.mute));},'fish-mute');
    mute.title='다른 사람의 감정표현 숨기기';mute.setAttribute('aria-pressed','false');this.emotes.append(mute);
    this.root.append(top,this.toast,this.emotes,this.panel);
    // Electron resolves -webkit-app-region in DOM order and this root inherits the body's drag region.
    // Mounting it right after the canvas keeps every later shell control (leave, settings) clickable.
    const field=document.getElementById('field');
    if(field)field.after(this.root);else document.body.append(this.root);
  }
  private emoteButton(name:string,i:number):HTMLButtonElement{
    const b=button('',()=>{this.actions.emoji(i);this.emotes.hidden=true;},'fish-emote');b.title=`${i+1} ${name}`;b.setAttribute('aria-label',name);
    const art=el('canvas'),ratio=window.devicePixelRatio||1;art.width=art.height=24*ratio;
    const c=art.getContext('2d');if(c){c.scale(ratio*1.05,ratio*1.05);c.translate(11.4,11.6);drawEmoteIcon(c,i,30);}
    b.append(art,el('kbd',String(i+1)));return b;
  }
  get opened():boolean{return !this.panel.hidden;}
  get emotesOpen():boolean{return !this.emotes.hidden;}
  get hideEmotes():boolean{return this.mute;}
  toggleEmotes():void{this.emotes.hidden=!this.emotes.hidden;}
  update(save:FishingSave):void{this.save=save;if(this.opened&&!this.result)this.renderCollection();}
  setSolo(solo:boolean):void{this.solo=solo;}
  private compact(value:boolean,label='낚시 결과'):void{
    this.panel.classList.toggle('fish-result',value);
    if(value){this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-modal','true');this.panel.setAttribute('aria-label',label);}
    else{this.panel.removeAttribute('role');this.panel.removeAttribute('aria-modal');this.panel.removeAttribute('aria-label');}
  }
  message(text:string):void{
    const close=button('✕',()=>this.toast.hidden=true);close.setAttribute('aria-label','닫기');
    this.toast.replaceChildren(el('span',text),close);this.toast.hidden=false;
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>this.toast.hidden=true,TOAST_MS);
  }
  open():void{this.compact(false);this.result=undefined;this.selected=undefined;this.confirmRelease=false;this.panel.hidden=false;this.emotes.hidden=true;this.toast.hidden=true;this.renderCollection();}
  close():void{if(this.resultError)return;this.panel.hidden=true;this.result=undefined;this.selected=undefined;}
  confirmOpen():void{
    this.compact(true,'수집함 열기');this.panel.hidden=false;
    this.panel.replaceChildren(el('h3','낚시 중이에요'),el('p','이번 낚시를 취소하고 수집함을 열까요?'),this.row(button('취소하고 열기',()=>{this.actions.cancel();this.open();}),button('계속 낚시',()=>this.close())));
  }
  caught(fish:FishCatch,note:string,error=false):void{this.result=fish;this.resultNote=note;this.resultError=error;this.lockedUntil=Date.now()+RESULT_LOCK_MS;this.panel.hidden=false;this.renderResult();}
  /** Consume this press so closing a result never casts a new line as well. */
  resultSpace():boolean{
    if(!this.opened||!this.result)return false;
    if(Date.now()<this.lockedUntil)return true;
    if(this.resultError)this.actions.retry();else this.close();
    return true;
  }
  /** B on a success popup brags the fresh catch and closes the popup; returns the fish to show, if any. */
  resultBrag():FishCatch|undefined{
    const fish=this.result;if(this.solo||!this.opened||!fish||this.resultError)return undefined;
    this.close();return fish;
  }
  private row(...children:HTMLElement[]):HTMLDivElement{const n=el('div',undefined,'fish-actions');n.style.justifyContent='center';n.append(...children);return n;}
  private chip(s:Species):HTMLSpanElement{const n=el('span',RARITIES[s.rarity],'fish-chip');n.style.color=RARITY_INK[s.rarity];return n;}
  /** Undiscovered species render as a flat silhouette so the catalog teases the shape without spoiling it. */
  private art(sid:string,known=true,height=90,size=100):HTMLCanvasElement{
    const c=el('canvas');c.width=160;c.height=height;const s=SPECIES_BY_ID.get(sid);if(!s)return c;
    // Fins and fantasy horns rise above the body, so the fish sits a little below centre.
    const ctx=c.getContext('2d')!;drawFish(ctx,s,80,height*.55,size);
    if(!known){ctx.globalCompositeOperation='source-in';ctx.fillStyle='rgba(107,111,104,.32)';ctx.fillRect(0,0,c.width,c.height);}
    return c;
  }
  private renderResult():void{
    this.compact(true);this.toast.hidden=true;this.emotes.hidden=true;
    const fish=this.result;if(!fish)return;const s=SPECIES_BY_ID.get(fish.speciesId)!;
    const hint=el('p',undefined,'fish-muted fish-hint');hint.append(el('kbd','Space'),` ${this.resultError?'저장 다시 시도':'닫기'}`);if(!this.resultError&&!this.solo)hint.append(' · ',el('kbd','B'),' 자랑하기');
    const wait=this.lockedUntil-Date.now();clearTimeout(this.lockTimer);
    if(wait>0){hint.classList.add('fish-locked');this.lockTimer=setTimeout(()=>hint.classList.remove('fish-locked'),wait);}
    this.panel.replaceChildren(el('h3',this.resultError?'저장 재시도 필요':'낚시 성공!'),this.chip(s),this.art(s.id,true,90,105),el('p',`${s.name} · ${cm(fish.sizeMm)}`,'fish-name'),el('p',this.resultNote),hint);
  }
  roomClosed():void{this.compact(true,'낚시방 종료');this.panel.hidden=false;this.panel.replaceChildren(el('h3','낚시방이 닫혔어요'),el('p','저장한 물고기는 그대로 남아 있어요.'),this.row(button('혼자 계속하기',()=>{this.actions.continueSolo();})));}
  private header():HTMLDivElement{
    const head=el('div',undefined,'fish-head');head.setAttribute('role','tablist');
    const tab=(name:'collection'|'catalog',text:string)=>{const b=button(text,()=>{this.tab=name;this.selected=undefined;this.page=0;this.renderCollection();},'fish-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(this.tab===name));return b;};
    const close=button('✕',()=>this.close(),'fish-close');close.setAttribute('aria-label','닫기');
    const owned=this.save.catches.filter(c=>!c.released).length,seen=new Set(this.save.catches.map(c=>c.speciesId)).size;
    const mine=tab('collection','수집함');if(owned){const n=el('sup',String(owned));n.setAttribute('aria-label',`${owned}마리 보관`);mine.append(n);}
    const stats=el('div',undefined,'fish-stats'),meter=el('div',undefined,'fish-meter'),fill=el('i');
    fill.style.width=`${seen/SPECIES.length*100}%`;meter.append(fill);meter.setAttribute('role','progressbar');meter.setAttribute('aria-valuenow',String(seen));meter.setAttribute('aria-valuemax',String(SPECIES.length));meter.setAttribute('aria-label','도감 완성도');
    stats.append(el('span',`발견 ${seen}/${SPECIES.length}종`),meter);
    head.append(mine,tab('catalog','도감'),stats,close);return head;
  }
  private renderCollection():void{
    this.compact(false);
    this.panel.replaceChildren(this.header());
    if(this.selected){this.detail(this.selected);return;}
    const controls=el('div',undefined,'fish-filters');const search=el('input');search.placeholder='이름 검색';search.setAttribute('aria-label','물고기 이름 검색');search.value=this.query;
    search.oninput=()=>{this.query=search.value;this.page=0;this.renderRows();};controls.append(search);
    const rarity=el('select');rarity.setAttribute('aria-label','등급 필터');['전체',...RARITIES].forEach((t,i)=>{const o=el('option',t);o.value=String(i-1);rarity.append(o);});rarity.value=String(this.rarity);rarity.onchange=()=>{this.rarity=Number(rarity.value);this.page=0;this.renderRows();};controls.append(rarity);
    const sort=el('select');sort.setAttribute('aria-label','정렬');[['recent','최근'],['size','크기'],['rarity','등급'],['name','이름']].forEach(([v,t])=>{const o=el('option',t);o.value=v;sort.append(o);});sort.value=this.sort;sort.onchange=()=>{this.sort=sort.value;this.page=0;this.renderRows();};controls.append(sort);
    const fav=button(this.favorites?'★':'☆',()=>{this.favorites=!this.favorites;this.page=0;this.renderCollection();});fav.title='즐겨찾기만 보기';fav.setAttribute('aria-label','즐겨찾기만 보기');fav.setAttribute('aria-pressed',String(this.favorites));
    controls.append(fav);this.panel.append(controls);
    const rows=el('div');rows.dataset.rows='true';rows.style.display='contents';this.panel.append(rows);this.renderRows();
  }
  private renderRows():void{
    const container=this.panel.querySelector('[data-rows]');if(!container)return;container.replaceChildren();
    const records=new Map<string,FishCatch[]>();for(const c of this.save.catches){const a=records.get(c.speciesId)??[];a.push(c);records.set(c.speciesId,a);}
    let items:{s:Species;fish?:FishCatch}[]=this.tab==='catalog'?SPECIES.map(s=>({s})):this.save.catches.filter(c=>!c.released).map(fish=>({s:SPECIES_BY_ID.get(fish.speciesId)!,fish}));
    items=items.filter(({s,fish})=>(records.has(s.id)?s.name.includes(this.query):!this.query)&&(this.rarity<0||s.rarity===this.rarity)&&(!this.favorites||(fish?fish.favorite:records.get(s.id)?.some(c=>!c.released&&c.favorite))));
    items.sort((a,b)=>this.sort==='size'?(b.fish?.sizeMm??0)-(a.fish?.sizeMm??0):this.sort==='rarity'?b.s.rarity-a.s.rarity:this.sort==='name'?a.s.name.localeCompare(b.s.name): (b.fish?.caughtAt??'').localeCompare(a.fish?.caughtAt??''));
    const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));this.page=Math.min(this.page,pages-1);
    const grid=el('div',undefined,'fish-grid');
    for(const {s,fish} of items.slice(this.page*PAGE_SIZE,this.page*PAGE_SIZE+PAGE_SIZE))grid.append(this.card(s,fish,records.get(s.id)));
    container.append(grid);
    if(!items.length)container.append(el('p',this.tab==='collection'&&!this.save.catches.length?'아직 물고기가 없어요. 낚싯대를 던져 보세요.':'조건에 맞는 물고기가 없어요.','fish-empty'));
    const foot=el('div',undefined,'fish-foot');
    const prev=button('‹',()=>{this.page--;this.renderRows();});prev.setAttribute('aria-label','이전 쪽');prev.disabled=this.page===0;
    const next=button('›',()=>{this.page++;this.renderRows();});next.setAttribute('aria-label','다음 쪽');next.disabled=this.page>=pages-1;
    const exp=button('내보내기',()=>this.actions.export(),'fish-link');exp.title='이 기기에 저장됩니다. 기기 이동 전 내보내기로 백업하세요.';
    const imp=button('가져오기',()=>this.importScreen(),'fish-link');
    foot.append(prev,el('span',`${this.page+1}/${pages}`,'fish-page'),next,exp,imp);container.append(foot);
  }
  private card(s:Species,fish:FishCatch|undefined,records:FishCatch[]|undefined):HTMLButtonElement{
    const known=!!records;
    const card=button('',()=>{this.selected=fish?.id??s.id;this.renderCollection();},'fish-card');card.style.setProperty('--rc',RARITY_INK[s.rarity]);
    if(!known)card.classList.add('fish-unknown');
    const best=records?.reduce((n,c)=>Math.max(n,c.sizeMm),0)??0;
    const text=el('div',undefined,'fish-line');text.append(el('span',known?s.name:'미발견','fish-name'),el('span',fish?cm(fish.sizeMm):known?cm(best):specimenNo(s),'fish-meta'));
    card.append(this.art(s.id,known,64,78),text);
    if(fish?.favorite)card.append(el('span','★','fish-star'));
    card.setAttribute('aria-label',`${known?s.name:'미발견 물고기'}, ${RARITIES[s.rarity]}${fish?`, ${cm(fish.sizeMm)}`:''}`);
    return card;
  }
  private importScreen():void{
    this.panel.replaceChildren(this.header(),el('h3','수집 데이터 가져오기'),el('p','선택한 파일을 현재 수집함과 합칩니다. 방생 기록은 유지하고, 가져오기 전 백업을 남깁니다.'),
      el('p','이 기기에 저장됩니다. 기기 이동 전 내보내기로 백업하세요.','fish-muted'),this.row(button('파일 선택',()=>this.actions.import()),button('돌아가기',()=>this.renderCollection())));
  }
  private detail(id:string):void{
    const fish=this.save.catches.find(c=>c.id===id),s=SPECIES_BY_ID.get(fish?.speciesId??id);if(!s){this.selected=undefined;this.renderCollection();return;}
    const records=this.save.catches.filter(c=>c.speciesId===s.id),known=records.length>0;
    const sheet=el('div',undefined,'fish-detail');sheet.style.setProperty('--rc',RARITY_INK[s.rarity]);
    const plate=el('div',undefined,'fish-plate');plate.append(this.art(s.id,known,100,100),el('small',specimenNo(s)));
    const info=el('div',undefined,'fish-info'),tags=el('div',undefined,'fish-actions');
    tags.append(this.chip(s),el('span',s.fantasy?'창작종':'현실종','fish-muted'));
    info.append(el('h3',known?s.name:'미발견 물고기'),tags,el('p',known?s.description:'이 낚시터에서 만날 수 있어요.','fish-desc'));
    sheet.append(plate,info);this.panel.append(sheet);
    if(known){
      const facts=el('dl',undefined,'fish-facts');
      for(const [k,v] of [['누적',`${records.length}마리`],['최대',cm(records.reduce((n,c)=>Math.max(n,c.sizeMm),0))],['첫 발견',records.map(c=>c.caughtAt).sort()[0].slice(0,10)]]){const d=el('div');d.append(el('dt',k),el('dd',v));facts.append(d);}
      this.panel.append(facts);
    }
    const actions=el('div',undefined,'fish-actions');
    actions.append(button('‹ 목록으로',()=>{this.selected=undefined;this.confirmRelease=false;this.renderCollection();}));
    if(fish&&!fish.released){
      this.panel.append(el('p',`이 개체 · ${cm(fish.sizeMm)} · ${new Date(fish.caughtAt).toLocaleString()}${fish.sizeMm>=s.minMm+.95*(s.maxMm-s.minMm)?' · 월척':''}`,'fish-muted'));
      if(this.confirmRelease){
        const box=el('div',undefined,'fish-confirm');
        box.append(el('p',`${s.name} ${cm(fish.sizeMm)}를 풀어줄까요? 되돌릴 수 없으며 도감과 최대 기록은 남아요.`),this.row(button('풀어주기 확인',()=>{this.confirmRelease=false;this.selected=undefined;this.actions.release(fish.id);},'fish-danger'),button('취소',()=>{this.confirmRelease=false;this.renderCollection();})));
        this.panel.append(box);
      }else{
        actions.append(button(fish.favorite?'★ 잠금 해제':'☆ 즐겨찾기',()=>this.actions.favorite(fish.id)));
        if(!this.solo)actions.append(button('자랑하기',()=>{this.close();this.actions.show(fish);}));
        const release=button('풀어주기',()=>{this.confirmRelease=true;this.renderCollection();},'fish-danger');release.disabled=fish.favorite;if(fish.favorite)release.title='즐겨찾기를 해제하면 풀어줄 수 있어요';actions.append(release);
      }
    }
    this.panel.append(actions);
  }
  dispose():void{clearTimeout(this.toastTimer);clearTimeout(this.lockTimer);this.root.remove();}
}
