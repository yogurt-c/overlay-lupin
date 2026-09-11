import { MerandiEngine } from './engine.js';
import { pickAt, renderMerandiScene } from './draw.js';
import { createInputSource as createMerandiInputSource } from './input.js';
import { WORLD_CLAMP, ZONE_SIGN, ZOOM_VIEW_SIZE, clampCamera } from './field.js';
import type { InputSource } from './input.js';
import type { Point } from './field.js';
import type { MerandiInput, MerandiMemberPacket, MerandiMemberPacketTagged, MerandiWorld, Selection } from './types.js';
import type { GameMatch, GameModule, MatchHud, Viewport } from '../types.js';

/**
 * `createInputSource`/`createMatch` are separate factories per the GameModule
 * contract, but the arrow-key camera pan is a purely local render concern
 * that never goes over the network — so we keep the one InputSource instance
 * the shell creates for this game here and let every match read from it
 * directly, instead of threading it through `step(input)`.
 */
let sharedInputSource: InputSource | null = null;

/**
 * Hover-to-inspect is a local UI concern with no network/engine involvement — the shell has no pointer
 * hooks in its GameModule contract, so this attaches its own listener on the shared canvas once and
 * forwards mouse position to whichever MerandiMatch is currently alive (mirrors sharedInputSource's
 * "one instance at a time" assumption: only one game is ever actually playing at once).
 *
 * This started as click-to-inspect, but the whole window is a `-webkit-app-region: drag` surface (see
 * index.html) so the user can grab and move this frameless overlay from anywhere — and Electron drops
 * mouse events entirely inside a drag region, so a click on a unit never reached us. Hover sidesteps
 * that: `mousemove` already has to run continuously anyway to flip the canvas out of the drag region
 * while the cursor sits on a unit (so a click *would* land there if the user chose to click), so the
 * same hit-test can just drive the info panel directly instead of waiting for a click at all.
 */
let activeMatchForHover: MerandiMatch | null = null;
let fieldHoverListenerAttached = false;

function attachFieldHoverListener(): void {
  if (fieldHoverListenerAttached) return;
  fieldHoverListenerAttached = true;
  const canvas = document.getElementById('field') as HTMLCanvasElement | null;
  if (!canvas) return;

  let dragRegionOn = true;
  const setDragRegion = (drag: boolean) => {
    if (dragRegionOn === drag) return;
    dragRegionOn = drag;
    canvas.style.setProperty('-webkit-app-region', drag ? 'drag' : 'no-drag');
  };
  canvas.addEventListener('mousemove', (e) => {
    const hit = activeMatchForHover?.updateHover(e.clientX, e.clientY) ?? false;
    setDragRegion(!hit);
  });
  canvas.addEventListener('mouseleave', () => {
    setDragRegion(true);
    activeMatchForHover?.clearHover();
  });
}

const PAN_SPEED_PER_MS = 0.16; // world units per ms
const MAX_PAN_OFFSET = Math.max(0, WORLD_CLAMP - ZOOM_VIEW_SIZE / 2);

const EMPTY_WORLD: MerandiWorld = {
  wave: 1,
  waveTotal: 50,
  waveMsLeft: 0,
  waveIsBoss: false,
  aliveMonsters: 0,
  aliveThreshold: 40,
  monsters: [],
  zones: [],
  shots: [],
  over: false,
  won: false
};
const NO_INPUT: MerandiInput = { commands: [] };

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Kept short on purpose — the shell's #hud is a single fixed-width line (see index.html), so a long
// status string here would wrap or get ellipsis-clipped and start crowding the game canvas below it.
function statusFor(world: MerandiWorld, myId: string): string {
  const me = world.zones.find((z) => z.id === myId);
  const wave = `${world.wave}/${world.waveTotal}${world.waveIsBoss ? '👑' : ''} ${fmtClock(world.waveMsLeft)}`;
  const threat = `몹${world.aliveMonsters}/${world.aliveThreshold}`;
  if (!me) return `${wave} · ${threat}`;
  const mode = me.armed === 'upgrade' ? ' · 업글1~4' : me.armed === 'sell' ? (me.pendingArche ? ' · 판매등급1~8' : ' · 판매1~5') : '';
  return `${wave} · ${threat} · ${me.gold}G${mode}`;
}

class MerandiMatch implements GameMatch {
  private engine: MerandiEngine | null;
  private world: MerandiWorld = EMPTY_WORLD;
  private lastInput: MerandiInput = NO_INPUT;
  private camera: Point | null = null; // null until we know our own corner, for the initial centering
  private selection: Selection | null = null;
  private lastViewport: Viewport = { width: 0, height: 0, pixelRatio: 1 };
  private lastSteppedAt = 0;

  constructor(
    private isHost: boolean,
    private myId: string,
    private myName: string
  ) {
    this.engine = isHost ? new MerandiEngine() : null;
    this.engine?.ensurePlayer(myId, myName);
    activeMatchForHover = this;
  }

  /** True only while the shell's frame loop is actively driving this instance — false once another game becomes the active match, since a stale MerandiMatch otherwise keeps existing (see `activeMatchForHover`). */
  private isActive(): boolean {
    return Date.now() - this.lastSteppedAt < 250;
  }

  /**
   * `clientX`/`clientY` are raw mouse-event page coordinates. Updates `selection` to whatever's under
   * the cursor (or clears it over empty space) and returns whether something was hit, so the caller
   * can also use this to decide whether the canvas should stop being a drag region right now.
   */
  updateHover(clientX: number, clientY: number): boolean {
    if (!this.isActive()) return false;
    const canvas = document.getElementById('field') as HTMLCanvasElement | null;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const x = ((clientX - rect.left) / rect.width) * this.lastViewport.width;
    const y = ((clientY - rect.top) / rect.height) * this.lastViewport.height;
    this.selection = pickAt(this.currentWorld(), this.lastViewport, this.camera ?? [0, 0], x, y);
    return this.selection !== null;
  }

  clearHover(): void {
    this.selection = null;
  }

  private currentWorld(): MerandiWorld {
    return this.engine ? this.engine.snapshot() : this.world;
  }

  private updateCamera(dtMs: number): void {
    if (this.camera == null) {
      const mine = this.currentWorld().zones.find((z) => z.id === this.myId);
      if (!mine) return; // corner not assigned yet — keep waiting rather than default to the world center
      const sign = ZONE_SIGN[mine.label];
      this.camera = [sign.sx * MAX_PAN_OFFSET * 0.7, sign.sy * MAX_PAN_OFFSET * 0.7];
    }
    const pan = sharedInputSource?.readCameraPan();
    if (!pan) return;
    const dist = PAN_SPEED_PER_MS * dtMs;
    let [x, y] = this.camera;
    if (pan.up) y -= dist;
    if (pan.down) y += dist;
    if (pan.left) x -= dist;
    if (pan.right) x += dist;
    this.camera = clampCamera(x, y);
  }

  step(input: unknown): void {
    this.lastSteppedAt = Date.now();
    this.lastInput = (input as MerandiInput) ?? NO_INPUT;
    if (this.engine) {
      this.engine.setInput(this.myId, this.lastInput);
      this.engine.step(1000 / 60);
    }
    this.updateCamera(1000 / 60);
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    this.lastViewport = viewport;
    const world = this.currentWorld();
    renderMerandiScene(ctx, world, this.myId, viewport, this.camera ?? [0, 0], this.selection);
  }

  hud(): MatchHud {
    const world = this.currentWorld();
    const me = world.zones.find((z) => z.id === this.myId);
    // The engine already clears `lastMessage` back to '' once its TTL elapses (see MerandiEngine.stepMessages),
    // so the banner just mirrors it directly instead of latching onto the last non-empty value forever.
    return { status: statusFor(world, this.myId), banner: me?.lastMessage ?? '', bannerKind: 'small' };
  }

  isOver(): boolean {
    return this.currentWorld().over;
  }

  buildOutgoingPacket(): unknown {
    if (this.engine) return this.engine.snapshot();
    const packet: MerandiMemberPacket = { name: this.myName, input: this.lastInput };
    return packet;
  }

  applyOpponentPacket(packet: unknown): void {
    if (this.engine) {
      const { from, name, input } = packet as MerandiMemberPacketTagged;
      this.engine.ensurePlayer(from, name);
      this.engine.setInput(from, input);
    } else {
      this.world = packet as MerandiWorld;
    }
  }

  removePeer(peerId: string): void {
    this.engine?.removePlayer(peerId);
  }
}

export const merandiModule: GameModule = {
  id: 'merandi',
  label: '메랜디',
  hint: 'Z 뽑기 · X 업그레이드(1~4 스탯: STR/INT/DEX/LUK) · C 판매(1~5 계열 → 1~8 등급 이하) · Esc 취소',
  matching: 'room',
  roomCapacity: 4,
  createMatch: (isHost, myId, myName) => new MerandiMatch(isHost, myId, myName),
  createInputSource: (target) => {
    const source = createMerandiInputSource(target);
    sharedInputSource = source;
    attachFieldHoverListener();
    return source;
  }
};
