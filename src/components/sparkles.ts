import {createEffect, on} from 'solid-js';
import {template} from 'solid-js/web';

export interface Sparkle {
  x: number;
  y: number;
  translateX: number;
  translateY: number;
  scale: number;
  delay: number;
  minOpacity?: number;
}

interface ContainerSize {
  width: number;
  height: number;
}

const BUTTON_SPARKLES: Sparkle[] = [
  {x: 20, y: 0, scale: 1, delay: 500},
  {x: 15, y: 15, scale: 0.75, delay: 3500},
  {x: 10, y: 35, scale: 0.75, delay: 4500},
  {x: 20, y: 70, scale: 1.25, delay: 1500},
  {x: 40, y: 10, scale: 1.25, delay: 0},
  {x: 45, y: 60, scale: 0.75, delay: 3000},
  {x: 60, y: -10, scale: 1, delay: 1000},
  {x: 55, y: 40, scale: 0.75, delay: 3000},
  {x: 70, y: 65, scale: 1, delay: 4500},
  {x: 80, y: 10, scale: 0.75, delay: 1500},
  {x: 80, y: 45, scale: 1.25, delay: 0}
].map((it) => ({
  ...it,
  translateX: Math.cos(Math.atan2(-50 + it.y, -50 + it.x)) * 100,
  translateY: Math.sin(Math.atan2(-50 + it.y, -50 + it.x)) * 100
}));

export function generateProgressSparkle(): Sparkle {
  return {
    x: Math.random() * 100,
    y: Math.random() * 100,
    translateX: (Math.random() * 5 + 15) * 100,
    translateY: (Math.random() * 10 - 5) * 100,
    scale: (Math.random() * 0.5 + 0.5),
    delay: Math.random() * 5000
  };
}


const sparkleTemplate = template(`<svg viewBox="0 0 7 7" xmlns="http://www.w3.org/2000/svg" height="1em" width="1em"><use href="#star-sparkle"></use></svg>`);
function renderSparkle(
  sparkle: Sparkle,
  {isDiv, containerSize, fixedScale}: {isDiv?: boolean, containerSize?: ContainerSize, fixedScale?: boolean} = {}
) {
  let element: HTMLElement;
  if(isDiv) {
    element = document.createElement('div');
    element.textContent = '✦';
  } else {
    element = sparkleTemplate() as HTMLElement;
  }

  element.classList.add('sparkles-sparkle');
  element.style.setProperty('--sparkle-tx', containerSize ? sparkle.translateX / 100 * containerSize.width + 'px' : sparkle.translateX + '%');
  element.style.setProperty('--sparkle-ty', containerSize ? sparkle.translateY / 100 * containerSize.height + 'px' : sparkle.translateY + '%');
  element.style.setProperty('--sparkle-scale', fixedScale ? sparkle.scale + '' : sparkle.scale * (Math.random() * 0.5 + 0.25) + '');
  element.style.setProperty('--sparkle-rotate', (Math.random() * 90 - 45) * 4 + 'deg');
  if(sparkle.minOpacity) element.style.setProperty('--sparkle-min-opacity', sparkle.minOpacity + '');
  element.style.transform = `scale(${sparkle.scale})`;
  element.style.top = containerSize ? sparkle.y / 100 * containerSize.height + 'px' : sparkle.y + '%';
  element.style.left = containerSize ? sparkle.x / 100 * containerSize.width + 'px' : sparkle.x + '%';
  element.style.animationDelay = '-' + sparkle.delay + 'ms';
  return element;
}

export type SparklesProps = Parameters<typeof renderSparkle>[1] &
  ({mode: 'button', sparkles?: Sparkle[], duration?: number} | {mode: 'progress', count: number});

export function Sparkles(props: SparklesProps): HTMLDivElement {
  const container = document.createElement('div');
  container.classList.add('sparkles-container');

  const sparkleOptions: Parameters<typeof renderSparkle>[1] = {
    ...props
  };

  if(props.mode === 'button') {
    if(props.duration) {
      container.style.setProperty('--sparkles-duration', props.duration + 'ms');
    }
    container.append(...(props.sparkles || BUTTON_SPARKLES).map((sparkle) => renderSparkle(sparkle, sparkleOptions)));
  } else {
    createEffect(on(() => props.count, (next, prev = 0) => {
      const diff = next - prev;
      if(diff > 0) {
        for(let i = 0; i < diff; i++) {
          container.appendChild(renderSparkle(generateProgressSparkle(), sparkleOptions));
        }
      } else if(diff < 0) {
        for(let i = 0; i < -diff; i++) {
          const div = container.lastChild as HTMLDivElement;
          div.remove();
        }
      }
    }));
  }

  return container;
}
