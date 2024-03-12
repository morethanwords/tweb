import {createEffect, on, onMount, splitProps} from 'solid-js'
import RangeSelector from './rangeSelector'

export type RangeSelectorProps =
  ConstructorParameters<typeof RangeSelector>[0] &
  Parameters<RangeSelector['setHandlers']>[0] &
  {value: number, class?: string};

export const RangeSelectorTsx = (props: RangeSelectorProps) => {
  const [events, options] = splitProps(props, [
    'onMouseDown',
    'onMouseUp',
    'onScrub',
    'value',
    'class'
  ]);

  const selector = new RangeSelector(options);

  createEffect(on(() => props.value, (value) => {
    selector.setProgress(value);
  }));

  createEffect(on(() => [options.min, options.max], ([min, max]) => {
    selector.setMinMax(min, max);
  }, {defer: true}));

  createEffect(on(() => events, (handlers) => {
    selector.setHandlers(handlers);
  }));
  createEffect(on(() => props.class, (className, prev) => {
    if(prev) selector.container.classList.remove(prev);
    if(className) selector.container.classList.add(className);
  }));
  onMount(() => selector.setListeners());

  return selector.container;
};
