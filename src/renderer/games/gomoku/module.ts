import type { GameMatch, GameModule, Viewport } from '../types.js';
import { GomokuEngine } from './engine.js';
import { chooseMove } from './bot.js';
import { createInputSource } from './input.js';
import { renderGomoku, RIPPLE_TICKS } from './draw.js';
import { decodeWorld, encodeWorld, validCommand } from './wire.js';
import { NO_INPUT, stoneFor, turnStone } from './types.js';
import type { Command, Difficulty, GomokuInput, Side, World } from './types.js';
const LEVELS: Difficulty[] = ['easy', 'normal', 'hard'];
const LABELS = ['쉬움', '보통', '어려움'];
/** The result banner pops over the board briefly, then leaves the final position readable; the HUD keeps the result. */
const BANNER_TICKS = 150;
let lastDifficulty = 1;

export class GomokuMatch implements GameMatch {
  private engine: GomokuEngine | null;
  private received: World | null = null;
  private side: Side;
  private cursor = 112;
  private menu = false;
  private selected = 0;
  private setup: boolean;
  private difficulty = lastDifficulty;
  private pending: Command | null = null;
  private seq = 0;
  private worker: Worker | null = null;
  private botKey = '';
  private botAnswer: number | null = null;
  private botDelay = 0;
  private direction = '';
  private heldTicks = 0;
  private message = '';
  private messageTicks = 0;
  private confirmResign = false;
  private disconnected = false;
  private closed = false;
  private disposed = false;
  private hidden = false;
  private observedRound = 1;
  private observedResult = 0;
  private bannerTicks = 0;
  private lastSeen = -1;
  private lastAge = RIPPLE_TICKS;

  constructor(isHost: boolean, private solo = false) {
    this.side = isHost ? 0 : 1;
    this.engine = isHost ? new GomokuEngine(globalThis.crypto.randomUUID()) : null;
    this.setup = solo;
    if (solo) { this.menu = true; this.selected = lastDifficulty; }
  }
  current(): World | null { return this.engine?.world ?? this.received; }
  private actions(): string[] {
    if (this.setup) return LABELS;
    if (this.confirmResign) return ['계속하기', '기권하기'];
    const w = this.current();
    if (this.disconnected) return ['나가기'];
    if (w?.result) return [this.solo ? '다시하기' : w.ready[this.side] ? '동의 대기' : '재대결', '나가기'];
    return this.solo ? ['보드로', '무르기', '기권'] : ['보드로', '기권'];
  }
  private tell(message: string) { this.message = message; this.messageTicks = 150; }
  private cancelBot() {
    this.worker?.terminate(); this.worker = null; this.botKey = ''; this.botAnswer = null; this.botDelay = 0;
  }
  private send(kind: Command['kind']) {
    const w = this.current();
    if (!w || this.pending || this.disconnected) return;
    const command: Command = { id: w.id, round: w.round, seq: ++this.seq, turn: w.turn, kind, cell: this.cursor };
    if (this.engine) this.engine.command(this.side, command);
    else this.pending = command;
  }
  private activate() {
    if (this.setup) {
      this.difficulty = this.selected; lastDifficulty = this.selected;
      this.setup = false; this.menu = false; this.selected = 0; return;
    }
    if (this.confirmResign) {
      if (this.selected === 1) { this.send('resign'); this.cancelBot(); }
      this.confirmResign = false; this.selected = 0; return;
    }
    const action = this.actions()[this.selected];
    if (action === '나가기') { this.closed = true; return; }
    if (action === '다시하기') { this.cancelBot(); this.engine!.restart(); return; }
    if (action === '재대결') { this.send('rematch'); return; }
    if (action === '보드로') { this.menu = false; return; }
    if (action === '무르기') {
      if (this.engine?.undo(this.side)) { this.cancelBot(); this.menu = false; }
      else this.tell('되돌릴 내 수가 없습니다');
      return;
    }
    if (action === '기권') { this.confirmResign = true; this.selected = 0; }
  }
  step(raw: unknown): void {
    if (this.disposed || this.closed) return;
    const input = (raw ?? NO_INPUT) as GomokuInput;
    if (this.messageTicks > 0 && --this.messageTicks === 0) this.message = '';
    const w = this.current();
    if (w && w.round !== this.observedRound) {
      this.observedRound = w.round; this.observedResult = 0;
      this.cursor = 112; this.menu = this.disconnected; this.selected = 0; this.confirmResign = false;
      this.pending = null; this.message = ''; this.cancelBot();
    }
    if (w?.result && !this.observedResult) {
      this.observedResult = w.result; this.menu = true; this.selected = 0; this.confirmResign = false; this.cancelBot();
      this.bannerTicks = BANNER_TICKS;
    }
    if (this.bannerTicks > 0) this.bannerTicks--;
    if (w && w.last !== this.lastSeen) { this.lastSeen = w.last; this.lastAge = 0; }
    else if (this.lastAge < RIPPLE_TICKS) this.lastAge++;
    const direction = input.left ? 'left' : input.right ? 'right' : input.up ? 'up' : input.down ? 'down' : '';
    const move = !!direction && (direction !== this.direction || (this.heldTicks >= 18 && this.heldTicks % 5 === 0));
    this.heldTicks = direction === this.direction ? this.heldTicks + 1 : 0; this.direction = direction;
    if (move) {
      if (this.menu) {
        if (direction === 'left') this.selected = Math.max(0, this.selected - 1);
        if (direction === 'right') this.selected = Math.min(this.actions().length - 1, this.selected + 1);
        if (direction === 'up' && !this.setup && !w?.result && !this.disconnected) { this.menu = false; this.confirmResign = false; }
      } else {
        const x = this.cursor % 15, y = Math.floor(this.cursor / 15);
        if (direction === 'left' && x > 0) this.cursor--;
        if (direction === 'right' && x < 14) this.cursor++;
        if (direction === 'up' && y > 0) this.cursor -= 15;
        if (direction === 'down') { if (y < 14) this.cursor += 15; else { this.menu = true; this.selected = 0; } }
      }
    }
    if (input.place) {
      if (this.menu) this.activate();
      else if (!w) this.tell('연결 중입니다');
      else if (this.pending) this.tell('착수를 확인하고 있습니다');
      else if (stoneFor(w, this.side) !== turnStone(w)) this.tell('상대 차례입니다');
      else if (w.board[this.cursor]) this.tell('이미 돌이 있는 자리입니다');
      else this.send('place');
    }
    if (this.solo && !this.setup && !this.disconnected && !this.closed) this.advanceBot();
  }
  private advanceBot() {
    const w = this.engine!.world;
    if (w.result || turnStone(w) === stoneFor(w, this.side)) return;
    // Keep LAN heartbeats running; only solo AI pauses when the overlay is hidden.
    if (this.hidden || (typeof document !== 'undefined' && document.hidden)) { this.cancelBot(); return; }
    const key = `${w.round}:${w.revision}`;
    if (this.botKey !== key) {
      this.cancelBot(); this.botKey = key; this.botDelay = 18;
      const accept = (cell: number) => { if (!this.disposed && this.botKey === key) this.botAnswer = cell; };
      if (typeof Worker !== 'undefined') {
        try {
          this.worker = new Worker(new URL('./bot-worker.js', import.meta.url), { type: 'module' });
          this.worker.onmessage = event => accept(event.data);
          this.worker.onerror = event => { event.preventDefault(); this.worker?.terminate(); this.worker = null; accept(chooseMove(w.board, turnStone(w), 'easy')); };
          this.worker.postMessage({ board: w.board, stone: turnStone(w), difficulty: LEVELS[this.difficulty] });
        } catch { accept(chooseMove(w.board, turnStone(w), 'easy')); }
      } else accept(chooseMove(w.board, turnStone(w), LEVELS[this.difficulty]));
    }
    if (this.botDelay > 0) this.botDelay--;
    if (this.botAnswer !== null && this.botDelay === 0) {
      const cell = this.botAnswer;
      this.cancelBot(); this.engine!.place(1, cell);
    }
  }
  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    renderGomoku(ctx, viewport, this.current(), this.side, { cursor: this.cursor, menu: this.menu, selected: this.selected,
      actions: this.actions(), setup: this.setup, pending: this.pending?.kind === 'place' ? this.pending.cell : null,
      message: this.confirmResign ? '기권하면 상대가 승리합니다 · Space 확인' : this.message, lastAge: this.lastAge });
  }
  private resultText(w: World): string {
    const text = w.result === 3 ? '무승부' : w.result === stoneFor(w, this.side) ? '승리!' : '패배';
    return w.reason === 'resign' ? `${text} · 기권` : text;
  }
  hud() {
    const w = this.current();
    if (this.setup) return { status: '오목 · 혼자하기', banner: '', bannerKind: '' };
    if (!w) return { status: '오목 · 연결 중', banner: '', bannerKind: '' };
    const mine = stoneFor(w, this.side);
    let state = mine === turnStone(w) ? '내 차례' : this.solo ? 'AI가 생각 중…' : '상대 차례';
    if (w.result) state = this.resultText(w);
    else if (this.disconnected) state = '연결 종료 · 대국 중단';
    else if (this.pending?.kind === 'place') state = '착수 확인 중…';
    const status = [state, mine === 1 ? '● 흑' : '○ 백', ...(this.solo ? [`AI ${LABELS[this.difficulty]}`] : []), `${w.turn}수`].join(' · ');
    const banner = w.result && this.bannerTicks > 0 ? this.resultText(w) : '';
    return { status, banner, bannerKind: banner ? 'over' : '' };
  }
  isOver() { return this.closed; }
  dispose() { this.disposed = true; this.cancelBot(); }
  visibilityChanged(visible: boolean) {
    this.hidden = !visible;
    if (this.solo && !visible) this.cancelBot();
  }
  connectionLost() {
    this.disconnected = true; this.pending = null; this.confirmResign = false; this.menu = true; this.selected = 0; this.cancelBot();
  }
  buildOutgoingPacket(): unknown {
    return this.engine ? encodeWorld(this.engine.world) : { t: 'gomoku-input', cmd: this.pending };
  }
  applyOpponentPacket(raw: unknown): void {
    if (this.disconnected || this.disposed) return;
    if (this.engine) {
      const p = raw as { t?: string; cmd?: unknown } | null;
      if (p?.t === 'gomoku-input' && validCommand(p.cmd)) this.engine.command(1, p.cmd);
    } else {
      const next = decodeWorld(raw), old = this.received;
      if (!next || (old && (next.id !== old.id || next.revision <= old.revision || next.round < old.round))) return;
      this.received = next;
      if (this.pending && (next.ack[this.side] >= this.pending.seq || next.round !== this.pending.round)) {
        if (this.pending.kind === 'place' && next.round === this.pending.round && !next.board[this.pending.cell]) this.tell('착수되지 않았습니다. 다시 선택해주세요');
        this.pending = null;
      }
    }
  }
}
export const gomokuModule: GameModule = {
  id: 'gomoku', label: '오목', matching: 'duel',
  hint: '방향키 이동 · Space 착수 · 맨 아래에서 ↓ 메뉴\n15×15 자유룰 · 5개 이상 연결 · 금수 없음 · 혼자하기 AI 3단계',
  createMatch: isHost => new GomokuMatch(isHost),
  createSoloMatch: () => new GomokuMatch(true, true), createInputSource
};
