import { RARITIES, SAVE_VERSION, SPECIES, SPECIES_BY_ID, validCatch } from '../../../shared/insect.js';
import type { InsectAction, InsectCatch, InsectReply, InsectSave } from '../../../shared/insect.js';
import type { GameMatch, GameModule, Viewport } from '../types.js';
import { InsectEngine, emptyWorld, SEATS, SNEAK, WALK } from './engine.js';
import type { Collector, Command, InsectWorld } from './engine.js';
import { createInputSource } from './input.js';
import type { InsectInput } from './input.js';
import { drawInsectField } from './draw.js';
import { InsectUi } from './ui.js';

import { CAMP, WIDTH, HEIGHT, clamp, movePoint } from './map.js';
import { WorldSender, WorldReceiver } from './wire.js';
export { validWorld } from './wire.js';
/** Close enough to read the collector's swing and a bug's flutter; the map (M) covers the wide view. */
const CAMERA_ZOOM = 1.5;

export class InsectMatch implements GameMatch {
  private engine: InsectEngine | null; private world = emptyWorld(); private commands: Command[] = []; private seq = 0;
  private sender = new WorldSender(); private receiver = new WorldReceiver();
  private moveY = 0; private paused = false; private mapOpen = false; private compact = false;
  private cameraX = CAMP.x; private cameraY = CAMP.y; private zoom = 1; private previewY?: number;
  private move = 0; private sneak = false; private ui?: InsectUi; private save: InsectSave = { version: SAVE_VERSION, profileId: '', catches: [] };
  private ready = false; private saving = false; private pending?: InsectCatch; private savedId = ''; private disposed = false; private closed = false;
  private previewX?: number; private known: string[] = []; private retryAt = 0;
  constructor(private isHost: boolean, private myId: string, private myName: string, private solo = false) {
    this.engine = isHost ? new InsectEngine() : null; this.engine?.ensure(myId, myName);
    if (typeof document !== 'undefined') {
      this.ui = new InsectUi({ open: () => this.ui?.open(), emoji: value => this.command('emoji', { value }), release: id => void this.mutate({ kind: 'release', id }), favorite: id => void this.mutate({ kind: 'favorite', id }),
        show: bug => this.show(bug), retry: () => void this.persist(), export: () => void this.transfer('export'), import: () => void this.transfer('import'), continueSolo: () => this.continueSolo(), map: () => { this.mapOpen = !this.mapOpen; }, compact: () => { this.compact = !this.compact; window.overlayLupin.insectWindow?.(this.compact ? 'compact' : 'expand'); } }, this.solo);
      window.overlayLupin.insectWindow?.('expand');
      document.getElementById('field')?.addEventListener('pointerdown', this.mapClick);
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
    const leftSide = (this.me()?.x ?? CAMP.x) > this.cameraX;
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
  private mapClick = (e: PointerEvent): void => {
    if (!this.mapOpen || this.closed) return;
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect(), scale = Math.min(rect.width / 640, rect.height / 480);
    const x = (e.clientX - rect.left - (rect.width - 640 * scale) / 2) / scale, y = (e.clientY - rect.top - (rect.height - 480 * scale) / 2) / scale;
    if (x >= 48 && x <= 592 && y >= 122 && y <= 401) this.command('ping', { x: (x - 48) / 544 * WIDTH, y: (y - 122) / 279 * HEIGHT });
  };
  private swing(): void {
    const me = this.me(); if (!this.ready || this.closed || this.paused || this.ui?.opened || this.pending || !me || me.phase !== 'free') return;
    this.command('swing', { at: this.view().tick });
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
    if (i?.cancel) { this.mapOpen = false; if (this.ui?.opened && !this.closed) this.ui.close(); else if (this.ui?.emotesOpen) this.ui.toggleEmotes(); }
    if (i?.emotes) this.ui?.toggleEmotes(); if (i && i.emoji >= 0 && this.ui?.emotesOpen) { this.command('emoji', { value: i.emoji }); this.ui.toggleEmotes(); }
    if (i?.map && !this.closed && !this.ui?.opened) this.mapOpen = !this.mapOpen;
    if (i?.collection && !this.closed) { if (this.ui?.opened) this.ui.close(); else this.ui?.open(); }
    if (i?.brag) { const bug = this.ui?.resultBrag(); if (bug) this.show(bug); }
    const frozen = !!this.ui?.opened || this.closed || this.mapOpen || this.compact || (typeof document !== 'undefined' && (document.hidden || document.getElementById('settings-panel')?.hidden === false));
    if (typeof document !== 'undefined') document.body.dataset.insectPaused = String(frozen);
    this.paused = frozen; this.moveY = frozen ? 0 : i?.moveY ?? 0;
    if (i?.swing && !i.cancel && !frozen) this.swing();
    this.move = frozen ? 0 : i?.move ?? 0; this.sneak = !frozen && !!i?.sneak;
    if (this.engine) { const me = this.me(); if (me) me.known = this.known; this.engine.input(this.myId, this.move, this.sneak, this.commands, this.moveY, this.paused); this.engine.step(); }
    const me = this.me();
    if (me) {
      this.commands = this.commands.filter(c => c.seq > me.ack);
      if (me.phase === 'result' && me.bug && me.bug.id !== this.savedId && !this.pending) { this.pending = { ...me.bug }; void this.persist(); }
      if (this.engine) { this.previewX = this.previewY = undefined; }
      else {
        const speed = (this.sneak ? SNEAK : WALK) / Math.max(1, Math.hypot(this.move, this.moveY));
        const walking = !this.paused && (me.phase === 'free' || me.phase === 'result');
        const next = movePoint(this.previewX ?? me.x, this.previewY ?? me.y, walking ? this.move * speed : 0, walking ? this.moveY * speed : 0);
        this.previewX = next.x + (me.x - next.x) * .08; this.previewY = next.y + (me.y - next.y) * .08;
      }
    }
    if (this.pending && !this.saving && this.retryAt && Date.now() > this.retryAt) { this.retryAt = 0; void this.persist(); }
  }
  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const p = this.me(); this.zoom += (CAMERA_ZOOM - this.zoom) * .15;
    if (p) { this.cameraX += (clamp(this.previewX ?? p.x, 320 / this.zoom, WIDTH - 320 / this.zoom) - this.cameraX) * .15; this.cameraY += (clamp(this.previewY ?? p.y, 240 / this.zoom, HEIGHT - 240 / this.zoom) - this.cameraY) * .15; }
    drawInsectField(ctx, viewport, this.view(), this.myId, { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom, previewX: this.previewX, previewY: this.previewY, angle: !this.engine && p?.phase === 'free' && (this.move || this.moveY) ? Math.atan2(this.moveY, this.move) : undefined, mapOpen: this.mapOpen, compact: this.compact, hideEmotes: this.ui?.hideEmotes ?? false, solo: this.solo, known: this.known.length, gold: new Set(this.save.catches.filter(b => b.golden).map(b => b.speciesId)).size });
  }
  hud() { const w = this.view(); return { status: this.solo ? '곤충채집' : `곤충채집 · ${w.players.length}/${SEATS}`, banner: '', bannerKind: '' }; }
  isOver(): boolean { return false; }
  buildOutgoingPacket(): unknown {
    if (this.engine) return this.sender.next(this.engine.world);
    return { kind: 'insect-input-v3', moveY: this.moveY, paused: this.paused, name: this.myName, move: this.move, sneak: this.sneak, commands: this.commands, known: this.known };
  }
  applyOpponentPacket(raw: unknown): void {
    if (this.closed || !raw || typeof raw !== 'object') return;
    const p = raw as { kind?: string; from?: string; name?: string; move?: number; moveY?: number; paused?: boolean; sneak?: boolean; commands?: Command[]; known?: string[]; world?: InsectWorld };
    if (this.engine) {
      if (p.kind !== 'insect-input-v3' || !Number.isFinite(p.moveY) || typeof p.paused !== 'boolean' || typeof p.from !== 'string' || typeof p.name !== 'string' || !Number.isFinite(p.move) || typeof p.sneak !== 'boolean' || !Array.isArray(p.commands) || p.commands.length > 32) return;
      // Only roster-authorized members may mutate the hosted simulation.
      const member = this.engine.world.players.find(m => m.id === p.from); if (!member) return;
      if (Array.isArray(p.known) && p.known.length <= SPECIES.length && p.known.every(id => SPECIES_BY_ID.has(id))) member.known = p.known;
      this.engine.input(p.from, p.move!, p.sneak, p.commands.filter(c => c && (!c.shown || validCatch(c.shown))), p.moveY, p.paused);
    } else { const world = this.receiver.accept(raw); if (world && world.tick > this.world.tick) this.world = world; }
  }
  roomClosed(): void {
    // Finish persisting any received catch even after the room goes away.
    const me = this.me(); if (me && ['catch', 'result'].includes(me.phase) && me.bug && me.bug.id !== this.savedId && !this.pending) { this.pending = { ...me.bug }; void this.persist(); }
    this.closed = true; this.move = 0; this.ui?.roomClosed();
  }
  private continueSolo(): void {
    if (this.pending) { void this.persist(); return; }
    this.ui?.close(); this.closed = false; this.solo = true; this.ui?.setSolo(true); this.isHost = true; this.previewX = this.previewY = undefined;
    const snapshot = structuredClone(this.view()); snapshot.players = snapshot.players.filter(p => p.id === this.myId);
    this.engine = new InsectEngine(); this.engine.world = snapshot; const me = this.engine.ensure(this.myId, this.myName);
    if (me?.bug?.id === this.savedId) { me.phase = 'free'; me.bug = undefined; }
    this.commands = []; this.seq = me?.ack ?? 0; this.sender = new WorldSender();
  }
  canLeave(): boolean { if (this.pending || this.saving || ['catch', 'result'].includes(this.me()?.phase ?? '')) { this.ui?.message('잡은 곤충을 저장하는 중입니다. 저장 완료 후 나가 주세요.'); return false; } return true; }
  dispose(): void { this.disposed = true; this.ui?.dispose(); if (typeof document !== 'undefined') { document.getElementById('field')?.removeEventListener('pointerdown', this.mapClick); delete document.body.dataset.insectPaused; window.overlayLupin.insectWindow?.('restore'); } }
}
export const insectModule: GameModule = {
  id: 'insect', label: '곤충채집', hint: 'WASD로 걷기 · 곤충 가까이에서 Space를 눌러 잠자리채로 잡기 · M 지도 · C 수집함 · 최대 4명',
  matching: 'room', roomCapacity: SEATS,
  createMatch: (isHost, id, name) => new InsectMatch(isHost, id, name), createSoloMatch: (id, name) => new InsectMatch(true, id, name, true), createInputSource
};
