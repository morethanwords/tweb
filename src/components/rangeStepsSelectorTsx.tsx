import {createEffect, createMemo, createSignal, For, JSX} from 'solid-js';
import clamp from '@helpers/number/clamp';
import RangeSelector from '@components/rangeSelectorTsx';
import classNames from '@helpers/string/classNames';

export type RangeStep<T = any> = [
  text: JSX.Element,
  value: T
];

export default function RangeStepsSelector<T = any>(props: {
  class?: string,
  steps: RangeStep<T>[],
  index?: number,
  indexByValue?: T,
  noFirstLast?: boolean,
  // generateStep?: (value: T) => RangeStep<T>,
  // generateSteps?: (values: T[]) => RangeStep<T>[],
  onValue?: (value: T) => void
}) {
  const steps = createMemo<RangeStep<T>[]>(() => {
    if(props.steps) {
      return props.steps;
    }

    // const values = props.values ?? [];
    // if(!props.generateStep && !props.generateSteps) {
    //   return [] as RangeStep<T>[];
    // }

    // if(props.generateSteps) {
    //   return props.generateSteps(values);
    // }

    // return values.map((value) => props.generateStep!(value));
  });

  const maxIndex = createMemo(() => Math.max(steps().length - 1, 0));
  const clampIndex = (index: number) => clamp(index, 0, maxIndex());
  const [index, setIndex] = createSignal(0);

  createEffect(() => {
    if(props.index !== undefined) {
      setIndex(clampIndex(props.index));
      return;
    }

    if(props.indexByValue !== undefined) {
      const valueIndex = steps().findIndex((step) => step[1] === props.indexByValue);
      setIndex(clampIndex(valueIndex));
      return;
    }

    setIndex((currentIndex) => clampIndex(currentIndex));
  });

  const applyIndex = (nextIndex: number) => {
    const clampedIndex = clampIndex(Math.round(nextIndex));
    setIndex(clampedIndex);

    const step = steps()[clampedIndex];
    props.onValue?.(step[1]);
  };

  return (
    <div class={classNames('range-setting-selector', 'range-steps-selector', props.class)}>
      <RangeSelector
        step={1}
        min={0}
        max={maxIndex()}
        value={index()}
        onScrub={applyIndex}
      >
        <For each={steps()}>
          {(step, idx) => {
            const currentIndex = idx();
            const lastIndex = maxIndex();
            const isLast = currentIndex === lastIndex;
            const left = lastIndex ? `${currentIndex / lastIndex * 100}%` : '0%';

            return (
              <div
                class="range-setting-selector-option"
                classList={{
                  'is-first': currentIndex === 0 && !props.noFirstLast,
                  'is-last': isLast && !props.noFirstLast,
                  'active': index() >= currentIndex,
                  'is-chosen': index() === currentIndex
                }}
                style={{
                  left: isLast ? undefined : left,
                  right: isLast ? '0' : undefined
                }}
              >
                <div class="range-setting-selector-option-text">{step[0]}</div>
              </div>
            );
          }}
        </For>
      </RangeSelector>
    </div>
  );
}
