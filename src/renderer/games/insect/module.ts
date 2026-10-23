import { RARITIES, SAVE_VERSION, SPECIES, SPECIES_BY_ID, validCatch } from '../../../shared/insect.js';
import type { InsectAction, InsectCatch, InsectReply, InsectSave } from '../../../shared/insect.js';
import type { GameMatch, GameModule, Viewport } from '../types.js';
import { InsectEngine, emptyWorld, inReach, netX, MAX_X, MIN_X, SEATS, SNEAK, WALK } from './engine.js';
import type { Collector, Command, InsectWorld } from './engine.js';
import { createInputSource } from './input.js';
import type { InsectInput } from './input.js';
import { drawInsectField } from './draw.js';
import { InsectUi } from './ui.js';

const finite = (...n: unknown[]) => n.every(Number.isFinite);
export function validWorld(value: unknown): value is InsectWorld {
  if (!value || typeof value !== 'object') return false;
  const w = value as InsectWorld;
  return Number.isSafeInteger(w.tick) && w.tick >= 0 && Number.isSafeInteger(w.nextId) && Array.isArray(w.respawns) && w.respawns.length <= 32 && w.respawns.every(Number.isFinite)
    && Array.isArray(w.recent) && w.recent.length <= 32 && w.recent.every(r => r && finite(r.x, r.tick))
    && Array.isArray(w.players) && w.players.length <= SEATS && new Set(w.players.map(p => p?.id)).size === w.players.length && new Set(w.players.map(p => p?.seat)).size === w.players.length
    && w.players.every(p => p && typeof p.id === 'string' && p.id.length <= 120 && typeof p.name === 'string' && p.name.length <= 24 && Number.isInteger(p.seat) && p.seat >= 0 && p.seat < SEATS
      && ['free', 'stun', 'catch', 'result'].includes(p.phase) && ['air', 'tree', 'ground'].includes(p.env) && (p.facing === 1 || p.facing === -1) && [-1, 0, 1].includes(p.move)
      && typeof p.sneak === 'boolean' && typeof p.walking === 'boolean' && finite(p.x, p.t, p.since, p.emoji, p.emojiUntil, p.showUntil, p.noticeUntil, p.ack, p.lastInput, p.caughtUntil) && p.x >= 0 && p.x <= 1
      && typeof p.notice === 'string' && p.notice.length < 200 && (!p.bug || validCatch(p.bug)) && (!p.shown || validCatch(p.shown)) && (!p.caught || validCatch(p.caught))
      && (!['catch', 'result'].includes(p.phase) || !!p.bug) && Array.isArray(p.known) && p.known.length <= SPECIES.length && p.known.every(id => SPECIES_BY_ID.has(id)))
    && Array.isArray(w.bugs) && w.bugs.length <= 12 && w.bugs.every(b => b && Number.isInteger(b.id) && SPECIES_BY_ID.has(b.speciesId) && typeof b.golden === 'boolean' && typeof b.reached === 'boolean'
      && finite(b.sizeMm, b.x, b.y, b.hx, b.hy, b.timer, b.t, b.alert, b.seed, b.glintAt, b.pauseUntil) && (b.dir === 1 || b.dir === -1) && ['enter', 'live', 'flee'].includes(b.state));
}
export class InsectMatch implements GameMatch {
  private engine: InsectEngine | null; private world = emptyWorld(); private commands: Command[] = []; private seq = 0;
  private move = 0; private sneak = false; private ui?: InsectUi; private save: InsectSave = { version: SAVE_VERSION, profileId: '', catches: [] };
  private ready = false; private saving = false; private pending?: InsectCatch; private savedId = ''; private disposed = false; private closed = false;
  private previewX?: number; private known: string[] = []; private retryAt = 0;
  constructor(private isHost: boolean, private myId: string, private myName: string, private solo = false) {
    this.engine = isHost ? new InsectEngine() : null; this.engine?.ensure(myId, myName);
    if (typeof document !== 'undefined') {
      this.ui = new InsectUi({ open: () => this.ui?.open(), emoji: value => this.command('emoji', { value }), release: id => void this.mutate({ kind: 'release', id }), favorite: id => void this.mutate({ kind: 'favorite', id }),
        show: bug => this.show(bug), retry: () => void this.persist(), export: () => void this.transfer('export'), import: () => void this.transfer('import'), continueSolo: () => this.continueSolo() }, this.solo);
      void this.load();
    }
  }
  private refreshKnown(): void { this.known = [...new Set(this.save.catches.map(c => c.speciesId))]; }
  private async load(): Promise<void> {
    try { const reply = await window.overlayLupin.insectLoad(); if (!reply.ok || !reply.data) throw new Error(reply.error || '수집함을 불러오지 못했어요'); this.save = reply.data; this.refreshKnown(); this.ready = true; this.ui?.update(this.save); }
    catch (e) { this.ui?.message('수집함 로드 실패. 수집함의 가져오기로 복구하거나 다시 시작해 주세요. ' + String(e)); }
  }
  private async mutate(action: InsectAction): Promise<void> {
    try { const r = await window.overlayLupin.insectAct(action); if (!r.ok || !r.data) throw new Error(r.error); this.save = r.data; this.refreshKnown(); this.ui?.update(this.save); if (action.kind === 'release') this.ui?.message('곤충을 숲으로 놓아줬어요. 도감 기록은 남아 있어요.'); }
    catch (e) { this.ui?.message('저장 실패: ' + String(e)); }
  }
  private async transfer(kind: 'export' | 'import'): Promise<void> {
    try { const r: InsectReply = await (kind === 'export' ? window.overlayLupin.insectExport() : window.overlayLupin.insectImport()); if (r.cancelled) { this.ui?.open(); return; } if (!r.ok) throw new Error(r.error || '파일 처리 실패'); if (r.data) { this.save = r.data; this.refreshKnown(); this.ready = true; this.ui?.update(this.save); } this.ui?.open(); this.ui?.message(kind === 'export' ? '백업 파일을 내보냈어요' : '채집 데이터를 합쳤어요'); }
    catch (e) { this.ui?.open(); this.ui?.message(String(e)); }
  }
  private async persist(): Promise<void> {
    if (!this.pending || this.saving) return; this.saving = true; const bug = this.pending;
    const leftSide = (this.me()?.x ?? .5) > .5;
    try {
      const previous = this.save.catches.filter(c => c.speciesId === bug.speciesId), max = previous.reduce((n, c) => Math.max(n, c.sizeMm), 0);
      const badges = { first: previous.length === 0, record: bug.sizeMm > max, goldFirst: bug.golden && !previous.some(c => c.golden) };
      const r = await window.overlayLupin.insectAct({ kind: 'catch', bug }); if (!r.ok || !r.data) throw new Error(r.error || '저장 실패');
      this.save = r.data; this.refreshKnown(); this.ready = true; this.savedId = bug.id; this.pending = undefined; this.command('saved', { catchId: bug.id }, true);
      if (!this.disposed) { this.ui?.update(this.save); this.ui?.caught(bug, badges, leftSide); if (this.closed) this.ui?.roomClosed(); }
    } catch (e) { if (!this.disposed) this.ui?.caught(bug, { first: false, record: false, goldFirst: false }, leftSide, String(e)); this.retryAt = Date.now() + 5000; }
    finally { this.saving = false; }
  }
  /** `force` lets the save acknowledgement through even after the room closed, so a solo restart starts clean. */
  private command(kind: Command['kind'], extra: Partial<Command> = {}, force = false): void {
    if (this.disposed || (this.closed && !force) || this.commands.length >= 32 || (this.solo && kind === 'show')) return;
    this.commands.push({ ...extra, kind, seq: ++this.seq });
  }
  private show(bug: InsectCatch): void {
    const me = this.me(), tick = this.view().tick;
    if (me && me.showUntil > tick) { this.ui?.message('방금 자랑했어요. 잠시 후 다시 보여줄 수 있어요'); return; }
    this.command('show', { shown: bug }); const s = SPECIES_BY_ID.get(bug.speciesId);
    this.ui?.message(`${bug.golden ? '금색 ' : ''}${s ? `${RARITIES[s.rarity]} ${s.name}` : '곤충'} 자랑 중! 모두의 화면에 잠깐 떠요`);
  }
  private view(): InsectWorld { return this.engine?.world ?? this.world; }
  private me(): Collector | undefined { return this.view().players.find(p => p.id === this.myId); }
  /** Aim at the insect my hoop covers on my own screen; the host judges the ring as of the tick I saw. */
  private swing(): void {
    const me = this.me(); if (!this.ready || this.closed || this.ui?.opened || this.pending || !me || me.phase !== 'free') return;
    const at = { ...me, x: this.previewX ?? me.x }, w = this.view();
    const target = w.bugs.filter(b => inReach(at, b)).sort((a, b) => Math.abs(a.x - netX(at)) - Math.abs(b.x - netX(at)))[0];
    this.command('swing', { bug: target?.id, at: w.tick });
  }
  setMembers(members: { id: string; name: string }[]): void { if (this.engine) for (const m of members) this.engine.ensure(m.id, m.name); }
  removePeer(id: string): void { this.engine?.remove(id); }
  /** Continue the room from the last snapshot, so everyone keeps their spot and the insects stay where they were. */
  promoteToHost(formerHostId: string): void {
    if (this.engine || this.closed) return;
    const engine = new InsectEngine(); engine.world = structuredClone(this.world); engine.remove(formerHostId); engine.ensure(this.myId, this.myName);
    this.engine = engine; this.isHost = true; this.ui?.message('방장이 나가서 내가 채집방을 이어받았어요');
  }
  step(raw: unknown): void {
    if (this.disposed) return; const i = raw as InsectInput | undefined;
    if (i?.cancel) { if (this.ui?.opened && !this.closed) this.ui.close(); else if (this.ui?.emotesOpen) this.ui.toggleEmotes(); }
    if (i?.emotes) this.ui?.toggleEmotes(); if (i && i.emoji >= 0 && this.ui?.emotesOpen) { this.command('emoji', { value: i.emoji }); this.ui.toggleEmotes(); }
    if (i?.collection && !this.closed) { if (this.ui?.opened) this.ui.close(); else this.ui?.open(); }
    if (i?.brag) { const bug = this.ui?.resultBrag(); if (bug) this.show(bug); }
    if (i?.swing) this.swing();
    const frozen = !!this.ui?.opened || this.closed;
    this.move = frozen ? 0 : i?.move ?? 0; this.sneak = !frozen && !!i?.sneak;
    if (this.engine) { const me = this.me(); if (me) me.known = this.known; this.engine.input(this.myId, this.move, this.sneak, this.commands); this.engine.step(); }
    const me = this.me();
    if (me) {
      this.commands = this.commands.filter(c => c.seq > me.ack);
      if (me.phase === 'result' && me.bug && me.bug.id !== this.savedId && !this.pending) { this.pending = { ...me.bug }; void this.persist(); }
      // Guests walk ahead of the host's snapshot and ease back onto it, so arrow keys feel immediate over LAN.
      if (this.engine) this.previewX = undefined;
      else {
        const x = this.previewX ?? me.x, walking = (me.phase === 'free' || me.phase === 'result') && this.move !== 0;
        const next = walking ? Math.max(MIN_X, Math.min(MAX_X, x + this.move * (this.sneak ? SNEAK : WALK))) : x;
        this.previewX = next + (me.x - next) * .12;
      }
    }
    if (this.pending && !this.saving && this.retryAt && Date.now() > this.retryAt) { this.retryAt = 0; void this.persist(); }
  }
  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void { drawInsectField(ctx, viewport, this.view(), this.myId, { previewX: this.previewX, hideEmotes: this.ui?.hideEmotes ?? false, solo: this.solo }); }
  hud() { const w = this.view(); return { status: this.solo ? '곤충채집' : `곤충채집 · ${w.players.length}/${SEATS}`, banner: '', bannerKind: '' }; }
  isOver(): boolean { return false; }
  buildOutgoingPacket(): unknown {
    if (this.engine) return { kind: 'insect-world', world: this.engine.snapshot() };
    return { kind: 'insect-input', name: this.myName, move: this.move, sneak: this.sneak, commands: this.commands, known: this.known };
  }
  applyOpponentPacket(raw: unknown): void {
    if (this.closed || !raw || typeof raw !== 'object') return;
    const p = raw as { kind?: string; from?: string; name?: string; move?: number; sneak?: boolean; commands?: Command[]; known?: string[]; world?: InsectWorld };
    if (this.engine) {
      if (p.kind !== 'insect-input' || typeof p.from !== 'string' || typeof p.name !== 'string' || !Number.isFinite(p.move) || typeof p.sneak !== 'boolean' || !Array.isArray(p.commands) || p.commands.length > 32) return;
      // Only roster-authorized members may mutate the hosted simulation.
      const member = this.engine.world.players.find(m => m.id === p.from); if (!member) return;
      if (Array.isArray(p.known) && p.known.length <= SPECIES.length && p.known.every(id => SPECIES_BY_ID.has(id))) member.known = p.known;
      this.engine.input(p.from, p.move!, p.sneak, p.commands.filter(c => c && (!c.shown || validCatch(c.shown))));
    } else if (p.kind === 'insect-world' && validWorld(p.world) && p.world.tick > this.world.tick) this.world = structuredClone(p.world);
  }
  roomClosed(): void {
    // Finish persisting any received catch even after the room goes away.
    const me = this.me(); if (me?.phase === 'result' && me.bug && me.bug.id !== this.savedId && !this.pending) { this.pending = { ...me.bug }; void this.persist(); }
    this.closed = true; this.move = 0; this.ui?.roomClosed();
  }
  private continueSolo(): void {
    if (this.pending) { void this.persist(); return; }
    this.ui?.close(); this.closed = false; this.solo = true; this.ui?.setSolo(true); this.isHost = true; this.previewX = undefined;
    this.engine = new InsectEngine(); this.engine.ensure(this.myId, this.myName); this.commands = []; this.seq = 0;
  }
  canLeave(): boolean { if (this.pending || this.saving) { this.ui?.message('잡은 곤충을 저장하는 중입니다. 저장 완료 후 나가 주세요.'); return false; } return true; }
  dispose(): void { this.disposed = true; this.ui?.dispose(); }
}
export const insectModule: GameModule = {
  id: 'insect', label: '곤충채집', hint: '←→ 걷기 · Shift 살금살금 · Space 잠자리채로 덮기 · E 감정표현 · C 수집함 · B 자랑 · 최대 4명 · 곤충 30종, 1/50 확률의 금색 곤충 · 잡은 곤충은 이 기기에 영구 저장',
  matching: 'room', roomCapacity: SEATS,
  createMatch: (isHost, id, name) => new InsectMatch(isHost, id, name), createSoloMatch: (id, name) => new InsectMatch(true, id, name, true), createInputSource
};
