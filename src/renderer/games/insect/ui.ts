import { ENV_NAMES, ENVS, RARITIES, SAVE_VERSION, SPECIES, SPECIES_BY_ID } from '../../../shared/insect.js';
import type { Env, InsectCatch, InsectSave, Species } from '../../../shared/insect.js';
import { CSS as FISHING_CSS } from '../fishing/ui.js';
import { drawEmoteIcon, EMOTES } from '../fishing/draw.js';
import { drawInsect, SIDE_VIEW } from './art.js';
import { RARITY_INK } from './draw.js';
export interface InsectUiActions {
  open(): void; emoji(value: number): void; release(id: string): void; favorite(id: string): void; show(bug: InsectCatch): void;
  retry(): void; export(): void; import(): void; continueSolo(): void;
}
/** What the fresh catch earned, shown as stamps on the result card. */
export interface Badges { first: boolean; record: boolean; goldFirst: boolean }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; }
function button(text: string, click: () => void, className?: string): HTMLButtonElement { const n = el('button', text, className); n.type = 'button'; n.onclick = click; return n; }
const PAGE_SIZE = 6, TOAST_MS = 3500, CARD_MS = 3000, GOLD_CARD_MS = 5000, GOLD = '#c08416';
const cm = (mm: number) => `${(mm / 10).toFixed(1)}cm`;
const specimenNo = (s: Species) => `No.${String(SPECIES.indexOf(s) + 1).padStart(3, '0')}`;
const CSS = FISHING_CSS.replaceAll('#fishing-ui', '#insect-ui') + `
#insect-ui .bug-gold{--rc:${GOLD}!important;border-color:${GOLD}!important;box-shadow:0 0 0 1px ${GOLD} inset}
#insect-ui .bug-gold-chip{color:${GOLD};background:#fbf1d8}
#insect-ui .fish-card .bug-goldstar{position:absolute;top:1px;left:3px;color:${GOLD};font-size:10px}
#insect-ui .bug-card{position:absolute;top:2px;width:150px;max-width:calc(50% - 8px);display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 7px 7px;box-sizing:border-box;text-align:center;
  background:var(--paper);border:1.5px solid var(--ink);border-radius:9px;box-shadow:2px 3px 0 var(--ink);pointer-events:auto;cursor:pointer;-webkit-app-region:no-drag;animation:fish-pop 180ms cubic-bezier(.16,1,.3,1)}
#insect-ui .bug-card.bug-left{left:2px}#insect-ui .bug-card.bug-right{right:2px}
#insect-ui .bug-card.bug-gold-card{border-color:${GOLD};box-shadow:2px 3px 0 ${GOLD};background:linear-gradient(160deg,#fffaf0,#fbefcf)}
#insect-ui .bug-card h3{font-size:11px;margin:0}
#insect-ui .bug-card canvas{width:110px;height:auto;aspect-ratio:16/10}
#insect-ui .bug-card p{margin:0;font-size:9px;line-height:1.35}
#insect-ui .bug-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:3px}
#insect-ui .bug-badge{font-size:8px;font-weight:700;padding:0 5px;border:1px solid currentColor;border-radius:999px;transform:rotate(-2deg)}
`;
export class InsectUi {
  root: HTMLDivElement; panel: HTMLDivElement; private toast: HTMLDivElement; private emotes: HTMLDivElement; private card: HTMLDivElement;
  private save: InsectSave = { version: SAVE_VERSION, profileId: '', catches: [] }; private tab: 'collection' | 'catalog' = 'collection';
  private query = ''; private rarity = -1; private env = ''; private sort = 'recent'; private favorites = false; private goldOnly = false; private page = 0;
  private selected?: string; private confirmRelease = false; private showGold = false; private closing = false;
  private result?: InsectCatch; private resultError = false; private mute = false;
  private toastTimer?: ReturnType<typeof setTimeout>; private cardTimer?: ReturnType<typeof setTimeout>;
  constructor(private actions: InsectUiActions, private solo = false) {
    if (!document.getElementById('insect-style')) { const style = el('style'); style.id = 'insect-style'; style.textContent = CSS; document.head.append(style); }
    this.root = el('div'); this.root.id = 'insect-ui';
    const top = el('div', undefined, 'fish-tools fish-top');
    const collection = button('수집함', () => actions.open()); collection.title = '수집함 (C)'; top.append(collection);
    this.panel = el('div', undefined, 'fish-panel'); this.panel.hidden = true;
    this.card = el('div', undefined, 'bug-card'); this.card.hidden = true; this.card.setAttribute('role', 'status');
    this.card.onclick = () => { if (this.resultError) this.actions.retry(); else this.hideCard(); };
    this.toast = el('div', undefined, 'fish-toast'); this.toast.hidden = true; this.toast.setAttribute('role', 'status');
    this.emotes = el('div', undefined, 'fish-tools fish-emotes'); this.emotes.hidden = true;
    EMOTES.forEach((name, i) => this.emotes.append(this.emoteButton(name, i)));
    const mute = button('남 숨김', () => { this.mute = !this.mute; mute.setAttribute('aria-pressed', String(this.mute)); }, 'fish-mute');
    mute.title = '다른 사람의 감정표현 숨기기'; mute.setAttribute('aria-pressed', 'false'); this.emotes.append(mute);
    this.root.append(top, this.card, this.toast, this.emotes, this.panel);
    // Electron resolves -webkit-app-region in DOM order and this root inherits the body's drag region.
    // Mounting it right after the canvas keeps every later shell control (leave, settings) clickable.
    const field = document.getElementById('field');
    if (field) field.after(this.root); else document.body.append(this.root);
  }
  private emoteButton(name: string, i: number): HTMLButtonElement {
    const b = button('', () => { this.actions.emoji(i); this.emotes.hidden = true; }, 'fish-emote'); b.title = `${i + 1} ${name}`; b.setAttribute('aria-label', name);
    const art = el('canvas'), ratio = window.devicePixelRatio || 1; art.width = art.height = 24 * ratio;
    const c = art.getContext('2d'); if (c) { c.scale(ratio * 1.05, ratio * 1.05); c.translate(11.4, 11.6); drawEmoteIcon(c, i, 30); }
    b.append(art, el('kbd', String(i + 1))); return b;
  }
  get opened(): boolean { return !this.panel.hidden; }
  get emotesOpen(): boolean { return !this.emotes.hidden; }
  get hideEmotes(): boolean { return this.mute; }
  toggleEmotes(): void { this.emotes.hidden = !this.emotes.hidden; }
  update(save: InsectSave): void { this.save = save; if (this.opened && !this.closing) this.renderCollection(); }
  setSolo(solo: boolean): void { this.solo = solo; }
  message(text: string): void {
    const close = button('✕', () => this.toast.hidden = true); close.setAttribute('aria-label', '닫기');
    this.toast.replaceChildren(el('span', text), close); this.toast.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.toast.hidden = true, TOAST_MS);
  }
  private modal(value: boolean, label = ''): void {
    this.closing = value; this.panel.classList.toggle('fish-result', value);
    if (value) { this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-label', label); } else { this.panel.removeAttribute('role'); this.panel.removeAttribute('aria-label'); }
  }
  open(): void { this.modal(false); this.selected = undefined; this.confirmRelease = false; this.panel.hidden = false; this.emotes.hidden = true; this.toast.hidden = true; this.renderCollection(); }
  close(): void { this.panel.hidden = true; this.selected = undefined; this.modal(false); }
  private art(s: Species, opts: { known?: boolean; golden?: boolean; width?: number; height?: number; size?: number } = {}): HTMLCanvasElement {
    const { known = true, golden = false, width = 160, height = 100, size = 82 } = opts, c = el('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d')!; drawInsect(ctx, s, width / 2, height / 2, size, { detail: true, golden, frame: 0 }, SIDE_VIEW.has(s.plan));
    // Undiscovered species render as a flat silhouette so the catalog teases the shape without spoiling it.
    if (!known) { ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = 'rgba(107,111,104,.32)'; ctx.fillRect(0, 0, width, height); }
    return c;
  }
  private chip(s: Species): HTMLSpanElement { const n = el('span', RARITIES[s.rarity], 'fish-chip'); n.style.color = RARITY_INK[s.rarity]; return n; }
  private goldChip(): HTMLSpanElement { return el('span', '금색', 'fish-chip bug-gold-chip'); }
  /** Small card at the field edge away from me, so it never hides insects I'm walking toward. Gameplay keeps going under it. */
  caught(bug: InsectCatch, badges: Badges, leftSide: boolean, error = ''): void {
    const s = SPECIES_BY_ID.get(bug.speciesId); if (!s) return;
    this.result = bug; this.resultError = !!error;
    this.card.className = `bug-card ${leftSide ? 'bug-left' : 'bug-right'}${bug.golden ? ' bug-gold-card' : ''}`;
    const tags = el('div', undefined, 'bug-badges');
    const badge = (text: string, color: string) => { const b = el('span', text, 'bug-badge'); b.style.color = color; tags.append(b); };
    if (bug.golden) badge(badges.goldFirst ? '금색 첫 발견' : '금색', GOLD);
    if (badges.first) badge('첫 발견', '#c4473a');
    if (badges.record && !badges.first) badge('최대 기록', '#3d74a8');
    const head = el('div', undefined, 'fish-actions'); head.style.justifyContent = 'center'; head.append(this.chip(s)); if (bug.golden) head.append(this.goldChip());
    const hint = el('p', error ? `아직 저장되지 않았어요. 눌러서 다시 시도 · ${error}` : this.solo ? '눌러서 닫기' : 'B 자랑하기 · 눌러서 닫기', 'fish-muted');
    this.card.replaceChildren(el('h3', bug.golden ? '금빛 곤충!' : `${s.name}!`), head, this.art(s, { golden: bug.golden, size: 76 }), el('p', `${s.name} · ${cm(bug.sizeMm)}`, 'fish-name'), tags, hint);
    this.card.hidden = false;
    clearTimeout(this.cardTimer); if (!error) this.cardTimer = setTimeout(() => this.hideCard(), bug.golden ? GOLD_CARD_MS : CARD_MS);
  }
  private hideCard(): void { if (this.resultError) return; this.card.hidden = true; this.result = undefined; }
  /** B while the card is up brags the fresh catch; returns it if there is one to show. */
  resultBrag(): InsectCatch | undefined { const bug = this.result; if (this.solo || this.card.hidden || !bug || this.resultError) return undefined; this.hideCard(); return bug; }
  roomClosed(): void {
    this.modal(true, '채집방 종료'); this.panel.hidden = false;
    this.panel.replaceChildren(el('h3', '채집방이 닫혔어요'), el('p', '저장한 곤충은 그대로 남아 있어요.'), this.row(button('혼자 계속하기', () => this.actions.continueSolo())));
  }
  private row(...children: HTMLElement[]): HTMLDivElement { const n = el('div', undefined, 'fish-actions'); n.style.justifyContent = 'center'; n.append(...children); return n; }
  private header(): HTMLDivElement {
    const head = el('div', undefined, 'fish-head'); head.setAttribute('role', 'tablist');
    const tab = (name: 'collection' | 'catalog', text: string) => { const b = button(text, () => { this.tab = name; this.selected = undefined; this.page = 0; this.renderCollection(); }, 'fish-tab'); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(this.tab === name)); return b; };
    const close = button('✕', () => this.close(), 'fish-close'); close.setAttribute('aria-label', '닫기');
    const owned = this.save.catches.filter(c => !c.released).length, seen = new Set(this.save.catches.map(c => c.speciesId)).size, gold = new Set(this.save.catches.filter(c => c.golden).map(c => c.speciesId)).size;
    const mine = tab('collection', '수집함'); if (owned) { const n = el('sup', String(owned)); n.setAttribute('aria-label', `${owned}마리 보관`); mine.append(n); }
    const stats = el('div', undefined, 'fish-stats'), meter = el('div', undefined, 'fish-meter'), fill = el('i');
    fill.style.width = `${seen / SPECIES.length * 100}%`; meter.append(fill); meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-valuenow', String(seen)); meter.setAttribute('aria-valuemax', String(SPECIES.length)); meter.setAttribute('aria-label', '도감 완성도');
    stats.append(el('span', `도감 ${seen}/${SPECIES.length} · 금색 ${gold}/${SPECIES.length}`), meter);
    head.append(mine, tab('catalog', '도감'), stats, close); return head;
  }
  private renderCollection(): void {
    this.modal(false);
    this.panel.replaceChildren(this.header());
    if (this.selected) { this.detail(this.selected); return; }
    const controls = el('div', undefined, 'fish-filters'); controls.style.gridTemplateColumns = 'minmax(0,1fr) auto auto auto auto';
    const search = el('input'); search.placeholder = '이름 검색'; search.setAttribute('aria-label', '곤충 이름 검색'); search.value = this.query;
    search.oninput = () => { this.query = search.value; this.page = 0; this.renderRows(); }; controls.append(search);
    controls.append(this.dropdown('서식지 필터', [{ value: '', text: '전체' }, ...ENVS.map(e => ({ value: e, text: ENV_NAMES[e] }))], this.env, v => { this.env = v; this.page = 0; this.renderRows(); }));
    controls.append(this.dropdown('등급 필터', ['전체', ...RARITIES].map((text, i) => ({ value: String(i - 1), text, color: i ? RARITY_INK[i - 1] : '' })), String(this.rarity), v => { this.rarity = Number(v); this.page = 0; this.renderRows(); }));
    controls.append(this.dropdown('정렬', [['recent', '최근'], ['size', '크기'], ['rarity', '등급'], ['name', '이름']].map(([value, text]) => ({ value, text })), this.sort, v => { this.sort = v; this.page = 0; this.renderRows(); }));
    const toggles = el('div', undefined, 'fish-tools'); toggles.style.flexWrap = 'nowrap';
    const gold = button('금', () => { this.goldOnly = !this.goldOnly; this.page = 0; this.renderCollection(); }); gold.title = '금색만 보기'; gold.setAttribute('aria-label', '금색만 보기'); gold.setAttribute('aria-pressed', String(this.goldOnly));
    const fav = button(this.favorites ? '★' : '☆', () => { this.favorites = !this.favorites; this.page = 0; this.renderCollection(); }); fav.title = '즐겨찾기만 보기'; fav.setAttribute('aria-label', '즐겨찾기만 보기'); fav.setAttribute('aria-pressed', String(this.favorites));
    toggles.append(gold, fav); controls.append(toggles); this.panel.append(controls);
    const rows = el('div'); rows.dataset.rows = 'true'; rows.style.display = 'contents'; this.panel.append(rows); this.renderRows();
  }
  private renderRows(): void {
    const container = this.panel.querySelector('[data-rows]'); if (!container) return; container.replaceChildren();
    const records = new Map<string, InsectCatch[]>(); for (const c of this.save.catches) { const a = records.get(c.speciesId) ?? []; a.push(c); records.set(c.speciesId, a); }
    let items: { s: Species; bug?: InsectCatch }[] = this.tab === 'catalog' ? SPECIES.map(s => ({ s })) : this.save.catches.filter(c => !c.released).map(bug => ({ s: SPECIES_BY_ID.get(bug.speciesId)!, bug }));
    items = items.filter(({ s, bug }) => (records.has(s.id) ? s.name.includes(this.query) : !this.query) && (this.rarity < 0 || s.rarity === this.rarity) && (!this.env || s.env === this.env as Env)
      && (!this.goldOnly || (bug ? bug.golden : records.get(s.id)?.some(c => c.golden))) && (!this.favorites || (bug ? bug.favorite : records.get(s.id)?.some(c => !c.released && c.favorite))));
    items.sort((a, b) => this.sort === 'size' ? (b.bug?.sizeMm ?? 0) - (a.bug?.sizeMm ?? 0) : this.sort === 'rarity' ? b.s.rarity - a.s.rarity : this.sort === 'name' ? a.s.name.localeCompare(b.s.name)
      : this.tab === 'catalog' ? SPECIES.indexOf(a.s) - SPECIES.indexOf(b.s) : (b.bug?.caughtAt ?? '').localeCompare(a.bug?.caughtAt ?? ''));
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE)); this.page = Math.min(this.page, pages - 1);
    const grid = el('div', undefined, 'fish-grid');
    for (const { s, bug } of items.slice(this.page * PAGE_SIZE, this.page * PAGE_SIZE + PAGE_SIZE)) grid.append(this.cardFor(s, bug, records.get(s.id)));
    container.append(grid);
    if (!items.length) container.append(el('p', this.tab === 'collection' && !this.save.catches.length ? '아직 곤충이 없어요. 숲을 걸어 보세요.' : '조건에 맞는 곤충이 없어요.', 'fish-empty'));
    const foot = el('div', undefined, 'fish-foot');
    const prev = button('‹', () => { this.page--; this.renderRows(); }); prev.setAttribute('aria-label', '이전 쪽'); prev.disabled = this.page === 0;
    const next = button('›', () => { this.page++; this.renderRows(); }); next.setAttribute('aria-label', '다음 쪽'); next.disabled = this.page >= pages - 1;
    const exp = button('내보내기', () => this.actions.export(), 'fish-link'); exp.title = '이 기기에 저장됩니다. 기기 이동 전 내보내기로 백업하세요.';
    const imp = button('가져오기', () => this.importScreen(), 'fish-link');
    foot.append(prev, el('span', `${this.page + 1}/${pages}`, 'fish-page'), next, exp, imp); container.append(foot);
  }
  private cardFor(s: Species, bug: InsectCatch | undefined, records: InsectCatch[] | undefined): HTMLButtonElement {
    const known = !!records, golden = bug ? bug.golden : false, hasGold = !!records?.some(c => c.golden);
    const card = button('', () => { this.selected = bug?.id ?? s.id; this.showGold = golden; this.renderCollection(); }, 'fish-card'); card.style.setProperty('--rc', RARITY_INK[s.rarity]);
    if (!known) card.classList.add('fish-unknown'); if (golden) card.classList.add('bug-gold');
    const best = records?.reduce((n, c) => Math.max(n, c.sizeMm), 0) ?? 0;
    const text = el('div', undefined, 'fish-line'); text.append(el('span', known ? s.name : '미발견', 'fish-name'), el('span', bug ? cm(bug.sizeMm) : known ? cm(best) : ENV_NAMES[s.env], 'fish-meta'));
    card.append(this.art(s, { known, golden, height: 64, size: 50 }), text);
    if (bug?.favorite) card.append(el('span', '★', 'fish-star'));
    if (!bug && hasGold) card.append(el('span', '★', 'bug-goldstar'));
    card.setAttribute('aria-label', `${known ? s.name : '미발견 곤충'}, ${RARITIES[s.rarity]}${golden ? ', 금색' : ''}${bug ? `, ${cm(bug.sizeMm)}` : ''}`);
    return card;
  }
  /** Paper-styled stand-in for <select>, shared look with the fishing notebook. `color` adds a rarity dot ('' = hollow "any"). */
  private dropdown(label: string, options: { value: string; text: string; color?: string }[], value: string, change: (v: string) => void): HTMLDivElement {
    const wrap = el('div', undefined, 'fish-dropdown'), list = el('ul', undefined, 'fish-menu'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label); list.hidden = true;
    const trigger = button('', () => list.hidden ? open() : close(), 'fish-select'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false'); trigger.title = label;
    let active = 0;
    const face = (o: { text: string; color?: string }) => { const parts: HTMLElement[] = []; if (o.color !== undefined) { const dot = el('i', undefined, o.color ? 'fish-swatch' : 'fish-swatch fish-any'); if (o.color) dot.style.background = o.color; parts.push(dot); } parts.push(el('span', o.text)); return parts; };
    const paint = () => {
      const current = options.find(o => o.value === value) ?? options[0]; trigger.replaceChildren(...face(current)); trigger.setAttribute('aria-label', `${label}: ${current.text}`);
      list.replaceChildren(...options.map((o, i) => { const li = el('li'); li.append(...face(o)); li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(o.value === value)); li.classList.toggle('fish-active', i === active);
        li.onpointerdown = e => e.preventDefault(); li.onpointerenter = () => { active = i; mark(); }; li.onclick = () => pick(o.value); return li; }));
    };
    const mark = () => [...list.children].forEach((li, i) => li.classList.toggle('fish-active', i === active));
    const outside = (e: PointerEvent) => { if (!wrap.contains(e.target as Node)) close(); };
    const open = () => { active = Math.max(0, options.findIndex(o => o.value === value)); list.hidden = false; wrap.dataset.open = ''; trigger.setAttribute('aria-expanded', 'true'); paint(); document.addEventListener('pointerdown', outside, true); };
    const close = () => { list.hidden = true; delete wrap.dataset.open; trigger.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); };
    const pick = (v: string) => { close(); if (v === value) return; value = v; paint(); change(v); };
    // While open, the insect input source leaves these keys to the menu (see input.ts).
    wrap.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) { open(); return; } active = (active + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length; mark(); }
      else if ((e.key === 'Enter' || e.key === ' ') && !list.hidden) { e.preventDefault(); pick(options[active].value); }
      else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); close(); trigger.focus(); }
      else if (e.key === 'Tab') close();
    };
    paint(); wrap.append(trigger, list); return wrap;
  }
  private importScreen(): void {
    this.panel.replaceChildren(this.header(), el('h3', '채집 데이터 가져오기'), el('p', '선택한 파일을 현재 수집함과 합칩니다. 놓아준 기록은 유지하고, 가져오기 전 백업을 남깁니다.'),
      el('p', '이 기기에 저장됩니다. 기기 이동 전 내보내기로 백업하세요.', 'fish-muted'), this.row(button('파일 선택', () => this.actions.import()), button('돌아가기', () => this.renderCollection())));
  }
  private detail(id: string): void {
    const bug = this.save.catches.find(c => c.id === id), s = SPECIES_BY_ID.get(bug?.speciesId ?? id); if (!s) { this.selected = undefined; this.renderCollection(); return; }
    const records = this.save.catches.filter(c => c.speciesId === s.id), known = records.length > 0, hasGold = records.some(c => c.golden);
    const golden = bug ? bug.golden : this.showGold && hasGold;
    const sheet = el('div', undefined, 'fish-detail'); sheet.style.setProperty('--rc', golden ? GOLD : RARITY_INK[s.rarity]);
    const plate = el('div', undefined, 'fish-plate'); plate.append(this.art(s, { known, golden, size: 88 }), el('small', specimenNo(s)));
    const info = el('div', undefined, 'fish-info'), tags = el('div', undefined, 'fish-actions');
    tags.append(this.chip(s), el('span', ENV_NAMES[s.env], 'fish-muted')); if (golden) tags.append(this.goldChip());
    info.append(el('h3', known ? s.name : '미발견 곤충'), tags, el('p', known ? s.description : `${ENV_NAMES[s.env]}에서 만날 수 있어요.`, 'fish-desc'));
    sheet.append(plate, info); this.panel.append(sheet);
    if (known) {
      const facts = el('dl', undefined, 'fish-facts');
      const fact = (k: string, v: string) => { const d = el('div'); d.append(el('dt', k), el('dd', v)); facts.append(d); };
      fact('최대', cm(records.reduce((n, c) => Math.max(n, c.sizeMm), 0))); fact('채집', `${records.length}마리`); fact('금색', `${records.filter(c => c.golden).length}마리`);
      this.panel.append(facts);
    }
    const actions = el('div', undefined, 'fish-actions');
    actions.append(button('‹ 목록으로', () => { this.selected = undefined; this.confirmRelease = false; this.renderCollection(); }));
    if (!bug && hasGold) actions.append(button(this.showGold ? '일반 원화 보기' : '금색 원화 보기', () => { this.showGold = !this.showGold; this.renderCollection(); }));
    if (bug && !bug.released) {
      this.panel.append(el('p', `이 개체 · ${cm(bug.sizeMm)} · ${new Date(bug.caughtAt).toLocaleString()}`, 'fish-muted'));
      if (this.confirmRelease) {
        const box = el('div', undefined, 'fish-confirm'), warn = bug.golden ? '금색 개체예요! ' : '';
        box.append(el('p', `${warn}${s.name} ${cm(bug.sizeMm)}를 놓아줄까요? 되돌릴 수 없으며 도감과 최대 기록은 남아요.`), this.row(button('놓아주기 확인', () => { this.confirmRelease = false; this.selected = undefined; this.actions.release(bug.id); }, 'fish-danger'), button('취소', () => { this.confirmRelease = false; this.renderCollection(); })));
        this.panel.append(box);
      } else {
        actions.append(button(bug.favorite ? '★ 잠금 해제' : '☆ 즐겨찾기', () => this.actions.favorite(bug.id)));
        if (!this.solo) actions.append(button('자랑하기', () => { this.close(); this.actions.show(bug); }));
        const release = button('놓아주기', () => { this.confirmRelease = true; this.renderCollection(); }, 'fish-danger'); release.disabled = bug.favorite; if (bug.favorite) release.title = '즐겨찾기를 해제하면 놓아줄 수 있어요'; actions.append(release);
      }
    }
    this.panel.append(actions);
  }
  dispose(): void { clearTimeout(this.toastTimer); clearTimeout(this.cardTimer); this.root.remove(); }
}
