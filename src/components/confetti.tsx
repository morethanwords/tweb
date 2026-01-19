import {Ref, onCleanup} from 'solid-js';
import classNames from '@helpers/string/classNames';

import styles from '@components/confetti.module.scss';

const COLORS = [
  '#FF8724', // orange
  '#CD89D0', // purple
  '#1E9AFF', // blue
  '#56CE6B', // green
  '#E8BC2C'  // yellow/gold
];

type ParticleShape = 'circle' | 'pill';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  shape: ParticleShape;
  size: number;
  rotation: number;
  rotationSpeed: number;
  flickerFrequency: number;
}

const GRAVITY = 800;
const AIR_RESISTANCE = 0.98;

function createParticle(
  x: number,
  y: number,
  vx: number,
  vy: number,
  size: number
): Particle {
  return {
    x,
    y,
    vx,
    vy,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: Math.random() > 0.5 ? 'circle' : 'pill',
    size: size + Math.random() * size,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
    flickerFrequency: 0.05 + Math.random() * 0.1
  };
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  frameCount: number
) {
  const {x, y, color, shape, size, rotation, flickerFrequency} = particle;

  const opacity = 0.7 + 0.3 * Math.abs(Math.sin(frameCount * flickerFrequency));

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;

  if(shape === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const width = size * 0.5;
    const height = size * 1.5;
    const radius = width / 2;

    ctx.beginPath();
    ctx.moveTo(-width / 2, -height / 2 + radius);
    ctx.arcTo(-width / 2, -height / 2, 0, -height / 2, radius);
    ctx.arcTo(width / 2, -height / 2, width / 2, -height / 2 + radius, radius);
    ctx.lineTo(width / 2, height / 2 - radius);
    ctx.arcTo(width / 2, height / 2, 0, height / 2, radius);
    ctx.arcTo(-width / 2, height / 2, -width / 2, height / 2 - radius, radius);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export type ConfettiMode = {
  mode: 'poppers';
  size?: number;
  speedScale?: number;
  count?: number;
}

export interface ConfettiRef {
  canvas: HTMLElement;
  create(options: ConfettiMode): () => void;
}

export function ConfettiContainer(props: {
  ref: Ref<ConfettiRef>;
  class?: string;
}) {
  let canvas!: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  const particles: Particle[] = [];
  let frameCount = 0;
  let lastTime = 0;
  let animationId: number | null = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  const resizeCanvas = () => {
    const rect = canvas.parentElement!.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  };

  const animate = (currentTime: number) => {
    if(lastTime === 0) lastTime = currentTime;
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    frameCount++;

    ctx.clearRect(0, 0, width, height);

    for(let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.vy += GRAVITY * dt;
      p.vx *= AIR_RESISTANCE;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed;

      if(p.y > height + 50) {
        particles.splice(i, 1);
        continue;
      }

      drawParticle(ctx, p, frameCount);
    }

    if(particles.length > 0) {
      animationId = requestAnimationFrame(animate);
    } else {
      animationId = null;
    }
  };

  const startAnimation = () => {
    if(animationId !== null) return;
    lastTime = 0;
    animationId = requestAnimationFrame(animate);
  };

  const create: ConfettiRef['create'] = (options) => {
    const {mode} = options;

    resizeCanvas();

    if(mode === 'poppers') {
      const {size = 6, speedScale = 1, count = 100} = options;
      const leftSpawnX = -10;
      const rightSpawnX = width + 10;
      const spawnY = height / 2;
      const spawnSpread = 50;

      for(let i = 0; i < count / 2; i++) {
        // -75deg to -15deg (centered at -45)
        const leftAngle = -Math.PI / 4 + (Math.random() - 0.5) * Math.PI / 3;
        const leftSpeed = (500 + Math.random() * 400) * speedScale;

        particles.push(createParticle(
          leftSpawnX,
          spawnY + (Math.random() - 0.5) * spawnSpread,
          Math.cos(leftAngle) * leftSpeed,
          Math.sin(leftAngle) * leftSpeed,
          size
        ));

        // -165deg to -105deg (centered at -135)
        const rightAngle = -Math.PI * 3 / 4 + (Math.random() - 0.5) * Math.PI / 3;
        const rightSpeed = (500 + Math.random() * 400) * speedScale;

        particles.push(createParticle(
          rightSpawnX,
          spawnY + (Math.random() - 0.5) * spawnSpread,
          Math.cos(rightAngle) * rightSpeed,
          Math.sin(rightAngle) * rightSpeed,
          size
        ));
      }
    }

    startAnimation();

    return () => {
      particles.length = 0;
      if(animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      ctx.clearRect(0, 0, width, height);
    };
  };

  const setContainerRef = (el: HTMLDivElement) => {
    (props.ref as any)({
      canvas: el,
      create
    });
  };

  const setCanvasRef = (el: HTMLCanvasElement) => {
    canvas = el;
    ctx = el.getContext('2d')!;
  };

  onCleanup(() => {
    if(animationId !== null) {
      cancelAnimationFrame(animationId);
    }
  });

  return (
    <div
      ref={setContainerRef}
      class={classNames(styles.container, props.class)}
    >
      <canvas ref={setCanvasRef} class={styles.canvas} />
    </div>
  );
}
