import {Accessor, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import liteMode from '@helpers/liteMode';
import {Caption, captionPlacement} from './caption';
import {CardGeometry} from './layout';
import createLayerStack from './layerStack';
import renderQr, {RenderedQr} from './qr';
import createQrIntro from './qrIntro';
import styles from '@components/popups/myQrCode.module.scss';

// a code that comes this long after the open has begun shows as it is, not built
const INTRO_LATE_MS = 600;

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
  /**
   * When the screen's open began (`performance.now()`), and with it the build of the first code; none while it has not
   * (the first code waits for it), 0 for an open that builds nothing
   */
  introStart: Accessor<number | undefined>,
  /** Hands over a way to the painted code, for the exported picture */
  qrRef?: (get: () => HTMLCanvasElement | undefined) => void
}) {
  let qrHost: HTMLDivElement;
  let stack: ReturnType<typeof createLayerStack<HTMLCanvasElement>>;
  let middleware = getMiddleware();
  // the code on the card (the one being built too), and the build while it runs
  let code: HTMLCanvasElement;
  let intro: {replace: (rendered: RenderedQr, ink: string) => void, stop: () => void};
  // the first code, until the open says how it comes
  const [first, setFirst] = createSignal<RenderedQr>();
  let firstShown = false;

  onMount(() => {
    stack = createLayerStack(qrHost, {className: styles.qrCanvas});
  });

  props.qrRef?.(() => code);

  // the code is drawn again for a new link or ink, and fades in over the old one
  createEffect(on(() => [props.url(), props.ink()] as const, ([url, ink]) => {
    middleware.destroy();
    middleware = getMiddleware();
    const current = middleware.get();
    if(!url) {
      intro?.stop();
      code = undefined;
      stack.set(undefined);
      return;
    }

    renderQr(url, ink).then((rendered) => {
      if(!current() || !rendered) return;
      if(!firstShown) {
        setFirst(rendered);
        return;
      }

      code = rendered.canvas;
      // a code that comes while the first one builds is what is built
      if(intro && rendered.modules) intro.replace(rendered, ink);
      else {
        intro?.stop();
        stack.set(rendered.canvas);
      }
    }, () => {});
  }));

  // the first code is built as the screen opens, from its first frame, where the motion is full; else it comes as any
  createEffect(() => {
    const rendered = first(), start = props.introStart();
    if(!rendered || start === undefined || firstShown) return;
    firstShown = true;
    code = rendered.canvas;
    if(!start || !rendered.modules || !liteMode.isAvailable('motion') || performance.now() - start > INTRO_LATE_MS) {
      stack.set(rendered.canvas);
      return;
    }

    const build = createQrIntro(rendered.canvas, rendered.modules, props.geometry().qrSide, props.ink());
    stack.set(build.canvas, {instant: true});
    const stop = build.play(() => {
      intro = undefined;
      // the code itself, in the frame the build is whole
      stack.set(code, {instant: true});
    });
    intro = {
      replace: (next, ink) => build.replace(next.canvas, next.modules, ink),
      stop: () => {
        stop();
        intro = undefined;
      }
    };
  });

  onCleanup(() => {
    intro?.stop();
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
