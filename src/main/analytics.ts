import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AnalyticsStart, GamePlayEvent } from '../shared/analytics';

const ENDPOINT = 'https://osedhkweibdubwccpqeh.supabase.co/functions/v1/game-telemetry';
// Public project key; privileged credentials exist only in the Edge Function.
const PUBLIC_KEY = 'sb_publishable_5zxeux70gYwvKeh03hw3LA_ENLcTu5K';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Options {
  directory: string;
  version: string;
  platform: string;
  packaged: boolean;
  now?: () => number;
  fetch?: typeof fetch;
}

/** Best-effort analytics: no work in the frame loop, no synchronous disk/network I/O. */
export class GameAnalytics {
  private enabled = false;
  private installationId = randomUUID();
  private queue: GamePlayEvent[] = [];
  private loaded = false;
  private busy = false;
  private controller: AbortController | null = null;
  private nextAttempt = 0;
  private failures = 0;
  private writes: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly now: () => number;
  private readonly transport: typeof fetch;
  readonly ready: Promise<void>;

  constructor(private readonly options: Options) {
    this.file = path.join(options.directory, 'game-analytics.json');
    this.now = options.now ?? Date.now;
    this.transport = options.fetch ?? fetch;
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    try {
      if ((await fs.stat(this.file)).size > 1024 * 1024) return;
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!uuid.test(data.installationId)) return;
      this.installationId = data.installationId;
      this.enabled = data.enabled === true;
      if (this.enabled && Array.isArray(data.queue)) {
        this.queue = data.queue.slice(-MAX_EVENTS).filter((e: GamePlayEvent) =>
          e && uuid.test(e.event_id) && e.installation_id === this.installationId &&
          typeof e.game_id === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(e.game_id) &&
          ['solo', 'duel', 'room'].includes(e.mode) && typeof e.app_version === 'string' &&
          e.app_version.length <= 64 && ['darwin', 'win32', 'linux'].includes(e.platform) &&
          Number.isFinite(Date.parse(e.played_at)));
      }
      this.prune();
    } catch (error) {
      // First launch defaults on. Unreadable/corrupt settings stay off so a saved
      // opt-out is never accidentally overridden by a storage error.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.enabled = true;
        await this.persist();
      }
    }
    finally { this.loaded = true; }
  }

  async getEnabled(): Promise<boolean> {
    await this.ready;
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    await this.ready;
    this.enabled = enabled;
    if (!enabled) {
      this.controller?.abort();
      this.queue = [];
      this.installationId = randomUUID();
    }
    this.nextAttempt = 0;
    return this.persist();
  }

  recordStart(input: AnalyticsStart): void {
    if (!this.loaded || !this.enabled || !this.options.packaged) return;
    if (!input || typeof input.gameId !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(input.gameId) ||
      !['solo', 'duel', 'room'].includes(input.mode)) return;
    this.queue.push({
      event_id: randomUUID(), installation_id: this.installationId,
      game_id: input.gameId, mode: input.mode, app_version: this.options.version,
      platform: this.options.platform, played_at: new Date(this.now()).toISOString()
    });
    if (this.queue.length > MAX_EVENTS) this.queue.shift();
  }

  private prune(): void {
    const cutoff = this.now() - MAX_AGE_MS;
    this.queue = this.queue.filter(e => Date.parse(e.played_at) >= cutoff).slice(-MAX_EVENTS);
  }

  /** Serial asynchronous writes prevent a previous save from restoring an opted-out queue. */
  private persist(): Promise<boolean> {
    const write = this.writes.then(async () => {
      const body = JSON.stringify({ enabled: this.enabled, installationId: this.installationId, queue: this.queue });
      await fs.mkdir(this.options.directory, { recursive: true });
      await fs.writeFile(`${this.file}.tmp`, body, { mode: 0o600 });
      await fs.rename(`${this.file}.tmp`, this.file);
    });
    this.writes = write.catch(() => {});
    return write.then(() => true, () => false);
  }

  /** Called once a minute. Shutdown deliberately does not wait for telemetry. */
  async flush(): Promise<void> {
    await this.ready;
    if (!this.enabled || !this.options.packaged || this.busy) return;
    this.busy = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      this.prune();
      if (!this.queue.length) return;
      await this.persist();
      if (!this.enabled || this.now() < this.nextAttempt) return;
      const batch = this.queue.slice(0, 50);
      if (!batch.length) return;
      const controller = new AbortController();
      this.controller = controller;
      timeout = setTimeout(() => controller.abort(), 5000);
      const response = await this.transport(ENDPOINT, {
        method: 'POST', headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }), signal: controller.signal
      });
      if (!response.ok) throw new Error('Telemetry unavailable');
      const sent = new Set(batch.map(e => e.event_id));
      this.queue = this.queue.filter(e => !sent.has(e.event_id));
      this.failures = 0;
      this.nextAttempt = 0;
      await this.persist();
    } catch {
      this.failures += 1;
      this.nextAttempt = this.now() + Math.min(60 * 60_000, 60_000 * 2 ** Math.min(this.failures - 1, 6));
    } finally {
      clearTimeout(timeout);
      this.controller = null;
      this.busy = false;
    }
  }
}
