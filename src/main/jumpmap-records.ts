import fs from 'node:fs';
import path from 'node:path';

export type JumpmapRecordReply = { ok: boolean; best?: number };
type Mode = 'solo' | 'multi';
const validTicks = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** Tiny atomic file independent of Chromium's file-origin storage and flush lifecycle. */
export class JumpmapRecords {
  private filename: string;
  constructor(directory: string) { this.filename = path.join(directory, 'jumpmap-records.json'); }

  update(mode: unknown, ticks?: unknown): JumpmapRecordReply {
    if ((mode !== 'solo' && mode !== 'multi') || (ticks !== undefined && !validTicks(ticks))) return { ok: false };
    try {
      let records: Partial<Record<Mode, number>> = {};
      try {
        const parsed = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
        for (const key of ['solo', 'multi'] as const) {
          if (validTicks(parsed?.[key])) records[key] = parsed[key];
        }
      } catch (error) {
        // Never overwrite an unreadable existing file as if it were empty.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (validTicks(ticks) && (records[mode] === undefined || ticks < records[mode]!)) {
        records[mode] = ticks;
        fs.mkdirSync(path.dirname(this.filename), { recursive: true });
        const temporary = `${this.filename}.tmp`;
        const fd = fs.openSync(temporary, 'w', 0o600);
        try {
          fs.writeFileSync(fd, JSON.stringify(records), 'utf8');
          fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
        fs.renameSync(temporary, this.filename);
      }
      return { ok: true, best: records[mode] };
    } catch (error) {
      console.error('Could not persist jumpmap record', error);
      return { ok: false };
    }
  }
}
