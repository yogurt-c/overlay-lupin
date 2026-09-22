import { encodeWorld, decodeWorld, inputBits, inputFromBits } from './wire.js';
import type { WorldPacket } from './wire.js';
import type { InputFrame } from './types.js';
import { movingPlatformX, PLATFORMS } from './field.js';
import type { PlatformSpec } from './field.js';
import { generateCourse } from './generator.js';
import type { Course, GenerationProgress } from './generator.js';
import { JumpmapEngine } from './engine.js';
import { cameraTarget, followCamera, renderJumpmapScene } from './scene.js';
import type { Camera } from './scene.js';
import { createInputSource } from './input.js';
import { GOAL_Y, ROOM_CAPACITY, START_Y, ZONE_STYLE, zoneAt } from './field.js';
import type { JumpmapInput, JumpmapMemberPacketTagged, JumpmapWorld, PlayerView } from './types.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

const EMPTY_WORLD: JumpmapWorld = { phase: 'race', timerMs: 0, tick: 0, players: [] };
const NO_INPUT: JumpmapInput = { left: false, right: false, jump: false, down: false, attack: false };

function progressOf(player: PlayerView): number {
  const span = START_Y - GOAL_Y;
  const climbed = START_Y - player.y;
  return Math.max(0, Math.min(100, Math.round((climbed / span) * 100)));
}

/** Finishers first, ordered by who touched the goal first; everyone else by how high they've climbed. */
function ranked(world: JumpmapWorld): PlayerView[] {
  const finished = world.players.filter((p) => p.finish !== undefined).sort((a, b) => (a.finish ?? 0) - (b.finish ?? 0));
  const racing = world.players.filter((p) => p.finish === undefined).sort((a, b) => a.y - b.y);
  return [...finished, ...racing];
}

function statusFor(world: JumpmapWorld, myId: string): string {
  const me = world.players.find((p) => p.id === myId);
  if (!me) return '';
  const rank = ranked(world).findIndex((p) => p.id === myId) + 1;
  if (me.finish !== undefined) return `${rank}위 도착 · ${world.players.length}명`;
  return `${rank}위 · ${ZONE_STYLE[zoneAt(me.y)].label} · ${progressOf(me)}%`;
}

function bannerFor(world: JumpmapWorld, myId: string): { banner: string; bannerKind: string } {
  const me = world.players.find((p) => p.id === myId);

  if (world.phase === 'grace') {
    if (me && me.finish !== undefined) return { banner: `${me.finish}위 도착!`, bannerKind: 'over' };
    return { banner: `1위 도착! ${Math.ceil(world.timerMs / 1000)}초 뒤 순위 마감`, bannerKind: 'small' };
  }
  if (world.phase === 'intermission') {
    return { banner: me && me.finish !== undefined ? `${me.finish}위로 이번 판 마감` : '이번 판 마감', bannerKind: 'over' };
  }
  return { banner: '', bannerKind: '' };
}

interface CoursePacket {
  kind: 'course'; courseId: number; progress: number;
  chunk?: { index: number; total: number; platforms: PlatformSpec[] };
}
type RacePacket = WorldPacket & { courseId: number };
const CHUNK_SIZE = 4;

class JumpmapMatch implements GameMatch {
  private platforms = PLATFORMS;
  private courseId = 0;
  private loading = true;
  private progress = 0;
  private generator: Generator<GenerationProgress, Course> | null = null;
  private courseReady = false;
  private chunkCursor = 0;
  private chunks = new Map<number, PlatformSpec[]>();
  private chunkTotal = 0;
  private members = new Map<string, { name: string; ready: number | null }>();
  private outgoing = 0;

  /** Only set for the host — the authoritative simulation. */
  private engine: JumpmapEngine | null;
  /** Only meaningful for a member: the latest snapshot the host sent. */
  private world: JumpmapWorld = EMPTY_WORLD;
  private lastInput: JumpmapInput = NO_INPUT;
  private prediction = new JumpmapEngine(true);
  private pending: InputFrame[] = [];
  private sequence = 0;
  private receivedTick = -1;
  private snapshots: JumpmapWorld[] = [];
  private displayTick = 0;
  private correction = { x: 0, y: 0 };

  private camera: Camera = { camX: 0, camY: 0 };
  private snapCamera = true;
  /** Free-running counter driving the walk-cycle animation — the only clock the poses have. */
  private anim = 0;

  constructor(
    private isHost: boolean,
    private myId: string,
    private myName: string
  ) {
    this.engine = isHost ? new JumpmapEngine() : null;
    this.engine?.ensurePlayer(myId, myName);
    this.prediction.ensurePlayer(myId, myName);
    if (isHost) this.beginGeneration();
  }

  setMembers(members: { id: string; name: string }[]): void {
    for (const member of members) if (member.id !== this.myId && !this.members.has(member.id)) {
      this.members.set(member.id, { name: member.name, ready: null });
    }
  }

  private beginGeneration(): void {
    this.courseId++;
    this.loading = true;
    this.progress = 0;
    this.courseReady = false;
    this.chunkCursor = 0;
    this.generator = generateCourse(Math.floor(Math.random() * 0x100000000));
    for (const member of this.members.values()) member.ready = null;
    this.resetPrediction();
  }

  private resetPrediction(): void {
    this.pending = []; this.sequence = 0; this.receivedTick = -1;
    this.snapshots = []; this.displayTick = 0; this.correction = { x: 0, y: 0 };
    this.snapCamera = true;
    this.world = EMPTY_WORLD;
    this.lastInput = NO_INPUT;
    this.prediction = new JumpmapEngine(true, this.platforms);
    this.prediction.ensurePlayer(this.myId, this.myName);
  }

  private advanceGeneration(): void {
    const deadline = performance.now() + 4;
    for (let work = 0; this.generator && work < 24 && performance.now() < deadline; work++) {
      let next: IteratorResult<GenerationProgress, Course>;
      try {
        next = this.generator.next();
      } catch (error) {
        // A failed generator must not leave a room permanently stuck loading.
        console.error('Jumpmap generation failed; using the reference course', error);
        next = { done: true, value: { seed: 0, platforms: PLATFORMS, route: [], patterns: [] } };
      }
      if (!next.done) this.progress = next.value.percent;
      const course = next.done ? next.value : next.value.course;
      if (course) {
        this.platforms = course.platforms;
        this.generator = null;
        this.courseReady = true;
        this.engine = new JumpmapEngine(false, this.platforms);
        this.engine.ensurePlayer(this.myId, this.myName);
        for (const [id, member] of this.members) this.engine.ensurePlayer(id, member.name);
      }
    }
    if (!this.courseReady) return;
    const members = [...this.members.values()];
    const ready = members.filter(m => m.ready === this.courseId).length;
    this.progress = members.length ? 90 + Math.floor(10 * ready / members.length) : 100;
    if (ready === members.length) this.loading = false;
  }

  step(input: unknown): void {
    if (this.loading) {
      if (this.isHost) this.advanceGeneration();
      return;
    }
    if (this.engine?.phase === 'intermission' && this.engine.timerMs <= 1000 / 60) {
      this.beginGeneration();
      return;
    }
    this.lastInput = (input as JumpmapInput) ?? NO_INPUT;
    this.anim += 0.16;
    if (!this.engine) {
      // Cap memory during a disconnect; never silently discard an unacknowledged press.
      if (this.pending.length < 180) {
        this.pending.push({ seq: ++this.sequence, input: { ...this.lastInput } });
        this.prediction.setInput(this.myId, this.lastInput);
        this.prediction.step();
      }
      const target = this.world.tick - 3;
      // A 50ms jitter buffer for remote runners. Do not extrapolate through long outages.
      if (this.displayTick < this.world.tick) this.displayTick += Math.min(
        this.world.tick - this.displayTick, Math.max(0.8, Math.min(1.2, 1 + (target - this.displayTick) * 0.05)));
      this.correction.x *= 0.75;
      this.correction.y *= 0.75;
      return;
    }
    this.engine.setInput(this.myId, this.lastInput);
    this.engine.step();
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (this.loading) {
      ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);
      const width = Math.min(190, viewport.width * 0.7);
      const x = (viewport.width - width) / 2;
      const y = viewport.height / 2;
      ctx.save();
      ctx.fillStyle = '#414141';
      ctx.textAlign = 'center';
      ctx.font = '600 16px sans-serif';
      ctx.fillText(`맵 생성 중 ${this.progress}%`, viewport.width / 2, y - 16);
      ctx.fillStyle = '#e3e3e3'; ctx.fillRect(x, y, width, 6);
      ctx.fillStyle = '#414141'; ctx.fillRect(x, y, width * this.progress / 100, 6);
      ctx.font = '12px sans-serif';
      ctx.fillText(this.progress < 90 ? '점프 경로를 확인하고 있어요' : '참가자 준비를 기다리고 있어요', viewport.width / 2, y + 30);
      ctx.restore();
      return;
    }
    const world = this.renderWorld();
    const me = world.players.find((p) => p.id === this.myId);
    const target = cameraTarget(me);
    this.camera = this.snapCamera ? target : followCamera(this.camera, target);
    this.snapCamera = false;

    renderJumpmapScene(ctx, world, this.myId, this.camera, viewport, this.anim, this.platforms);
  }

  hud(): MatchHud {
    if (this.loading) return { status: `맵 생성 중 ${this.progress}%`, banner: '', bannerKind: '' };
    const world = this.currentWorld();
    if (!world.players.some((p) => p.id === this.myId)) return { status: '', banner: '', bannerKind: '' };
    return { status: statusFor(world, this.myId), ...bannerFor(world, this.myId) };
  }

  isOver(): boolean {
    // No fixed end — the room stays open, cycling rounds, as long as anyone is in it.
    return false;
  }

  buildOutgoingPacket(): unknown {
    if (this.engine) {
      const unready = [...this.members.values()].some(m => m.ready !== this.courseId);
      if (this.loading || (unready && this.outgoing++ % 2 === 0)) {
        const packet: CoursePacket = { kind: 'course', courseId: this.courseId, progress: this.progress };
        if (this.courseReady) {
          const total = Math.ceil(this.platforms.length / CHUNK_SIZE);
          const index = this.chunkCursor++ % total;
          packet.chunk = { index, total, platforms: this.platforms.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE) };
        }
        return packet;
      }
      return { ...encodeWorld(this.engine.snapshot(true), this.platforms), courseId: this.courseId };
    }
    return { name: this.myName, input: this.loading ? NO_INPUT : this.lastInput,
      courseId: this.courseId, ready: this.courseReady ? this.courseId : null,
      // Repeat the oldest samples first so a lost packet cannot leave a sequence hole.
      frames: this.pending.slice(0, 30).map(f => [f.seq, inputBits(f.input)]) };
  }

  applyOpponentPacket(packet: unknown): void {
    if (this.engine) {
      const data = packet as JumpmapMemberPacketTagged;
      const { from, name, input } = data;
      if (!from) return;
      let member = this.members.get(from);
      if (!member) { member = { name, ready: null }; this.members.set(from, member); }
      if (data.courseId !== this.courseId) return;
      if (data.ready === this.courseId) member.ready = this.courseId;
      if (this.loading || member.ready !== this.courseId) return;
      this.engine.ensurePlayer(from, name);
      if (data.frames) this.engine.queueInputs(from, data.frames.map(([seq, bits]) => ({ seq, input: inputFromBits(bits) })));
      else this.engine.setInput(from, input);
      return;
    }
    if (!packet || typeof packet !== 'object') return;
    const incoming = packet as CoursePacket | RacePacket;
    if (!Number.isInteger(incoming.courseId) || incoming.courseId < this.courseId) return;
    if (incoming.courseId > this.courseId) {
      this.courseId = incoming.courseId;
      this.loading = true; this.courseReady = false; this.progress = 0;
      this.chunks.clear(); this.chunkTotal = 0;
      this.resetPrediction();
    }
    if ('kind' in incoming && incoming.kind === 'course') {
      if (this.courseReady) return;
      this.progress = Math.max(this.progress, Math.min(90, incoming.progress));
      const chunk = incoming.chunk;
      if (chunk && Number.isInteger(chunk.total) && chunk.total > 0 && chunk.total <= 100 &&
        Number.isInteger(chunk.index) && chunk.index >= 0 && chunk.index < chunk.total &&
        Array.isArray(chunk.platforms) && chunk.platforms.length > 0 && chunk.platforms.length <= CHUNK_SIZE) {
        if (this.chunkTotal && this.chunkTotal !== chunk.total) return;
        this.chunkTotal = chunk.total;
        this.chunks.set(chunk.index, chunk.platforms);
        this.progress = 90 + Math.floor(10 * this.chunks.size / chunk.total);
        if (this.chunks.size === chunk.total) {
          this.platforms = Array.from({ length: chunk.total }, (_, i) => this.chunks.get(i)!).flat();
          this.courseReady = true;
          this.resetPrediction();
        }
      }
      return;
    }
    if (!this.courseReady || !('runners' in incoming)) return;
    const world = decodeWorld(incoming, this.platforms);
    this.loading = false;
    if (world.tick <= this.receivedTick) return;
    const first = this.receivedTick < 0;
    this.receivedTick = world.tick;
    const roundChanged = this.world.phase === 'intermission' && world.phase === 'race';
    this.world = world;
    if (roundChanged) this.snapshots = [];
    this.snapshots.push(world);
    if (this.snapshots.length > 12) this.snapshots.shift();
    if (first || roundChanged || world.tick - this.displayTick > 30) this.displayTick = world.tick - 3;
    const me = world.players.find(p => p.id === this.myId);
    if (!me?.state) return;
    const before = this.prediction.snapshot().players[0];
    this.pending = this.pending.filter(f => f.seq > (me.ack ?? 0));
    this.prediction.restore(this.myId, me.state, world.tick, world.phase);
    for (const frame of this.pending) {
      this.prediction.setInput(this.myId, frame.input);
      this.prediction.step();
    }
    const after = this.prediction.snapshot().players[0];
    const dx = before.x + this.correction.x - after.x;
    const dy = before.y + this.correction.y - after.y;
    const snap = first || roundChanged || Math.hypot(dx, dy) > 100 || me.finish !== before.finish;
    this.correction = snap ? { x: 0, y: 0 } : { x: dx, y: dy };
  }

  /** Physics uses the predicted clock; only remote runners use the delayed buffer. */
  private renderWorld(): JumpmapWorld {
    if (this.engine) return this.engine.snapshot();
    const predicted = this.prediction.snapshot();
    const tick = predicted.tick;
    const older = [...this.snapshots].reverse().find(w => w.tick <= this.displayTick) ?? this.snapshots[0] ?? this.world;
    const newer = this.snapshots.find(w => w.tick >= this.displayTick) ?? this.world;
    const alpha = older.tick === newer.tick ? 1 : Math.max(0, Math.min(1, (this.displayTick - older.tick) / (newer.tick - older.tick)));
    const players = this.world.players.map(p => {
      if (p.id === this.myId && p.state) {
        const me = predicted.players[0];
        return { ...me, finish: p.finish, x: me.x + this.correction.x, y: me.y + this.correction.y };
      }
      const a = older.players.find(v => v.id === p.id);
      const b = newer.players.find(v => v.id === p.id) ?? p;
      if (!a || a.finish !== b.finish || Math.hypot(a.x - b.x, a.y - b.y) > 100) return b;
      let x = a.x + (b.x - a.x) * alpha;
      // Grounded remote riders stay attached to the platform drawn on our clock.
      const platform = this.platforms.find(spec => spec.id === b.state?.standingOn && spec.kind === 'moving');
      if (platform && a.state?.standingOn === platform.id) {
        const offsetA = a.x - movingPlatformX(platform, older.tick);
        const offsetB = b.x - movingPlatformX(platform, newer.tick);
        x = movingPlatformX(platform, tick) + offsetA + (offsetB - offsetA) * alpha;
      }
      return { ...b, x, y: a.y + (b.y - a.y) * alpha };
    });
    if (!players.some(p => p.id === this.myId)) players.push(predicted.players[0]);
    return { ...this.world, tick, players };
  }

  removePeer(peerId: string): void {
    this.members.delete(peerId);
    this.engine?.removePlayer(peerId);
  }

  private currentWorld(): JumpmapWorld {
    return this.engine ? this.engine.snapshot() : this.world;
  }
}

export const jumpmapModule: GameModule = {
  id: 'jumpmap',
  label: '점프맵',
  hint: '← → 이동 · ↑ 점프(발판 위에서만 가능) · ↓로 빠르게 낙하 · Space 공격 · 제한시간 없이 깃발을 먼저 찍으면 1위, 이후 15초 그레이스 타임 동안 나머지 순위 확정 · 낙하 중 아래 발판에 착지 가능 · 맵 아래로 떨어지면 맨 아래 시작점부터 다시 도전',
  matching: 'room',
  roomCapacity: ROOM_CAPACITY,
  createMatch: (isHost, myId, myName) => new JumpmapMatch(isHost, myId, myName),
  createInputSource: (target) => createInputSource(target)
};
