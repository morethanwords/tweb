import {Accessor, Ref, Show, createEffect, createSignal, on} from 'solid-js';
import {cnTopbarLive} from './topbarLive.cn';
import liteMode from '../../../helpers/liteMode';
import {i18n} from '../../../lib/langPack';

interface TopbarLiveButtonProps {
  animationTrigger: Accessor<PeerId>,
  ref?: Ref<HTMLButtonElement>
}

export const TopbarLiveButton = (props: TopbarLiveButtonProps) => {
  const available = liteMode.isAvailable('animations');
  const [animating, setAnimating] = createSignal(available);

  available && createEffect(
    on(
      props.animationTrigger,
      () => {
        setAnimating(true);
      }
    )
  );

  return (
    <button ref={props.ref} class={cnTopbarLive('-button-wrap')}>
      <Show when={animating()}>
        <div
          class={cnTopbarLive('-button-animation')}
          onAnimationEnd={() => setAnimating(false)}
        />
      </Show>

      <div class={cnTopbarLive('-button')}>{i18n('Rtmp.Topbar.Join')}</div>
    </button>
  );
};
