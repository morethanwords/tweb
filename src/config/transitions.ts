type Transition<D extends TransitionDuration> = {
  easing: string, // * css
  duration: D // * ms
};

type TransitionDurationFull = {true: number, false: number};
type TransitionDurationShort = number;
type TransitionDuration = TransitionDurationShort | TransitionDurationFull;
type TransitionType = 'standard';

const Transitions: {[key in TransitionType]: Transition<TransitionDuration>} = {
  standard: {
    easing: 'cubic-bezier(.4, .0, .2, 1)',
    duration: {true: 300, false: 250}
  }
};

export function getTransition(
  type: TransitionType,
  forwards = true,
  keyframes?: Keyframe[]
): Transition<number> & {keyframes: any[]} {
  const transition = Transitions[type];

  if(!forwards && keyframes) {
    keyframes = keyframes.slice().reverse();
  }

  if(typeof(transition.duration) !== 'number') {
    return {
      ...transition,
      duration: transition.duration[('' + forwards) as keyof TransitionDurationFull],
      keyframes
    };
  }

  return {
    ...transition as Transition<TransitionDurationShort>,
    keyframes
  };
}

export default Transitions;
