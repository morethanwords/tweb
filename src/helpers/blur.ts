import fastBlur from '../vendor/fastBlur';
import { fastRaf } from './schedulers';

const RADIUS = 2;
const ITERATIONS = 2;

export default function blur(dataUri: string, delay?: number) {
  return new Promise<string>((resolve) => {
    fastRaf(() => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d')!;

        ctx.drawImage(img, 0, 0);
        fastBlur(ctx, 0, 0, canvas.width, canvas.height, RADIUS, ITERATIONS);

        resolve(canvas.toDataURL());
      };

      if(delay) {
        setTimeout(() => {
          img.src = dataUri;
        }, delay);
      } else {
        img.src = dataUri;
      }
    });
  });
}
