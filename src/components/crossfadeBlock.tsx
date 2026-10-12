import {AutoHeight} from '@components/autoHeight';
import Animated, {GrowHeightReveal} from '@helpers/solid/animations';
import {createMemo, JSX, Show} from 'solid-js';

/**
 * A block that grows in when there is something to show and shrinks away when there is not, while
 * what it shows is swapped by a crossfade, its height following - one notice taking another's place
 * stays where it is, instead of the old one shrinking away over the new one growing in.
 * A new `value` is a new content, so compare it by what tells one from the next (`createMemo`'s
 * `equals`) when it is rebuilt on every update
 */
export default function CrossfadeBlock<T>(props: {
  value: T | undefined,
  class?: string,
  children: (value: T) => JSX.Element
}) {
  // * the block that leaves keeps what it showed while it shrinks away
  const shown = createMemo<T>((previous) => props.value || previous);

  return (
    <GrowHeightReveal when={props.value} class={props.class}>
      <AutoHeight>
        <div class="crossfade-block">
          <Animated type="cross-fade" noItemClass itemClass="crossfade-block-item">
            <Show keyed when={shown()}>{(value) => props.children(value)}</Show>
          </Animated>
        </div>
      </AutoHeight>
    </GrowHeightReveal>
  );
}
