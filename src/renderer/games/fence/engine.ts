import { HEAD, LEGS, PLAYER_HALF, TORSO } from '../../lib/ballsport/field.js';
import { GUARD_SPLIT, bladeFor } from './poses.js';
import {
  ACTIVE,
  AIR_CONTROL,
  AIR_DRAG,
  CLASH_FRAMES,
  DOJO_X,
  FLASH_FRAMES,
  FX_LIFE,
  GRAVITY,
  GROUND_DRAG,
  GUARD_DROP_FRAMES,
  GUARD_MOVE_SCALE,
  GUARD_RAISE_FRAMES,
  HIT_STUN_FRAMES,
  JUMP_VELOCITY,
  KICKOFF_FRAMES,
  KNOCKBACK,
  LIVES,
  MOVE_ACCEL,
  MOVE_MAX_BACK,
  MOVE_MAX_FORWARD,
  OVER_FRAMES,
  PLUNGE_DIVE,
  RECOVER,
  SHOVE_STRENGTH,
  START_GAP,
  STAGGER_FRAMES,
  WALL_LEFT,
  WALL_RIGHT,
  WINDUP
} from './field.js';
import type { AttackKind } from './field.js';
import { ACTIVE_POSES } from './types.js';
import type { FenceInput, FencePacket, FencePhase, FencerState, Pose } from './types.js';

const REMOTE_LERP = 0.3;
const RUN_ANIM_PER_PIXEL = 0.34;

const NO_INPUT: FenceInput = {
  left: false,
  right: false,
  jump: false,
  down: false,
  action: false,
  guard: false
};

type ActionPhase = 'windup' | 'active' | 'recover';

interface Local {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  pose: Pose;
  anim: number;
  /** The attack in progress, if any. */
  kind: AttackKind | null;
  phase: ActionPhase | null;
  timer: number;
  /** Ticks the guard button has been held; the guard only covers past GUARD_RAISE_FRAMES. */
  guardHeld: number;
  /** Which height the guard was committed to when it went up. */
  guardLow: boolean;
  /** Ticks left before the hands are free again after lowering the guard. */
  guardDrop: number;
  stagger: number;
  clash: number;
  hitLock: number;
}

interface Remote extends FencerState {
  anim: number;
}

export interface FenceFx {
  kind: 'clash' | 'hit';
  x: number;
  y: number;
  life: number;
}

interface Snapshot {
  localX: number;
  localY: number;
  remoteX: number;
  remoteY: number;
}

/** `wounds` is how many cuts that fencer has taken — the renderer stains their ink with it. */
export interface FenceView {
  local: { x: number; y: number; facing: 1 | -1; pose: Pose; anim: number; wounds: number };
  remote: { x: number; y: number; facing: 1 | -1; pose: Pose; anim: number; wounds: number };
  fx: FenceFx[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Squared distance from point p to segment ab, all in the same space. */
function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/**
 * A duel between two stick figures with swords. One continuous fight: a cut
 * costs a life and buys the victim half a second of reeling, and it ends when
 * somebody's five lives are gone.
 *
 * The engine is deliberately not authoritative over the whole match. Each
 * machine simulates its own fencer and decides one thing only: whether the
 * *opponent's* blade touched *its own* body. Because exactly one machine
 * judges any given cut, the two life bars cannot disagree — and the player
 * swinging the sword never waits on the network to see their own swing.
 */
export class FenceEngine {
  isHost = false;
  phase: FencePhase = 'kickoff';
  phaseTimer = KICKOFF_FRAMES;

  /** Cumulative cuts taken by this machine's own fencer. */
  hits = 0;
  /** Cumulative attacks this machine's own fencer has blocked. */
  parries = 0;

  local: Local = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    pose: 'idle',
    anim: 0,
    kind: null,
    phase: null,
    timer: 0,
    guardHeld: 0,
    guardLow: false,
    guardDrop: 0,
    stagger: 0,
    clash: 0,
    hitLock: 0
  };
  remote: Remote = { x: 0, y: 0, facing: -1, pose: 'idle', anim: 0 };

  private remoteTarget: FencerState = { x: 0, y: 0, facing: -1, pose: 'idle' };
  /** The opponent's counters as last reported, so an increase can be spotted. */
  private remoteHits = 0;
  private remoteParries = 0;
  /** Countdowns on the two banner messages, so a cut still announces itself without stopping play. */
  private takeFlash = 0;
  private landFlash = 0;
  /** True once the opponent's current swing has been judged, so it can only cost one life. */
  private swingJudged = false;
  private fx: FenceFx[] = [];
  private prev: Snapshot = this.snapshot();

  get isOver(): boolean {
    return this.phase === 'over' && this.phaseTimer <= 0;
  }

  get myLives(): number {
    return Math.max(0, LIVES - this.hits);
  }

  /** Their lives are spent by the cuts I landed — which only they count. */
  get theirLives(): number {
    return Math.max(0, LIVES - this.remoteHits);
  }

  /** What just happened, for the banner: a cut landed, one taken, or both at once. */
  get flash(): 'land' | 'take' | 'both' | 'none' {
    if (this.landFlash > 0 && this.takeFlash > 0) return 'both';
    if (this.landFlash > 0) return 'land';
    if (this.takeFlash > 0) return 'take';
    return 'none';
  }

  startMatch(isHost: boolean): void {
    this.isHost = isHost;
    this.hits = 0;
    this.parries = 0;
    this.remoteHits = 0;
    this.remoteParries = 0;
    this.takeFlash = 0;
    this.landFlash = 0;
    this.takeStance();
    this.phase = 'kickoff';
    this.phaseTimer = KICKOFF_FRAMES;
    this.prev = this.snapshot();
  }

  /** Puts both fencers on their opening marks, facing each other. Only ever run once per match. */
  private takeStance(): void {
    const mySide: 1 | -1 = this.isHost ? -1 : 1;
    this.local.x = DOJO_X + mySide * START_GAP;
    this.local.y = 0;
    this.local.vx = 0;
    this.local.vy = 0;
    this.local.facing = (mySide * -1) as 1 | -1;
    this.local.pose = 'idle';
    this.local.kind = null;
    this.local.phase = null;
    this.local.timer = 0;
    this.local.guardHeld = 0;
    this.local.guardDrop = 0;
    this.local.stagger = 0;
    this.local.clash = 0;
    this.local.hitLock = 0;

    this.remote.x = DOJO_X - mySide * START_GAP;
    this.remote.y = 0;
    this.remote.facing = mySide;
    this.remote.pose = 'idle';
    this.remoteTarget = { x: this.remote.x, y: this.remote.y, facing: this.remote.facing, pose: 'idle' };

    this.swingJudged = false;
  }

  step(input: FenceInput): void {
    this.prev = this.snapshot();
    this.advancePhase();
    this.trackRemote();

    const live = this.phase === 'play';
    this.stepLocal(live ? input : NO_INPUT);
    if (live) {
      this.judgeIncoming();
      // Checked after judging, so the last life is spent on the very tick it goes.
      if (this.isHost) this.checkDefeat();
    }

    if (this.takeFlash > 0) this.takeFlash -= 1;
    if (this.landFlash > 0) this.landFlash -= 1;
    for (const f of this.fx) f.life -= 1;
    this.fx = this.fx.filter((f) => f.life > 0);
  }

  private advancePhase(): void {
    if (this.phaseTimer > 0) this.phaseTimer -= 1;
    // Harmless for the client to start early: the host's next packet corrects it.
    if (this.phase === 'kickoff' && this.phaseTimer <= 0) this.phase = 'play';
  }

  /** Host only: the match is over the moment either fencer runs out of lives. */
  private checkDefeat(): void {
    if (this.myLives > 0 && this.theirLives > 0) return;
    this.phase = 'over';
    this.phaseTimer = OVER_FRAMES;
  }

  private stepLocal(input: FenceInput): void {
    const p = this.local;
    if (p.stagger > 0) p.stagger -= 1;
    if (p.clash > 0) p.clash -= 1;
    if (p.hitLock > 0) p.hitLock -= 1;
    if (p.guardDrop > 0) p.guardDrop -= 1;

    // A fencer always faces the opponent, so left/right can mean forward/back.
    p.facing = p.x <= this.remote.x ? 1 : -1;

    const helpless = p.stagger > 0 || p.hitLock > 0;
    this.stepGuard(helpless ? NO_INPUT : input);
    this.stepMovement(helpless ? NO_INPUT : input);
    this.stepAction(helpless ? NO_INPUT : input);
    p.pose = this.derivePose();
  }

  private stepGuard(input: FenceInput): void {
    const p = this.local;
    const canGuard = p.phase === null;
    if (input.guard && canGuard) {
      // Height tracks down live, so letting go of down while still holding
      // guard switches straight to a high guard instead of staying committed
      // to whatever height was held when guard first went up.
      p.guardLow = input.down;
      p.guardHeld += 1;
    } else {
      if (p.guardHeld >= GUARD_RAISE_FRAMES) p.guardDrop = GUARD_DROP_FRAMES;
      p.guardHeld = 0;
    }
  }

  /** True while the guard actually covers — a raise takes a couple of frames. */
  get guarding(): boolean {
    return this.local.guardHeld >= GUARD_RAISE_FRAMES;
  }

  private stepMovement(input: FenceInput): void {
    const p = this.local;
    const onGround = p.y >= 0;
    let accel = onGround ? MOVE_ACCEL : MOVE_ACCEL * AIR_CONTROL;
    if (this.guarding) accel *= GUARD_MOVE_SCALE;

    if (input.left !== input.right) {
      const dir = input.left ? -1 : 1;
      p.vx += dir * accel;
      const forward = dir === p.facing;
      let max = forward ? MOVE_MAX_FORWARD : MOVE_MAX_BACK;
      if (this.guarding) max *= GUARD_MOVE_SCALE;
      p.vx = Math.max(-max, Math.min(max, p.vx));
    } else if (onGround) {
      p.vx *= GROUND_DRAG;
    } else {
      p.vx *= AIR_DRAG;
    }
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    if (input.jump && onGround && p.phase === null) p.vy = JUMP_VELOCITY;

    p.vy += GRAVITY;
    p.x += p.vx;
    p.y = Math.min(0, p.y + p.vy);
    if (p.y >= 0) {
      p.y = 0;
      p.vy = 0;
    }

    this.shoveApart();
    p.x = Math.max(WALL_LEFT, Math.min(WALL_RIGHT, p.x));
    if (onGround) p.anim += Math.abs(p.vx) * RUN_ANIM_PER_PIXEL;
  }

  /** Keeps the two figures from standing inside each other without a shared physics owner. */
  private shoveApart(): void {
    const dx = this.local.x - this.remote.x;
    const dy = this.local.y - this.remote.y;
    const minGap = PLAYER_HALF * 2;
    if (Math.abs(dx) >= minGap || Math.abs(dy) > 26) return;
    const dir = dx === 0 ? this.local.facing * -1 : Math.sign(dx);
    this.local.x += dir * (minGap - Math.abs(dx)) * SHOVE_STRENGTH;
  }

  private stepAction(input: FenceInput): void {
    const p = this.local;

    if (p.phase !== null && p.kind !== null) {
      // An aerial attack stays helpless until it lands, however long that takes.
      const holdInAir = p.phase === 'recover' && p.kind === 'plunge' && p.y < 0;
      if (!holdInAir) p.timer -= 1;
      if (p.timer <= 0) {
        if (p.phase === 'windup') {
          p.phase = 'active';
          p.timer = ACTIVE[p.kind];
          if (p.kind === 'plunge') p.vy = Math.max(p.vy, PLUNGE_DIVE);
        } else if (p.phase === 'active') {
          p.phase = 'recover';
          p.timer = RECOVER[p.kind];
        } else {
          p.phase = null;
          p.kind = null;
          p.timer = 0;
        }
      }
      return;
    }

    if (!input.action || p.guardHeld > 0 || p.guardDrop > 0) return;
    const kind = this.chooseAttack(input);
    p.kind = kind;
    p.phase = 'windup';
    p.timer = WINDUP[kind];
  }

  /** Same idea as volleyball's spike variants: the direction you're holding picks the technique. */
  private chooseAttack(input: FenceInput): AttackKind {
    const p = this.local;
    if (p.y < 0) return 'plunge';
    if (input.down) return 'slashLow';
    return 'slash';
  }

  private derivePose(): Pose {
    const p = this.local;
    if (p.hitLock > 0) return 'hit';
    if (p.stagger > 0) return 'stagger';
    if (p.clash > 0) return 'clash';

    if (p.kind !== null && p.phase !== null) {
      if (p.phase === 'windup') {
        if (p.kind === 'slashLow') return 'windupLow';
        if (p.kind === 'plunge') return 'jump';
        return 'windup';
      }
      if (p.phase === 'active') return p.kind;
      return p.kind === 'slashLow' ? 'afterLow' : 'after';
    }

    if (this.guarding) return p.guardLow ? 'guardLow' : 'guardHigh';
    if (p.y < -1) return 'jump';
    if (Math.abs(p.vx) > 0.4) {
      const movingForward = Math.sign(p.vx) === p.facing;
      return movingForward ? 'walk' : 'back';
    }
    return 'idle';
  }

  /** Smooths the opponent toward their last packet. */
  private trackRemote(): void {
    const r = this.remote;
    const prevX = r.x;
    r.x = lerp(r.x, this.remoteTarget.x, REMOTE_LERP);
    r.y = lerp(r.y, this.remoteTarget.y, REMOTE_LERP);
    r.facing = this.remoteTarget.facing;
    r.pose = this.remoteTarget.pose;
    if (r.y >= -1) r.anim += Math.abs(r.x - prevX) * RUN_ANIM_PER_PIXEL;
  }

  /**
   * The one judgement this machine makes: did the opponent's live blade reach
   * my body, and was my guard covering the height it arrived at?
   */
  private judgeIncoming(): void {
    if (!ACTIVE_POSES.has(this.remote.pose)) {
      this.swingJudged = false;
      return;
    }
    if (this.swingJudged || this.local.hitLock > 0) return;

    const blade = bladeFor(this.remote.pose);
    if (!blade) return;
    const [hilt, tip] = blade;
    const ax = this.remote.x + this.remote.facing * hilt[0];
    const ay = this.remote.y + hilt[1];
    const bx = this.remote.x + this.remote.facing * tip[0];
    const by = this.remote.y + tip[1];

    const contact = this.bladeContact(ax, ay, bx, by);
    if (!contact) return;

    this.swingJudged = true;
    if (this.blocks(contact.y)) {
      this.parries += 1;
      this.local.clash = CLASH_FRAMES;
      this.addFx('clash', contact.x, contact.y);
      return;
    }
    this.hits += 1;
    this.local.hitLock = HIT_STUN_FRAMES;
    this.takeFlash = FLASH_FRAMES;
    // Thrown back rather than reset: this is what re-opens the distance now that nobody repositions.
    this.local.vx = -this.local.facing * KNOCKBACK;
    this.addFx('hit', contact.x, contact.y);
  }

  /** Which of my three body circles the blade reached, if any. */
  private bladeContact(ax: number, ay: number, bx: number, by: number): { x: number; y: number } | null {
    const p = this.local;
    for (const part of [HEAD, TORSO, LEGS]) {
      const cy = p.y + part.y;
      if (distToSegmentSq(p.x, cy, ax, ay, bx, by) <= part.r * part.r) return { x: p.x, y: cy };
    }
    return null;
  }

  /**
   * A guard covers a height, not the whole body. A downward strike comes from
   * above, so only a raised (high) guard can catch it — crouched low, there is
   * nothing between the blade and the head.
   */
  private blocks(contactY: number): boolean {
    if (!this.guarding) return false;
    if (this.remote.pose === 'plunge') return !this.local.guardLow;
    return this.local.guardLow ? contactY > GUARD_SPLIT : contactY <= GUARD_SPLIT;
  }

  private addFx(kind: 'clash' | 'hit', x: number, y: number): void {
    this.fx.push({ kind, x, y, life: FX_LIFE });
  }

  applyOpponentPacket(packet: FencePacket): void {
    this.remoteTarget = packet.player;

    if (packet.parries > this.remoteParries) {
      // They turned my blade aside — I only learn about it now, and stagger late.
      this.remoteParries = packet.parries;
      if (this.local.hitLock <= 0) this.local.stagger = STAGGER_FRAMES;
    }
    if (packet.hits > this.remoteHits) {
      this.remoteHits = packet.hits;
      this.landFlash = FLASH_FRAMES;
      this.addFx('hit', this.remote.x, this.remote.y + TORSO.y);
    }

    if (this.isHost || !packet.world) return;
    this.phase = packet.world.phase;
    this.phaseTimer = packet.world.timer;
  }

  buildOutgoingPacket(): FencePacket {
    return {
      player: {
        x: Math.round(this.local.x * 10) / 10,
        y: Math.round(this.local.y * 10) / 10,
        facing: this.local.facing,
        pose: this.local.pose
      },
      hits: this.hits,
      parries: this.parries,
      world: this.isHost ? { phase: this.phase, timer: this.phaseTimer } : undefined
    };
  }

  private snapshot(): Snapshot {
    return { localX: this.local.x, localY: this.local.y, remoteX: this.remote.x, remoteY: this.remote.y };
  }

  /** Blends the last two ticks so drawing stays smooth above 60Hz. */
  view(alpha: number): FenceView {
    const p = this.prev;
    return {
      local: {
        x: lerp(p.localX, this.local.x, alpha),
        y: lerp(p.localY, this.local.y, alpha),
        facing: this.local.facing,
        pose: this.local.pose,
        anim: this.local.anim,
        wounds: this.hits
      },
      remote: {
        x: lerp(p.remoteX, this.remote.x, alpha),
        y: lerp(p.remoteY, this.remote.y, alpha),
        facing: this.remote.facing,
        pose: this.remote.pose,
        anim: this.remote.anim,
        wounds: this.remoteHits
      },
      fx: this.fx
    };
  }
}
