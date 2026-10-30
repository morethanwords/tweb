/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * The transfer card's timing, from the desktop client's history_view_gram_transfer.cpp: the bubble's bump when a
 * transfer settles or is read, and the digits' roll when an incoming card is read; the spacing between the reads
 * of several cards at once is iOS's.
 */

export type BumpCurve = {
  rise: number,
  hold: number,
  fall: number,
  settle: number,
  fallEase: number,
  undershoot: number
};

export const SETTLE_BUMP: BumpCurve = {rise: 150, hold: 33, fall: 200, settle: 200, fallEase: 1.2, undershoot: .043};
export const READ_PRESS: BumpCurve = {rise: 33, hold: 0, fall: 167, settle: 300, fallEase: 1.2, undershoot: .64};
export const SETTLE_AMPLITUDE = .07;
export const READ_POP_AMPLITUDE = .03;
export const READ_PRESS_DEPTH = .025;

export const GLARE_DURATION = 1100;
export const GLARE_PAUSE = 400;
export const SPIN_DURATION = 1700;
/** the sweep turns this many degrees a second while the card is sending */
export const SENDING_SPEED = 90;
export const READ_ROLL_FIRST = 876;
export const READ_ROLL_DURATION = 1000;
const READ_ROLL_EASE = 1.5;
const READ_ROLL_CYCLE = 10;
/** at most one card starts its read in this long (iOS: one arrival per 0.9 s) */
export const READ_SPACING = 900;
export const REVEAL_FILL = 160;
export const REVEAL_COLOR_DELAY = 20;
export const REVEAL_COLOR = 200;
export const REVEAL_WORD_DELAY = 33;
export const REVEAL_WORD = 140;
export const REVEAL_CLOCK = 43;

export function bumpDuration(curve: BumpCurve) {
  return curve.rise + curve.hold + curve.fall + curve.settle;
}

export function bumpShape(curve: BumpCurve, elapsed: number) {
  if(elapsed <= 0 || elapsed >= bumpDuration(curve)) {
    return 0;
  } else if(elapsed < curve.rise) {
    return elapsed / curve.rise;
  }

  const fall = elapsed - curve.rise - curve.hold;
  if(fall < 0) {
    return 1;
  } else if(fall < curve.fall) {
    return Math.pow(1 - fall / curve.fall, curve.fallEase);
  }

  const settle = (fall - curve.fall) / curve.settle;
  return -curve.undershoot * Math.sin(Math.PI * settle);
}

/** Keyframes that follow a function of the time closely enough to run with a linear easing between them. */
export function sampleKeyframes(duration: number, at: (elapsed: number) => Keyframe, step = 1000 / 60) {
  const frames: Keyframe[] = [];
  for(let elapsed = 0; elapsed < duration; elapsed += step) {
    frames.push({...at(elapsed), offset: elapsed / duration});
  }

  frames.push({...at(duration), offset: 1});
  return frames;
}

/**
 * How many steps each digit of an amount rolls when its card is read: the leading zeros stand, every other digit
 * turns a whole cycle and then up to its value; the first rolling digit lands first.
 */
export function readRollSteps(text: string) {
  const steps: number[] = [];
  let rolling = 0;
  for(const char of text) {
    if(char < '0' || char > '9') {
      steps.push(-1);
      continue;
    }

    const digit = +char;
    if(!digit && !rolling) {
      steps.push(0);
    } else {
      steps.push(READ_ROLL_CYCLE + digit);
      ++rolling;
    }
  }

  return {steps, rolling};
}

/** when the rolling digit with this index (among the rolling ones) lands */
export function readRollLands(index: number, rolling: number) {
  const early = (rolling - 1 - index) / Math.max(rolling - 1, 1);
  return READ_ROLL_DURATION - (READ_ROLL_DURATION - READ_ROLL_FIRST) * early;
}

export function readRollProgress(progress: number) {
  return 1 - Math.pow(1 - progress, READ_ROLL_EASE);
}

const turns: number[] = [];

/**
 * A turn in the line of cards being read: one card at a time, READ_SPACING apart. A card that goes away before
 * its turn leaves the line, so the cards after it are not held up; a turn that has come still spaces the next.
 */
export function joinReadLine(now = performance.now()) {
  if(turns.length && now >= turns[turns.length - 1] + READ_SPACING) {
    turns.length = 0;
  }

  const at = turns.length ? turns[turns.length - 1] + READ_SPACING : now;
  turns.push(at);
  return {
    at,
    leave: (when = performance.now()) => {
      const index = turns.indexOf(at);
      if(at > when && index !== -1) {
        turns.splice(index, 1);
      }
    }
  };
}
