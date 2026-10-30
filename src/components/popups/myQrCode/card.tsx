import {Accessor, createEffect, createMemo, For, on, onCleanup, onMount, Show} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import {Caption, captionPlacement} from './caption';
import {CardGeometry} from './layout';
import createLayerStack from './layerStack';
import renderQr from './qr';
import styles from '@components/popups/myQrCode.module.scss';

/**
 * The white card: the code, and under it the username, the phone number or the name. It stays as it is in every
 * theme and direction; only its ink and the tint of its shadow follow the backdrop.
 */
export function QrCard(props: {
  geometry: Accessor<CardGeometry>,
  ink: Accessor<string>,
  shadow: Accessor<string>,
  url: Accessor<string>,
  caption: Accessor<Caption | undefined>,
  /** What the card is, for someone who cannot see it */
  label: Accessor<string>,
  /** Hands over a way to the painted code, for the exported picture */
  qrRef?: (get: () => HTMLCanvasElement | undefined) => void
}) {
  let qrHost: HTMLDivElement;
  let stack: ReturnType<typeof createLayerStack>;
  let middleware = getMiddleware();

  onMount(() => {
    stack = createLayerStack(qrHost, styles.qrCanvas, styles.qrShown);
  });

  props.qrRef?.(() => stack?.current);

  // the code is drawn again for a new link or ink, and fades in over the old one
  createEffect(on(() => [props.url(), props.ink()] as const, ([url, ink]) => {
    middleware.destroy();
    middleware = getMiddleware();
    const current = middleware.get();
    if(!url) {
      stack.set(undefined);
      return;
    }

    renderQr(url, ink).then((canvas) => {
      if(current() && canvas) stack.set(canvas);
    }, () => {});
  }));

  onCleanup(() => {
    middleware.destroy();
    stack?.destroy();
  });

  const placement = createMemo(() => captionPlacement(props.geometry(), props.caption()));

  return (
    <div
      class={styles.card}
      role="img"
      aria-label={props.label()}
      style={{
        width: props.geometry().width + 'px',
        height: props.geometry().height + 'px',
        'border-radius': props.geometry().radius + 'px',
        'box-shadow': `0 ${props.geometry().shadowOffset}px ${props.geometry().shadowBlur}px ${props.shadow()}`,
        '--ink': props.ink()
      }}
    >
      <div
        ref={qrHost}
        class={styles.qr}
        aria-hidden="true"
        style={{
          left: props.geometry().qrLeft + 'px',
          top: props.geometry().qrTop + 'px',
          width: props.geometry().qrSide + 'px',
          height: props.geometry().qrSide + 'px'
        }}
      />
      <Show when={placement()}>
        <div
          class={styles.caption}
          aria-hidden="true"
          dir={props.caption().kind === 'name' ? 'auto' : 'ltr'}
          style={{
            top: placement().top + 'px',
            'font-size': placement().fontSize + 'px',
            'line-height': placement().lineHeight + 'px'
          }}
        >
          <For each={placement().lines}>{(line) => <div class={styles.captionLine}>{line}</div>}</For>
        </div>
      </Show>
    </div>
  );
}
