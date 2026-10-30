/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createMemo, createSignal, onCleanup, onMount, Show} from 'solid-js';
import liteMode from '@helpers/liteMode';
import classNames from '@helpers/string/classNames';
import useReducedMotion from '@stores/reducedMotion';
import {IconTsx} from '@components/iconTsx';
import {Appearance, GemStyle, GemView} from '@components/wallet/visual/gem/stage';
import {pixelRatio} from '@components/wallet/visual/dom';
import {clock} from '@components/wallet/visual/clock';
import {addWalletFrameClient} from '@components/wallet/frameLoop';
import styles from '@components/wallet/gem.module.scss';

type WalletGemProps = {
  /** canvas side, CSS px; the gem itself is `widthPoints` wide inside it */
  size: number,
  widthPoints: number,
  appearance?: Appearance,
  visible: Accessor<boolean>,
  style?: Partial<GemStyle>,
  class?: string,
  burst?: boolean
};

/**
 * A live gem on its own canvas — the headers of the wallet's sheets. Without WebGL2 or with the animations off it is
 * the flat gem glyph, also when they are turned off while it shows; with reduced ones the gem stands still, drawn
 * once. A click spins it.
 */
export default function WalletGem(props: WalletGemProps) {
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = createSignal(false);
  // * the app's setting and the system's reduce motion (which `liteMode` reads under the keyboard layer) both count
  const flat = createMemo(() => {
    reducedMotion();
    return failed() || !liteMode.isAvailable('animations');
  });
  const still = createMemo(() => {
    reducedMotion();
    return !liteMode.isAvailable('motion');
  });

  return (
    <div class={classNames(styles.gem, props.class)} style={{width: props.size + 'px', height: props.size + 'px'}}>
      <Show
        when={!flat() && (still() ? 'still' : 'live')}
        keyed
        fallback={<IconTsx icon="gram_filled" class={styles.fallback} style={{'font-size': props.widthPoints + 'px'}} />}
      >
        {(mode) => <WalletGemCanvas {...props} still={mode === 'still'} onFail={() => setFailed(true)} />}
      </Show>
    </div>
  );
}

/** the live gem: its GL view and frame client go with it when the gem turns flat or still */
function WalletGemCanvas(props: WalletGemProps & {still: boolean, onFail: () => void}) {
  let canvas: HTMLCanvasElement;

  onMount(() => {
    let gem: GemView;
    try {
      gem = new GemView(canvas, {
        appearance: props.appearance ?? Appearance.blue,
        rotationSpeed: 2 * Math.PI / 26,
        widthPoints: props.widthPoints,
        lightBackground: true,
        backgroundStars: !!props.burst,
        starEmission: 0.28,
        burstSize: 0.25,
        starZoom: 0.55,
        ...props.style
      });
    } catch(err) {
      props.onFail();
      return;
    }

    gem.setSize(props.size, pixelRatio());
    // * reduced animations: the gem's first frame, and nothing that turns, glints or bursts after it
    if(props.still) {
      gem.render(0);
      onCleanup(() => gem.destroy());
      return;
    }

    const cancelBurst = props.burst ? clock.after(0.15, () => gem.burst()) : undefined;

    // * a gem whose screen went under another one (hidden) or out of the scroll draws nothing
    const detach = addWalletFrameClient({
      frame: (now) => gem.render(now),
      isVisible: props.visible,
      element: canvas,
      onHidden: () => gem.resetClock()
    });

    const onClick = () => gem.kick(9, 1.2);
    canvas.addEventListener('click', onClick);
    onCleanup(() => {
      cancelBurst?.();
      canvas.removeEventListener('click', onClick);
      detach();
      gem.destroy();
    });
  });

  return (
    <canvas
      ref={canvas}
      class={classNames(styles.canvas, props.still && styles.still)}
      style={{width: props.size + 'px', height: props.size + 'px'}}
      aria-hidden="true"
    />
  );
}
