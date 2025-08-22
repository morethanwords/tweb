import {createEffect, createMemo, createSignal, JSX, on, onCleanup, onMount} from 'solid-js';
import {StarGiftAttribute} from '../../layer';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import wrapEmojiPattern from '../wrappers/emojiPattern';
import {getMiddleware} from '../../helpers/middleware';
import {rgbIntToHex} from '../../helpers/color';

const MIN_OPACITY = .1;
const MID_OPACITY = .2;
const MAX_OPACITY = .3;
const CANVAS_WIDTH = 266;
const CANVAS_HEIGHT = 184;

const SMALL_CANVAS_WIDTH = 120;
const SMALL_CANVAS_HEIGHT = 120;

import styles from './stargiftBackdrop.module.scss';
import classNames from '../../helpers/string/classNames';
import {Transition} from '../../vendor/solid-transition-group';

const POSITIONS: [number, number, number, number][] = [
  [55, 47, 18, MAX_OPACITY],
  [23, 26, 18, MID_OPACITY],
  [0, 64, 18, MID_OPACITY],
  [0, 165, 18, MIN_OPACITY],
  [17, 125, 18, MID_OPACITY],
  [58, 141, 22, MAX_OPACITY],
  [81, 13, 24, MAX_OPACITY],
  [38, 82, 26, MAX_OPACITY],
  [187, 46, 18, MAX_OPACITY],
  [219, 26, 18, MID_OPACITY],
  [119, 5, 18, MAX_OPACITY],
  [242, 64, 18, MID_OPACITY],
  [245, 165, 18, MIN_OPACITY],
  [225, 125, 18, MID_OPACITY],
  [118, 151, 22, MAX_OPACITY],
  [180, 141, 22, MAX_OPACITY],
  [155, 13, 24, MAX_OPACITY],
  [196, 82, 26, MAX_OPACITY]
]

const POSITIONS_SMALL: [number, number, number, number][] = [
  [49, 1, 20, MAX_OPACITY],
  [93, 12, 20, MAX_OPACITY],
  [99, 42, 20, MAX_OPACITY],
  [89, 86, 20, MAX_OPACITY],
  [49, 97, 20, MAX_OPACITY],
  [9, 86, 20, MAX_OPACITY],
  [0, 42, 20, MAX_OPACITY],
  [5, 12, 20, MAX_OPACITY]
];

export function StarGiftBackdrop(props: {
  class?: string
  small?: boolean
  canvasClass?: string
  backdrop: StarGiftAttribute.starGiftAttributeBackdrop
  patternEmoji: MyDocument
}) {
  const middlewareHelper = getMiddleware();

  const [patternCanvas, setPatternCanvas] = createSignal<HTMLCanvasElement>();

  function render() {
    const middleware = middlewareHelper.get();
    const currentEmoji = props.patternEmoji;
    wrapEmojiPattern({
      docId: props.patternEmoji,
      middleware,
      canvasWidth: props.small ? SMALL_CANVAS_WIDTH : CANVAS_WIDTH,
      canvasHeight: props.small ? SMALL_CANVAS_HEIGHT : CANVAS_HEIGHT,
      emojiSize: 24,
      positions: props.small ? POSITIONS_SMALL : POSITIONS,
      color: rgbIntToHex(props.backdrop.pattern_color)
    }).then((canvas) => {
      if(!middleware()) return;
      if(currentEmoji !== props.patternEmoji) return
      canvas.classList.add(styles.canvas, props.canvasClass);
      setPatternCanvas(canvas);
    });
  }

  createEffect(on(() => [props.patternEmoji, props.backdrop], () => {
    render();
  }));

  return (
    <div
      class={classNames(styles.wrap, props.class)}
      style={{
        '--stargift-backdrop-edge-color': rgbIntToHex(props.backdrop.edge_color),
        '--stargift-backdrop-center-color': rgbIntToHex(props.backdrop.center_color)
      }}
    >
      <Transition>
        {patternCanvas()}
      </Transition>
      <div class={classNames(styles.halo, props.small && styles.haloSmall)} />
    </div>
  );
}
