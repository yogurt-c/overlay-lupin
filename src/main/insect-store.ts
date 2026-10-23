import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SAVE_VERSION, isInsectSave, validCatch } from '../shared/insect';
import type { InsectSave, InsectAction } from '../shared/insect';

/** Main-process only. Same transaction and backup rules as the fishing collection. */
export class InsectStore {
  private file: string;
  constructor(directory: string) { fs.mkdirSync(directory, { recursive: true }); this.file = path.join(directory, 'insect-collection.json'); }
  read(): InsectSave {
    if (!fs.existsSync(this.file) && !fs.existsSync(this.file + '.bak')) return { version: SAVE_VERSION, profileId: randomUUID(), catches: [] };
    for (const filename of [this.file, this.file + '.bak']) {
      try { const d = JSON.parse(fs.readFileSync(filename, 'utf8')); if (isInsectSave(d)) return d; } catch { /* Try the last valid backup. Never silently reset corrupt collections. */ }
    }
    throw new Error('채집 데이터와 백업을 읽을 수 없습니다. 파일을 보존한 채 복구용 내보내기 파일을 가져와 주세요.');
  }
  private write(data: InsectSave): void {
    const encoded = JSON.stringify(data);
    // Preserve a valid prior snapshot, never a corrupt primary file.
    if (fs.existsSync(this.file)) {
      try { const old = fs.readFileSync(this.file, 'utf8'); if (isInsectSave(JSON.parse(old))) this.atomic(this.file + '.bak', old); } catch (e) {
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
  load(): InsectSave { const d = this.read(); if (!fs.existsSync(this.file)) this.write(d); return d; }
  act(action: InsectAction): InsectSave {
    const d = this.read();
    if (!action || typeof action !== 'object') throw new Error('잘못된 요청입니다.');
    if (action.kind === 'catch') {
      if (!validCatch(action.bug) || action.bug.released || action.bug.favorite) throw new Error('잘못된 채집 기록입니다.');
      if (!d.catches.some(c => c.id === action.bug.id)) d.catches.push({ ...action.bug });
    } else if (action.kind === 'release' || action.kind === 'favorite') {
      const c = d.catches.find(c => c.id === action.id);
      if (!c || c.released) throw new Error('수집함에 없는 곤충입니다.');
      if (action.kind === 'release') { if (c.favorite) throw new Error('즐겨찾기를 먼저 해제해 주세요.'); c.released = true; }
      else c.favorite = !c.favorite;
    } else throw new Error('지원하지 않는 요청입니다.');
    this.write(d); return d;
  }
  merge(incoming: unknown): InsectSave {
    if (!isInsectSave(incoming)) throw new Error('지원하지 않거나 손상된 채집 데이터입니다.');
    let d: InsectSave;
    try { d = this.read(); } catch {
      // Keep corrupt originals for manual recovery before replacing them.
      for (const suffix of ['', '.bak']) if (fs.existsSync(this.file + suffix)) fs.copyFileSync(this.file + suffix, this.file + suffix + `.damaged-${Date.now()}`);
      d = { version: SAVE_VERSION, profileId: randomUUID(), catches: [] };
    }
    const byId = new Map(d.catches.map(c => [c.id, c]));
    for (const bug of incoming.catches) {
      const old = byId.get(bug.id);
      if (old) { old.released ||= bug.released; old.favorite ||= bug.favorite; }
      else { const copy = { ...bug }; d.catches.push(copy); byId.set(copy.id, copy); }
    }
    // A separate pre-import copy survives later normal save transactions.
    this.atomic(this.file + '.before-import', JSON.stringify(this.readSafely()));
    this.write(d); return d;
  }
  private readSafely(): InsectSave { try { return this.read(); } catch { return { version: SAVE_VERSION, profileId: 'recovery', catches: [] }; } }
}
