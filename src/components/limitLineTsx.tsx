import {createEffect, createSignal, JSX, on, onMount, Show} from 'solid-js'
import {IconTsx} from '@components/iconTsx'
import {doubleRaf} from '@helpers/schedulers'
import liteMode from '@helpers/liteMode'
import {animateSingle} from '@helpers/animation'
import {easeInOutSineApply} from '@helpers/easing/easeInOutSine'
import classNames from '@helpers/string/classNames'
import clamp from '@helpers/number/clamp'
import styles from '@components/limitLineTsx.module.scss';
import RangeSelector from '@components/rangeSelector'
import I18n from '@lib/langPack'
import {lerp} from '@helpers/lerp'


export function LimitLineTsx(props: {
  class?: string
  progress: number
  reverse?: boolean
  animateProgress?: boolean
  progressFrom?: JSX.Element
  progressTo?: JSX.Element
  progressClass?: string
  progressFilledClass?: string
  onScrub?: (progress: number) => void
  filledProgressElement?: HTMLElement
  hint?: JSX.Element
  hintIcon?: Icon
  hintJustIcon?: boolean
}) {
  const [progress, setProgress] = createSignal(props.progress)
  const [hintActive, setHintActive] = createSignal(false)

  let containerRef!: HTMLDivElement
  let hintRef!: HTMLDivElement;
  let tailRef!: HTMLDivElement;
  let tailContainerRef!: HTMLDivElement;

  const isSlider = props.onScrub !== undefined
  const isReverse = () => props.reverse ?? I18n.isRTL

  onMount(() => {
    const resizeObserver = new ResizeObserver(updateHintPosition);
    resizeObserver.observe(hintRef);
    doubleRaf().then(() => {
      setHintActive(true)
      updateHintPosition()
    })
  })

  function updateHintPosition() {
    const hintWidth = hintRef.clientWidth; // ! not bounding rect so transform is not applied
    const parentWidth = hintRef.parentElement.getBoundingClientRect().width;

    const progress$ = progress()
    let sliderTipPosition = progress$ * parentWidth
    if(isSlider) {
      // adjust for slider thumb (30 - thumb width + padding)
      sliderTipPosition += 30 * (1 - progress$) - 15;
    }
    if(isReverse()) {
      sliderTipPosition = parentWidth - sliderTipPosition;
    }

    // hint position
    const hintLeft = sliderTipPosition - hintWidth / 2;
    const hintPadding = isSlider ? 8 : 0;
    const minHintLeft = hintPadding;
    const maxHintLeft = parentWidth - hintWidth - hintPadding;
    const hintLeftClamped = clamp(hintLeft, minHintLeft, maxHintLeft);
    // for the second half align to the right to avoid issues with hidpi rendering
    if(hintLeftClamped < parentWidth / 2) {
      hintRef.style.setProperty('--left', hintLeftClamped + 'px');
      hintRef.style.setProperty('--right', 'auto');
    } else {
      hintRef.style.setProperty('--left', 'auto');
      hintRef.style.setProperty('--right', parentWidth - hintWidth - hintLeftClamped + 'px');
    }

    // tail position
    const tailWidth = 46;
    const halfTailWidth = tailWidth / 2;
    const extra = 15;
    const extraHalf = extra / 2;
    const tailLeft = sliderTipPosition - halfTailWidth;
    let tailLeft2 = tailLeft;
    const tailLeftMin = isSlider ? -extra : -halfTailWidth;
    const tailLeftMax = isSlider ? parentWidth - tailWidth + extra : parentWidth;
    if(isSlider) {
      if((tailLeftMax - tailLeft) < extra) {
        tailLeft2 += lerp(0, extra, 1 - (tailLeftMax - tailLeft) / extra);
      }
      if(tailLeft < extraHalf) {
        tailLeft2 -= lerp(0, extra, 1 - -(-extraHalf - tailLeft) / extra);
      }
    }

    const tailLeftClamped = clamp(tailLeft2, tailLeftMin, tailLeftMax);
    tailContainerRef.style.setProperty('--tail-left', (tailLeftClamped - hintLeftClamped) + 'px');
    tailRef.style.setProperty('--tail-left-relative', String(clamp((sliderTipPosition - hintLeftClamped) / hintWidth, 0, 1)));

    // tail clip
    const cutoffStart = isSlider ? 8 : 0;
    const tailCutoffLeft = tailLeft2 > cutoffStart ? 0 : clamp((Math.abs(tailLeft2 - cutoffStart) / tailWidth) * 100, 0, 50);
    const tailRight = parentWidth - tailLeft2 - tailWidth;
    const tailCutoffRight = tailRight > cutoffStart ? 0 : clamp((Math.abs(tailRight - cutoffStart) / tailWidth) * 100, 0, 50);
    tailContainerRef.style.clipPath = `inset(0 ${tailCutoffRight}% 0 ${tailCutoffLeft}%)`;

    // border rounding
    const borderRadius = 24;
    const roundingAt = isSlider ? 20 : 14;
    const roundingStart = borderRadius - roundingAt;
    const leftProgress = tailLeft2 < roundingAt ? Math.max(0, (roundingStart + tailLeft2)) / borderRadius : 1;
    const rightProgress = tailRight < roundingAt ? Math.max(0, (roundingStart + tailRight)) / borderRadius : 1;

    const radiusLeftBottom = leftProgress === 1 ? borderRadius : lerp(0, borderRadius, leftProgress);
    const radiusRightBottom = rightProgress === 1 ? borderRadius : lerp(0, borderRadius, rightProgress);

    hintRef.style.setProperty('--border-radius', `${borderRadius}px ${borderRadius}px ${radiusRightBottom}px ${radiusLeftBottom}px`);
  }

  let line: JSX.Element
  let range: RangeSelector;
  if(isSlider) {
    range = new RangeSelector({
      step: 0.0001,
      min: 0,
      max: 1,
      useProperty: true,
      offsetAxisValue: 30
    }, progress());
    range.setListeners();
    range.setHandlers({
      onScrub: props.onScrub
    });
    range.container.classList.add(styles.line, styles.slider);
    line = range.container;

    if(props.filledProgressElement) {
      onMount(() => {
        range.container.querySelector('.progress-line__filled').appendChild(props.filledProgressElement);
      })
    }
  } else {
    line = (
      <div class={styles.line}>
        <Show when={props.progressFrom || props.progressTo}>
          <div class={classNames(styles.linePart, props.progressClass)}>
            {props.progressFrom}
            {props.progressTo}
          </div>
          <div class={classNames(`${styles.linePart} ${styles.lineFilled}`, props.progressFilledClass)}>
            {props.progressFrom}
            {props.progressTo}
          </div>
        </Show>
      </div>
    )
  }

  createEffect(on(() => props.progress, (val, prev) => {
    if(prev !== undefined && liteMode.isAvailable('animations') && !isSlider && props.animateProgress !== false) {
      const duration = 200;
      const startTime = performance.now();
      const diff = val - prev;

      animateSingle(() => {
        const v = clamp((performance.now() - startTime) / duration, 0, 1);
        const eased = easeInOutSineApply(v, 1)
        const value = prev + eased * diff;
        setProgress(value);
        updateHintPosition();

        return v < 1;
      }, containerRef);
    } else {
      setProgress(val);
      updateHintPosition();
      range?.setProgress(val);
    }
  }))

  return (
    <div
      class={classNames(
        styles.container,
        props.hintJustIcon && styles.justIcon,
        ('hint' in props || props.hintIcon) && styles.hasHint,
        isReverse() && styles.reverse,
        props.class
      )}
      style={{'--limit-progress': progress() * 100 + '%'}}
      ref={containerRef}
    >
      <Show when={'hint' in props || props.hintIcon}>
        <div
          class={classNames(styles.hint, hintActive() && styles.active)}
          ref={hintRef}
        >
          {props.hintIcon && <IconTsx icon={props.hintIcon} class={styles.hintIcon} />}
          {props.hint}
          <div class={styles.hintTailContainer} ref={tailContainerRef}>
            <div class={styles.hintTail} ref={tailRef} />
          </div>
        </div>
      </Show>

      {line}
    </div>
  )
}
