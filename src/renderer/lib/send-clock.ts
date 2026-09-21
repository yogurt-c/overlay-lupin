/** Keep the cadence's remainder without bursting packets after a stalled frame. */
export function advanceSendClock(previous: number, now: number, interval: number): number {
  const periods = Math.floor((now - previous + 1e-6) / interval);
  return periods > 0 ? previous + periods * interval : previous;
}
