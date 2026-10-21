import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isFishingSave, validCatch } from '../shared/fishing';
import type { FishingSave, FishingAction } from '../shared/fishing';

/** Main-process only. Synchronous transactions serialize IPC mutations, including import. */
export class FishingStore {
  private file: string;
  constructor(directory: string) { fs.mkdirSync(directory, { recursive: true }); this.file = path.join(directory, 'fishing-collection.json'); }
  read(): FishingSave {
    if (!fs.existsSync(this.file) && !fs.existsSync(this.file + '.bak')) return { version: 1, profileId: randomUUID(), catches: [] };
    for (const filename of [this.file, this.file + '.bak']) {
      try { const d: unknown = JSON.parse(fs.readFileSync(filename, 'utf8')); if (isFishingSave(d)) return d; } catch { /* Try the last valid backup. Never silently reset corrupt collections. */ }
    }
    throw new Error('수집 데이터와 백업을 읽을 수 없습니다. 파일을 보존한 채 복구용 내보내기 파일을 가져와 주세요.');
  }
  private write(data: FishingSave): void {
    const encoded = JSON.stringify(data);
    // Preserve a valid prior snapshot, never a corrupt primary file.
    if (fs.existsSync(this.file)) {
      try { const old = fs.readFileSync(this.file, 'utf8'); if (isFishingSave(JSON.parse(old))) this.atomic(this.file + '.bak', old); } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
    this.atomic(this.file, encoded);
  }
  private atomic(file: string, data: string): void {
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, data, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  }
  load(): FishingSave { const d = this.read(); if (!fs.existsSync(this.file)) this.write(d); return d; }
  act(action: FishingAction): FishingSave {
    const d = this.read();
    if (!action || typeof action !== 'object') throw new Error('잘못된 요청입니다.');
    if (action.kind === 'catch') {
      if (!validCatch(action.fish) || action.fish.released || action.fish.favorite) throw new Error('잘못된 포획 기록입니다.');
      if (!d.catches.some(c => c.id === action.fish.id)) d.catches.push({ ...action.fish });
    } else if (action.kind === 'release' || action.kind === 'favorite') {
      const c = d.catches.find(c => c.id === action.id);
      if (!c || c.released) throw new Error('수집함에 없는 물고기입니다.');
      if (action.kind === 'release') { if (c.favorite) throw new Error('즐겨찾기를 먼저 해제해 주세요.'); c.released = true; }
      else c.favorite = !c.favorite;
    } else throw new Error('지원하지 않는 요청입니다.');
    this.write(d); return d;
  }
  merge(incoming: unknown): FishingSave {
    if (!isFishingSave(incoming)) throw new Error('지원하지 않거나 손상된 낚시 데이터입니다.');
    let d: FishingSave;
    try { d = this.read(); } catch {
      // Keep corrupt originals for manual recovery before replacing them.
      for (const suffix of ['', '.bak']) if (fs.existsSync(this.file + suffix)) fs.copyFileSync(this.file + suffix, this.file + suffix + `.damaged-${Date.now()}`);
      d = { version: 1, profileId: randomUUID(), catches: [] };
    }
    const byId = new Map(d.catches.map(c => [c.id, c]));
    for (const fish of incoming.catches) {
      const old = byId.get(fish.id);
      if (old) { old.released ||= fish.released; old.favorite ||= fish.favorite; }
      else { const copy = { ...fish }; d.catches.push(copy); byId.set(copy.id, copy); }
    }
    // A separate pre-import copy survives later normal save transactions.
    this.atomic(this.file + '.before-import', JSON.stringify(this.readSafely()));
    this.write(d); return d;
  }
  private readSafely(): FishingSave { try { return this.read(); } catch { return { version: 1, profileId: 'recovery', catches: [] }; } }
}
