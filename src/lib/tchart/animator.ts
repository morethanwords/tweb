import TComposer from './composer';
import {TChartAnimationItem, TChartAnimationProperty, TChartState} from './types';

const easing = (st: number, ed: number, per: number, tween: string) => {
  const functions: Record<string, (t: number, b: number, c: number, d: number) => number> = {
    linear: (t, b, c, d) => {
      return c * t / d + b;
    },

    easeInOutQuad: (t, b, c, d) => {
      t /= d * 0.5;
      if(t < 1) return c * 0.5 * t * t + b;
      t--;
      return -c / 2 * (t * (t - 2) - 1) + b;
    }
  };

  return functions[tween](per, st, ed - st, 1);
};

export default class TAnimator {
  private composer: TComposer;
  private state: TChartState;
  private queue: Record<keyof TChartState, TChartAnimationItem> = {} as any;
  private queueSize: number = 0;
  private animFrame?: number;

  constructor(opts: {state: TChartState, composer: TComposer}) {
    this.composer = opts.composer;
    this.state = opts.state;
  }

  public add<T extends TChartAnimationProperty<any>>(params: T[]) {
    let i = 0;
    const j = 0;
    const cur = +new Date();
    let item: TChartAnimationItem, param: TChartAnimationProperty, delta: number;
    const queue = this.queue;

    while(i < params.length) {
      param = params[i];
      item = queue[param.prop];

      if(!item) {
        if(param.end === param.state[param.prop]) {
          param.cbEnd && param.cbEnd(param.state);
          i++;
          continue;
        }

        item = {
          lastStart: 1
        } as TChartAnimationItem;
        queue[param.prop] = item;
        this.queueSize++;
      }

      delta = cur - item.lastStart;

      param.duration *= this.state.speed;
      param.delay *= this.state.speed;

      item.cbEnd = param.cbEnd;
      item.state = param.state;
      item.lastStart = cur;
      item.start = param.state[param.prop] as number;
      item.end = param.end;
      item.startDt = cur + (param.delay || 0);
      item.endDt =
        item.startDt +
        (param.duration || 0) -
        (param.fixed ? 0 : Math.max(param.duration - delta, 0));
      item.tween = param.tween || 'easeInOutQuad';
      item.speed = param.speed;
      item.group = param.group;

      i++;
    }

    if(!this.animFrame) {
      this.animFrame = requestAnimationFrame(this.step);
    }
  }

  public get(prop: keyof TChartState) {
    return this.queue[prop];
  }

  private step = () => {
    const done: (keyof TChartState)[] = [];
    const cur = +new Date();
    let item: TChartAnimationItem,
      time: number,
      duration: number,
      per: number,
      curVal: number,
      newVal: number;
    const group: TChartAnimationProperty['group'] = {top: false, bottom: false};

    for(const itemKey in this.queue) {
      item = this.queue[itemKey as keyof TChartState];
      time = cur;
      duration = item.endDt - item.startDt;
      curVal = item.state[itemKey as keyof TChartState] as number;
      const delayed = time < item.startDt;

      if(time < item.startDt) {
        time = item.startDt;
      } else if(time > item.endDt) {
        time = item.endDt;
      }

      per = duration ? (time - item.startDt) / duration : (delayed ? 0 : 1);

      let newVal: number;
      if(per < 1) {
        if(item.tween === 'exp') {
          newVal = curVal + (item.end - curVal) * item.speed;
        } else {
          newVal = easing(item.start, item.end, per, item.tween);
        }
      } else {
        newVal = item.end;
      }

      if(newVal !== curVal) {
        // @ts-ignore
        item.state[itemKey as keyof TChartState] = newVal;
        group.top = group.top || item.group.top;
        group.bottom = group.bottom || item.group.bottom;
      } else if(newVal === item.end) {
        done.push(itemKey as keyof TChartState);
      }
    }

    // Remove animations that are done
    let j = 0;
    while(j < done.length) {
      this.queue[done[j]].cbEnd && this.queue[done[j]].cbEnd(this.queue[done[j]].state);
      delete this.queue[done[j]];
      j++;
    }

    this.queueSize -= done.length;

    this.composer.render(group);

    if(!this.queueSize) {
      delete this.animFrame;
    } else {
      this.animFrame = requestAnimationFrame(this.step);
    }
  };
}
