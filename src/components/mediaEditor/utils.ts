import {getOwner, runWithOwner} from 'solid-js';

import BezierEasing from '../../vendor/bezierEasing';
import {logger} from '../../lib/logger';
import {hexaToHsla} from '../../helpers/color';

import {FontInfo, FontKey} from './types';

export const delay = (timeout: number) => new Promise((resolve) => setTimeout(resolve, timeout));

export const log = logger('Media editor');

export function withCurrentOwner<Args extends Array<unknown>, Result>(fn: (...args: Args) => Result) {
  const owner = getOwner();
  return (...args: Args) => {
    return runWithOwner(owner, () => fn(...args));
  };
}

export function distance(p1: [number, number], p2: [number, number]) {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}

export function snapToViewport(ratio: number, vw: number, vh: number) {
  if(vw / ratio > vh) vw = vh * ratio;
  else vh = vw / ratio;

  return [vw, vh] as [number, number];
}

export function getSnappedViewportsScale(ratio: number, vw1: number, vh1: number, vw2: number, vh2: number) {
  [vw1, vh1] = snapToViewport(ratio, vw1, vh1);
  [vw2, vh2] = snapToViewport(ratio, vw2, vh2);

  return Math.max(vw1 / vw2, vh1 / vh2);
}

export function getContrastColor(color: string) {
  return hexaToHsla(color).l < 80 ? '#ffffff' : '#000000';
}

export function lerp(min: number, max: number, progress: number) {
  return min + (max - min) * progress;
}

export function lerpArray(min: number[], max: number[], progress: number) {
  return min.map((start, index) => start + (max[index] - start) * progress);
}


type AnimateValueOptions = {
  easing?: (progress: number) => number;
  onEnd?: () => void;
};

const defaultEasing = BezierEasing(0.42, 0.0, 0.58, 1.0);
export const simpleEasing = BezierEasing(0.25, 0.1, 0.25, 1);

export function animateValue<T extends number | number[]>(
  start: T,
  end: T,
  duration: number,
  callback: (value: T) => void,
  {easing = defaultEasing, onEnd = () => {}}: AnimateValueOptions = {}
) {
  let startTime: number;
  let canceled = false;

  function animateFrame(currentTime: number) {
    if(canceled) return;
    if(!startTime) startTime = currentTime;

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);

    if(start instanceof Array && end instanceof Array) {
      const currentValues = start.map((startVal, index) => lerp(startVal, end[index], easedProgress));
      callback(currentValues as T);
    } else {
      callback(lerp(start as number, end as number, easedProgress) as T);
    }

    if(progress < 1) {
      requestAnimationFrame(animateFrame);
    } else {
      onEnd();
    }
  }

  requestAnimationFrame(animateFrame);

  return () => {
    canceled = true;
  };
}

export const fontInfoMap: Record<FontKey, FontInfo> = {
  roboto: {
    fontFamily: '\'Roboto\'',
    fontWeight: 500,
    baseline: 0.75
  },
  suez: {
    fontFamily: '\'Suez One\'',
    fontWeight: 400,
    baseline: 0.75
  },
  bubbles: {
    fontFamily: '\'Rubik Bubbles\'',
    fontWeight: 400,
    baseline: 0.75
  },
  playwrite: {
    fontFamily: '\'Playwrite BE VLG\'',
    fontWeight: 400,
    baseline: 0.85
  },
  chewy: {
    fontFamily: '\'Chewy\'',
    fontWeight: 400,
    baseline: 0.75
  },
  courier: {
    fontFamily: '\'Courier Prime\'',
    fontWeight: 700,
    baseline: 0.65
  },
  fugaz: {
    fontFamily: '\'Fugaz One\'',
    fontWeight: 400,
    baseline: 0.75
  },
  sedan: {
    fontFamily: '\'Sedan\'',
    fontWeight: 400,
    baseline: 0.75
  }
};
