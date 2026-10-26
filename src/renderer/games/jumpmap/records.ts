/** Local convenience records, kept separately for solo and multiplayer. */
export function formatRaceTime(ticks: number): string {
  const hundredths = Math.floor(ticks * 100 / 60);
  return `${Math.floor(hundredths / 6000).toString().padStart(2, '0')}:${Math.floor(hundredths / 100 % 60).toString().padStart(2, '0')}.${(hundredths % 100).toString().padStart(2, '0')}`;
}

export class PersonalRecord {
  best: number | undefined;
  result = '';
  private recorded = false;
  private key: string;
  private mode: 'solo' | 'multi';
  private storageFailed = false;

  constructor(solo: boolean) {
    this.mode = solo ? 'solo' : 'multi';
    this.key = `overlay-lupin.jumpmap.best.v1.${solo ? 'solo' : 'multi'}`;
    try {
      const value = Number(window.localStorage.getItem(this.key));
      if (Number.isSafeInteger(value) && value > 0) this.best = value;
    } catch { /* Desktop persistence below does not depend on localStorage. */ }
    if (typeof window !== 'undefined' && window.overlayLupin?.jumpmapRecord) {
      // Merge a surviving legacy record into the desktop file, never replacing a faster time.
      this.persist();
    }
  }

  reset(): void { this.recorded = false; this.result = ''; }

  finish(ticks: number | undefined): void {
    if (this.recorded || ticks === undefined || !Number.isSafeInteger(ticks) || ticks <= 0) return;
    this.recorded = true;
    if (this.best !== undefined && ticks >= this.best) return;
    this.result = this.best === undefined ? '첫 완주 기록!' :
      `개인 신기록 · ${((this.best - ticks) / 60).toFixed(2)}초 단축`;
    this.best = ticks;
    this.persist();
  }

  private persist(): void {
    try {
      if (window.overlayLupin?.jumpmapRecord) {
        const reply = window.overlayLupin.jumpmapRecord(this.mode, this.best);
        this.storageFailed = !reply.ok;
        if (reply.ok && reply.best !== undefined) this.best = reply.best;
      } else if (this.best !== undefined) {
        window.localStorage.setItem(this.key, String(this.best));
        this.storageFailed = false;
      }
    } catch { this.storageFailed = true; }
  }

  detail(ticks: number | undefined, finished: boolean): string {
    const current = ticks === undefined ? '' : `${finished ? '완주' : '현재'} ${formatRaceTime(ticks)}`;
    return [current, this.best === undefined ? '' : `개인 최고 ${formatRaceTime(this.best)}`, this.storageFailed ? '기록 저장 실패' : ''].filter(Boolean).join(' · ');
  }
}
