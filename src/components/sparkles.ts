import {createEffect, on} from 'solid-js';

export interface Sparkle {
  x: number;
  y: number;
  translateX: number;
  translateY: number;
  scale: number;
  delay: number;
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
].map(it => ({
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
  }
}


function renderSparkle(sparkle: Sparkle) {
  const div = document.createElement('div');
  div.classList.add('sparkles-sparkle');
  div.style.setProperty('--sparkle-tx', sparkle.translateX + '%');
  div.style.setProperty('--sparkle-ty', sparkle.translateY + '%');
  div.style.transform = `scale(${sparkle.scale})`;
  div.style.top = sparkle.y + '%';
  div.style.left = sparkle.x + '%';
  div.style.animationDelay = '-' + sparkle.delay + 'ms';
  div.textContent = '✦'
  return div;
}

export type SparklesProps =
  | { mode: 'button' }
  | { mode: 'progress', count: number };

export function Sparkles(props: SparklesProps): HTMLDivElement {
  const container = document.createElement('div');
  container.classList.add('sparkles-container');

  if(props.mode === 'button') {
    container.append(...BUTTON_SPARKLES.map(renderSparkle));
  } else {
    createEffect(on(() => props.count, (next, prev = 0) => {
      const diff = next - prev;
      if(diff > 0) {
        for(let i = 0; i < diff; i++) {
          container.appendChild(renderSparkle(generateProgressSparkle()));
        }
      } else if(diff < 0) {
        for(let i = 0; i < -diff; i++) {
          const div = container.lastChild as HTMLDivElement;
          div.remove();
        }
      }
    }))
  }

  return container;
}
