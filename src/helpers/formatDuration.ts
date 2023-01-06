/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export type DurationType = 's' | 'm' | 'h' | 'd' | 'w' | 'mm' | 'y';
export default function formatDuration(duration: number, showLast = 2) {
  if(!duration) {
    duration = 1;
  }

  const d: {duration: number, type: DurationType}[] = [];
  const p = [
    {m: 1, t: 's'},
    {m: 60, t: 'm'},
    {m: 60, t: 'h'},
    {m: 24, t: 'd'},
    {m: 7, t: 'w'}
  ] as Array<{m?: number, t: DurationType}>
  const s = 1;
  let t = s;
  p.forEach((o, idx) => {
    t = Math.round(t * o.m);

    if(duration < t) {
      return;
    }

    let dd = duration / t;
    if(idx !== (p.length - 1)) {
      const modulus = p[idx === (p.length - 1) ? idx : idx + 1].m;
      dd %= modulus;
    }

    d.push({
      duration: dd | 0,
      type: o.t
    });
  });

  const out = d.slice(-showLast).reverse();
  for(let i = out.length - 1; i >= 0; --i) {
    if(out[i].duration === 0) {
      out.splice(i, 1);
    }
  }

  return out;
}
