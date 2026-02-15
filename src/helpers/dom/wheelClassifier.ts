type WheelKind = 'input' | 'inertia';

interface WheelSample {
  t: number;
  d: number;
  raw: WheelEvent;
}

export default class WheelClassifier {
  private events: WheelSample[] = [];
  private readonly maxSamples = 12;
  private lastType: WheelKind = 'input';

  push(e: WheelEvent): WheelKind {
    const now = performance.now();

    this.events.push({
      t: now,
      d: Math.abs(e.deltaY),
      raw: e
    });

    if(this.events.length > this.maxSamples) {
      this.events.shift();
    }

    return this.classify();
  }

  private classify(): WheelKind {
    if(this.events.length < 4) {
      return this.lastType;
    }

    const ev = this.events;

    // интервалы
    const intervals: number[] = [];
    for(let i = 1; i < ev.length; i++) {
      intervals.push(ev[i].t - ev[i - 1].t);
    }

    const avgInterval = avg(intervals);

    // затухание дельты
    let decayCount = 0;
    for(let i = 1; i < ev.length; i++) {
      if(ev[i].d < ev[i - 1].d) decayCount++;
    }

    const decayRatio = decayCount / (ev.length - 1);

    // разброс дельт
    const deltas = ev.map(e => e.d);
    const deltaStd = stddev(deltas);
    const deltaAvg = avg(deltas);

    const looksLikeInertia =
      avgInterval < 40 &&
      decayRatio > 0.6 &&
      deltaStd < deltaAvg * 0.8;

    const looksLikeInput =
      deltaAvg > 25 &&
      decayRatio < 0.4;

    if(looksLikeInertia) this.lastType = 'inertia';
    else if(looksLikeInput) this.lastType = 'input';

    return this.lastType;
  }
}

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  const m = avg(arr);
  return Math.sqrt(avg(arr.map(v => (v - m) ** 2)));
}
