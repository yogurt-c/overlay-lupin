import { DEFAULT_BALL_RADIUS, PLAYER_HALF } from './field.js';
import { collideBallWithFigure, integrateBall, keepBallAbovePitch } from './ball.js';
import type { BallState, Figure } from './ball.js';
import type { GameRules, RuleActor } from './rules.js';

/** The simulation advances in fixed 1/60s ticks; every constant below is per tick. */
export const STEP_MS = 1000 / 60;

const GRAVITY = 0.52;
const JUMP_VELOCITY = -9.4;
const MOVE_ACCEL = 0.95;
const MOVE_MAX = 3.1;
const GROUND_DRAG = 0.7;
const AIR_DRAG = 0.95;
const AIR_CONTROL = 0.55;
const SHOVE_STRENGTH = 0.45;

/** 2s of countdown before the ball drops — long enough to read "2, 1" and reposition. */
const KICKOFF_FRAMES = 120;
const GOAL_FREEZE_FRAMES = 84;
const OVER_FRAMES = 240;
export const WIN_SCORE = 5;

/** How hard the render position of the opponent chases the last packet we got from them. */
const REMOTE_LERP = 0.3;
/** Client-side ball reconciliation: nudge toward the host below this gap, hard-snap above it. */
const BALL_CORRECTION_LERP = 0.25;
const BALL_SNAP_DISTANCE = 70;

const RUN_ANIM_PER_PIXEL = 0.34;

/**
 * The shared button vocabulary every game sharing this engine reads from.
 * `action` is the one game-specific button (a kick, a dive/spike, ...); `down`
 * is a plain directional signal, independent of whatever `action` means.
 */
export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
  action: boolean;
}

interface LocalPlayer extends RuleActor {
  anim: number;
}

interface RemotePlayer extends Figure {
  pose: string;
  anim: number;
}

interface Snapshot {
  localX: number;
  localY: number;
  remoteX: number;
  remoteY: number;
  ballX: number;
  ballY: number;
}

/** Positions handed to the renderer, interpolated between the last two simulation ticks. */
export interface ViewState {
  local: { x: number; y: number; facing: 1 | -1; pose: string; anim: number };
  remote: { x: number; y: number; facing: 1 | -1; pose: string; anim: number };
  ball: { x: number; y: number; r: number; spin: number; vx: number; vy: number };
}

/** Phases of a single match, driven by the host and mirrored by the client — the same for every game. */
export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'over';

export interface PlayerState {
  x: number;
  y: number;
  facing: 1 | -1;
  pose: string;
}

/** The authoritative slice of the simulation: only the host produces this. */
export interface WorldState {
  ball: BallState;
  phase: MatchPhase;
  timer: number;
}

export interface OpponentPacket {
  player: PlayerState;
  world?: WorldState;
  score: [number, number];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The physics/scorekeeping engine shared by every "two figures + one ball"
 * game. It owns movement, gravity, remote interpolation, ball flight, and
 * match bookkeeping; a `GameRules` (injected at construction) supplies
 * everything that's specific to one game.
 */
export class Game {
  isHost = false;
  phase: MatchPhase = 'kickoff';
  phaseTimer = KICKOFF_FRAMES;
  /** score[0] is always the host's tally, score[1] the client's, on both machines. */
  score: [number, number] = [0, 0];
  /** Which side put the last one in, so each machine can word its own banner. */
  lastScorer: 0 | 1 | null = null;

  local: LocalPlayer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    pose: 'idle',
    anim: 0,
    actionTimer: 0,
    actionCooldown: 0,
    activePart: undefined
  };
  remote: RemotePlayer = { x: 0, y: 0, vx: 0, vy: 0, facing: -1, pose: 'idle', anim: 0 };
  ball: BallState = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, r: DEFAULT_BALL_RADIUS };

  /** The active ruleset for this match — everything game-specific is delegated here. */
  private readonly rules: GameRules;

  private remoteTarget: PlayerState = { x: 0, y: 0, facing: -1, pose: 'idle' };
  private prev: Snapshot = this.snapshot();
  /** Where the ball was parked at the last reset — cached so the kickoff hold doesn't re-roll a random serve spot every tick. */
  private serveBallX = 0;

  constructor(rules: GameRules) {
    this.rules = rules;
  }

  get isOver(): boolean {
    return this.phase === 'over' && this.phaseTimer <= 0;
  }

  /** Score from this machine's point of view — the client sees the same match mirrored. */
  get myScore(): number {
    return this.isHost ? this.score[0] : this.score[1];
  }

  get theirScore(): number {
    return this.isHost ? this.score[1] : this.score[0];
  }

  private get mySide(): 1 | -1 {
    return this.isHost ? 1 : -1;
  }

  /** This match's active ruleset, so the caller can draw the right field decorations. */
  get drawField(): GameRules['drawField'] {
    return this.rules.drawField;
  }

  startMatch(isHost: boolean): void {
    this.isHost = isHost;
    this.score = [0, 0];
    this.lastScorer = null;
    this.resetPositions();
    this.phase = 'kickoff';
    this.phaseTimer = KICKOFF_FRAMES;
    this.prev = this.snapshot();
  }

  /** Puts both figures back on their marks and parks the ball per the active ruleset. */
  private resetPositions(): void {
    const mySide = this.mySide;
    const pos = this.rules.resetPositions(mySide);

    this.local.x = pos.localX;
    this.local.y = pos.localY;
    this.local.vx = 0;
    this.local.vy = 0;
    this.local.facing = mySide;
    this.local.pose = 'idle';
    this.local.actionTimer = 0;
    this.local.actionCooldown = 0;
    this.local.activePart = undefined;

    this.remote.x = pos.remoteX;
    this.remote.y = pos.remoteY;
    this.remote.vx = 0;
    this.remote.vy = 0;
    this.remote.facing = (mySide * -1) as 1 | -1;
    this.remote.pose = 'idle';
    this.remoteTarget = { x: this.remote.x, y: this.remote.y, facing: this.remote.facing, pose: 'idle' };

    this.ball = { x: pos.ballX, y: pos.ballY, vx: 0, vy: 0, spin: 0, r: pos.ballR, gravityScale: pos.ballGravityScale };
    this.serveBallX = pos.ballX;
  }

  /** Advances the simulation by exactly one tick. */
  step(input: Input): void {
    this.prev = this.snapshot();
    this.advancePhase();
    this.trackRemote();

    const celebrating = this.phase === 'goal' || this.phase === 'over';
    this.stepPlayer(celebrating ? { left: false, right: false, jump: false, down: false, action: false } : input);

    if (this.phase === 'play') {
      this.stepBall(true);
    } else if (celebrating) {
      // Let the ball finish its run into the net instead of freezing on the line.
      this.stepBall(false);
    } else if (this.phase === 'kickoff') {
      // The ball hangs at its serve spot and only drops once the whistle goes.
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.x = this.serveBallX;
    }
  }

  private advancePhase(): void {
    if (this.phaseTimer > 0) this.phaseTimer -= 1;
    if (this.phaseTimer > 0) return;

    if (this.phase === 'kickoff') {
      // Harmless for the client to start early: the host's next packet corrects it.
      this.phase = 'play';
    } else if (this.isHost && this.phase === 'goal') {
      this.resetPositions();
      this.phase = 'kickoff';
      this.phaseTimer = KICKOFF_FRAMES;
    }
  }

  private stepPlayer(input: Input): void {
    const p = this.local;
    const onGround = p.y >= 0;
    const accel = onGround ? MOVE_ACCEL : MOVE_ACCEL * AIR_CONTROL;

    if (input.left !== input.right) {
      p.vx += input.left ? -accel : accel;
      p.facing = input.left ? -1 : 1;
    } else if (onGround) {
      p.vx *= GROUND_DRAG;
    } else {
      p.vx *= AIR_DRAG;
    }
    p.vx = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, p.vx));
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    if (input.jump && onGround) p.vy = JUMP_VELOCITY;

    p.vy += GRAVITY;
    p.x += p.vx;
    p.y = Math.min(0, p.y + p.vy);
    if (p.y >= 0) {
      p.y = 0;
      p.vy = 0;
    }

    this.shoveApart();
    const bounds = this.rules.bounds(this.mySide);
    p.x = Math.max(bounds.min, Math.min(bounds.max, p.x));

    if (onGround) p.anim += Math.abs(p.vx) * RUN_ANIM_PER_PIXEL;
    const defaultPose = p.y < -1 ? 'jump' : Math.abs(p.vx) > 0.4 ? 'run' : 'idle';
    p.activePart = this.rules.stepAction(p, input, this.mySide, defaultPose);
  }

  /** Keeps the two figures from occupying the same spot without needing a shared physics owner. */
  private shoveApart(): void {
    const dx = this.local.x - this.remote.x;
    const dy = this.local.y - this.remote.y;
    const minGap = PLAYER_HALF * 2;
    if (Math.abs(dx) >= minGap || Math.abs(dy) > 26) return;
    const dir = dx === 0 ? this.local.facing * -1 : Math.sign(dx);
    this.local.x += dir * (minGap - Math.abs(dx)) * SHOVE_STRENGTH;
  }

  /** Smooths the opponent toward their last packet and derives their velocity from the motion. */
  private trackRemote(): void {
    const r = this.remote;
    const prevX = r.x;
    const prevY = r.y;
    r.x = lerp(r.x, this.remoteTarget.x, REMOTE_LERP);
    r.y = lerp(r.y, this.remoteTarget.y, REMOTE_LERP);
    r.vx = r.x - prevX;
    r.vy = r.y - prevY;
    r.facing = this.remoteTarget.facing;
    r.pose = this.remoteTarget.pose;
    if (r.y >= -1) r.anim += Math.abs(r.vx) * RUN_ANIM_PER_PIXEL;
  }

  private stepBall(scoring: boolean): void {
    integrateBall(this.ball);
    collideBallWithFigure(this.ball, this.local, this.local.activePart);
    collideBallWithFigure(
      this.ball,
      this.remote,
      this.rules.activePartFor(this.remote.pose, this.remote.facing, (this.mySide * -1) as 1 | -1)
    );
    keepBallAbovePitch(this.ball);
    this.rules.stepBallExtra?.(this.ball);
    if (scoring) {
      const scorer = this.rules.resolveRound(this.ball);
      if (scorer !== null) this.awardPoint(scorer);
    } else {
      this.rules.settleBall?.(this.ball);
    }
  }

  private awardPoint(scorer: 0 | 1): void {
    // Only the host scores. The client keeps the ball inside the pitch until
    // the host's packet arrives, so its prediction can't run off the field.
    if (!this.isHost) {
      this.rules.settleBall?.(this.ball);
      return;
    }
    this.score[scorer] += 1;
    this.lastScorer = scorer;
    if (this.score[scorer] >= WIN_SCORE) {
      this.phase = 'over';
      this.phaseTimer = OVER_FRAMES;
    } else {
      this.phase = 'goal';
      this.phaseTimer = GOAL_FREEZE_FRAMES;
    }
  }

  applyOpponentPacket(packet: OpponentPacket): void {
    this.remoteTarget = packet.player;
    if (this.isHost || !packet.world) return;

    const wasPhase = this.phase;
    if (packet.score[0] > this.score[0]) this.lastScorer = 0;
    else if (packet.score[1] > this.score[1]) this.lastScorer = 1;
    this.score = packet.score;
    this.phase = packet.world.phase;
    this.phaseTimer = packet.world.timer;
    if (wasPhase === 'goal' && this.phase === 'kickoff') this.resetPositions();

    const authoritative = packet.world.ball;
    const gap = Math.hypot(this.ball.x - authoritative.x, this.ball.y - authoritative.y);
    if (gap > BALL_SNAP_DISTANCE || this.phase !== 'play') {
      this.ball = { ...authoritative };
    } else {
      this.ball.x = lerp(this.ball.x, authoritative.x, BALL_CORRECTION_LERP);
      this.ball.y = lerp(this.ball.y, authoritative.y, BALL_CORRECTION_LERP);
      this.ball.vx = authoritative.vx;
      this.ball.vy = authoritative.vy;
      this.ball.spin = authoritative.spin;
    }
  }

  buildOutgoingPacket(): { player: PlayerState; world: WorldState | undefined; score: [number, number] } {
    const player: PlayerState = {
      x: Math.round(this.local.x * 10) / 10,
      y: Math.round(this.local.y * 10) / 10,
      facing: this.local.facing,
      pose: this.local.pose
    };
    const world: WorldState | undefined = this.isHost
      ? { ball: { ...this.ball }, phase: this.phase, timer: this.phaseTimer }
      : undefined;
    return { player, world, score: this.score };
  }

  private snapshot(): Snapshot {
    return {
      localX: this.local.x,
      localY: this.local.y,
      remoteX: this.remote.x,
      remoteY: this.remote.y,
      ballX: this.ball.x,
      ballY: this.ball.y
    };
  }

  /**
   * Blends the last two ticks so drawing stays smooth on displays that refresh
   * faster (or slower) than the fixed 60Hz simulation.
   */
  view(alpha: number): ViewState {
    const p = this.prev;
    return {
      local: {
        x: lerp(p.localX, this.local.x, alpha),
        y: lerp(p.localY, this.local.y, alpha),
        facing: this.local.facing,
        pose: this.local.pose,
        anim: this.local.anim
      },
      remote: {
        x: lerp(p.remoteX, this.remote.x, alpha),
        y: lerp(p.remoteY, this.remote.y, alpha),
        facing: this.remote.facing,
        pose: this.remote.pose,
        anim: this.remote.anim
      },
      ball: {
        x: lerp(p.ballX, this.ball.x, alpha),
        y: lerp(p.ballY, this.ball.y, alpha),
        r: this.ball.r,
        spin: this.ball.spin,
        vx: this.ball.vx,
        vy: this.ball.vy
      }
    };
  }
}
